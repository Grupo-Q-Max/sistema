import {document,companyData,monthlyData,annualData,sectors} from './convert';
import type {LegacyRow} from './sqlDump';
import {isColumnActive,calculateColumnProgress} from '../../src/config/columnVisibility';
import {resolveColumnKey} from '../../src/config/payrollColumns';
import {accountingProgress} from '../../src/config/accountingColumns';
import {companyQuality} from '../../src/config/companyQuality';
import {latestOpenPeriod} from '../../src/config/competenceCalendar';

export function makePlan(tables:Record<string,LegacyRow[]>,year:number){
 const months=new Map(tables.controle_meses.map(row=>[row.id!,row]));
 const groups=new Map<string,LegacyRow[]>();let sourceRows=0;
 for(const row of tables.controle_fechamento){
  const month=months.get(row.id_mes||'');if(!month)throw Error('Registro sem competência identificada.');
  if(Number(month.ano)!==year)continue;
  const number=Number(month.mes);if(!Number.isInteger(number)||number<1||number>12)throw Error('Mês inválido no legado.');
  sourceRows++;const key=document(row.cnpj);if(!key)throw Error('Cadastro sem documento.');
  const list=groups.get(key)||[];list.push(row);groups.set(key,list);
 }
 if(!groups.size)throw Error('O arquivo não contém registros do ano escolhido.');
 const plans=[...groups.entries()].map(([key,rows])=>{
  rows.sort((a,b)=>Number(months.get(a.id_mes!)!.mes)-Number(months.get(b.id_mes!)!.mes)||Number(a.id)-Number(b.id));
  const latest=rows[rows.length-1],data=companyData(latest,value=>value?String(value):null),seen=new Set<string>();
  for(const row of rows){const period=Number(months.get(row.id_mes!)!.mes);const key=String(period);
   if(seen.has(key))throw Error('Documento duplicado na mesma competência após normalização.');seen.add(key);
  }
  return {document:key,rows,latest,data};
 });
 return {months,plans,sourceRows,year};
}

// Identity uses the business period; no JavaScript parsing of database dates.
function closingKey(type:string,period:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||Number(period.slice(0,4))<1900)
  throw Error('Competência inválida em um fechamento existente: '+String(period));
 return type+':'+(type==='CONTABIL'?period.slice(0,4):period);
}

export async function importLegacy(prisma:any,plan:ReturnType<typeof makePlan>,options:{apply:boolean;protect:(value:any)=>string|null;archive:(value:any)=>string;journal:(value:any)=>Promise<void>;now?:Date}){
 const existing=await prisma.company.findMany(),map=new Map<string,any>();
 for(const company of existing){const key=document(company.cnpj);if(map.has(key))throw Error('Documentos duplicados no novo banco após normalização.');map.set(key,company);}
 const definitions=await prisma.departmentColumn.findMany();
 for(const sector of ['FISCAL','DP','CONTABIL','CUSHMAN'])
  if(!definitions.some((column:any)=>column.department===sector&&column.isActive!==false))throw Error('Configure as colunas de '+sector+' antes da importação.');
 const stats={sourceRows:plan.sourceRows,companies:plan.plans.length,createdCompanies:0,preservedCompanies:0,createdClosings:0,mergedClosings:0,skippedClosings:0,preservedFields:0,futureClosings:0,companiesWithIssues:0,missingDates:0};
 const notices:any[]=[],latest=latestOpenPeriod(options.now);
 for(const item of plan.plans){
  let stage='preparar cadastro';
  try{
   const prior=map.get(item.document),data=prior||companyData(item.latest,options.protect);
   const issues=companyQuality(data,options.now);
   if(issues.length)stats.companiesWithIssues++;
   if(issues.some(issue=>['contractDate','obligationStartDate'].includes(issue.key)))stats.missingDates++;
   notices.push({document:item.document,name:data.name,existing:!!prior,issues});
   if(prior)stats.preservedCompanies++;else stats.createdCompanies++;
   const run=async(tx:any)=>{
    stage='consultar competências existentes';
    // DATE_FORMAT returns text, avoiding invalid Date objects from the adapter.
    // The company id is a bound parameter; no source SQL is executed.
    const before: any[]=prior?await tx.$queryRawUnsafe(
     "SELECT `id`, `type`, DATE_FORMAT(`referencePeriod`, '%Y-%m') AS `periodKey` FROM `Closing` WHERE `companyId` = ?",prior.id):[];
    const destinations=new Map<string,any>();
    for(const closing of before){
     stage='validar competência do fechamento '+closing.id;
     const key=closingKey(closing.type,String(closing.periodKey??''));
     if(destinations.has(key))throw Error('Há mais de um fechamento existente para '+key+'. Nenhum registro foi apagado.');
     destinations.set(key,closing);
    }
    const sources:Array<{type:string;period:Date;rows:LegacyRow[]}>=[];
    for(const row of item.rows){
     const month=Number(plan.months.get(row.id_mes!)!.mes),period=new Date(Date.UTC(plan.year,month-1,1));
     for(const sector of sectors(row))if(sector!=='CONTABIL')sources.push({type:sector,period,rows:[row]});
    }
    const annualRows=item.rows.filter(row=>sectors(row).includes('CONTABIL'));
    if(annualRows.length)sources.push({type:'CONTABIL',period:new Date(Date.UTC(plan.year,0,1)),rows:annualRows});
    const sourceKeys=new Set<string>();
    for(const source of sources){const key=closingKey(source.type,source.period.toISOString().slice(0,7));
     if(sourceKeys.has(key))throw Error('Fechamento repetido na origem: '+key);sourceKeys.add(key);
    }
    // Existing company records are never updated, including legacy metadata.
    stage='criar cadastro ausente';
    let company=prior;
    if(!company&&options.apply)company=await tx.company.create({data:{...data,legacyData:{version:1,source:'controle_fechamento',year:plan.year,sourceRowIds:item.rows.map(row=>row.id),missingContractDate:!data.contractDate,missingObligationDate:!data.obligationStartDate}}});
    const id=company?.id||'simulation:'+item.document;
    const journal:any={document:item.document,createdCompany:!prior,companyId:id,companyUpdatedAt:company?.updatedAt,metadataChanged:false,priorMetadata:null,changes:[],skippedClosings:0};
    for(const source of sources){
     const key=closingKey(source.type,source.period.toISOString().slice(0,7));stage='processar '+key;
     if(source.type!=='CONTABIL'&&source.period>latest)stats.futureClosings++;
     if(destinations.has(key)){stats.skippedClosings++;journal.skippedClosings++;continue;}
     let columnsData:Record<string,any>;
     if(source.type==='CONTABIL'){
      columnsData=annualData(source.rows,options.protect);
      columnsData._legacy=options.archive({version:1,sourceRecords:source.rows.map(row=>({period:new Date(Date.UTC(plan.year,Number(plan.months.get(row.id_mes!)!.mes)-1,1)).toISOString(),row:monthlyData(row,'CONTABIL',options.protect)._legacy.row}))});
     }else{
      columnsData=monthlyData(source.rows[0],source.type,options.protect);columnsData._legacy=options.archive(columnsData._legacy);
     }
     const columns=definitions.filter((column:any)=>column.department===source.type&&column.countsProgress&&isColumnActive(column,source.period));
     const progress=source.type==='CONTABIL'?accountingProgress(company||data,plan.year,definitions.filter((c:any)=>c.department==='CONTABIL'),columnsData,latest):calculateColumnProgress(columns,columnsData,column=>resolveColumnKey(column)||column.id);
     stats.createdClosings++;
     if(options.apply){
      const createData:any={companyId:id,type:source.type,referencePeriod:source.period,columnsData,status:progress.calculatedStatus};
      if(source.type==='DP')createData.dashboardMetrics={employees:Number(columnsData.dp_qtde_funcionarios)||0};
      const saved=await tx.closing.create({data:createData});
      journal.changes.push({id:saved.id,created:true,before:null,afterUpdatedAt:saved.updatedAt});
     }
     destinations.set(key,{id:'planned'});
    }
    return journal;
   };
   stage='executar transação';
   const journal=options.apply?await prisma.$transaction(run,{timeout:120000,maxWait:10000}):await run(prisma);
   // Write the journal only after a successful commit.
   if(options.apply){stage='registrar diário após confirmação da transação';await options.journal(journal);}
  }catch(error){
   const cause=error instanceof Error?error:new Error(String(error));
   const wrapped=new Error('CNPJ/CPF '+item.document+'; etapa: '+stage+'; '+cause.message);
   wrapped.stack=(wrapped.stack||wrapped.message)+'\nCausa original:\n'+(cause.stack||cause.message);throw wrapped;
  }
 }
 return {year:plan.year,mode:options.apply?'APPLIED':'SIMULATION',stats,companies:notices,notes:[
  'Cadastros existentes não são alterados.','Fechamentos existentes são ignorados integralmente; somente os ausentes são criados.',
  'Fiscal, DP e Cushman são identificados por empresa, setor e mês; Contábil por empresa e ano.',
  'Datas ausentes continuam nulas e são listadas nos avisos.','Competências futuras são armazenadas; a API mantém o bloqueio de calendário.',
  'Responsáveis e parcelamentos não estão neste arquivo e não são inventados.',
  'O arquivo contém os estados dos popups; conteúdo de outras tabelas de detalhes não está incluído.'
 ]};
}
