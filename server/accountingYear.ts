import {latestOpenPeriod} from '../src/config/competenceCalendar';
import {externalCompaniesExcluded} from '../src/config/installmentCompanies';
import { annualValues, accountingYear, accountingProgress } from '../src/config/accountingColumns';
export function createAccountingYearEngine(prisma:any,now:()=>Date=()=>new Date()) {
  let queue:Promise<any>=Promise.resolve();
  const syncedYears = new Map<number, number>();

  async function synchronize(year:number){
    if(!Number.isInteger(year)||year<1900||year>accountingYear(now()))throw new Error('Ano contábil inválido ou ainda não liberado.');
    const lastSync = syncedYears.get(year) || 0;
    const nowMs = Date.now();
    // Cache de 15 minutos para sincronização pesada do Contábil anual
    if (nowMs - lastSync < 15 * 60 * 1000) {
      const [companies, columns, closings] = await Promise.all([
        prisma.company.findMany({where:{AND:[externalCompaniesExcluded]},select:{id:true,code:true,name:true,cnpj:true,taxRegime:true,groupName:true,city:true,activeSectors:true,exitDate:true}}),
        prisma.departmentColumn.findMany({where:{department:'CONTABIL'},orderBy:{orderIndex:'asc'}}),
        prisma.closing.findMany({where:{type:'CONTABIL',referencePeriod:new Date(Date.UTC(year,0,1))}}),
      ]);
      return { createdCount: 0, companies, columns, closings };
    }

    const start=new Date(Date.UTC(year,0,1));const end=new Date(Date.UTC(year+1,0,1));
    const [companies,columns,existing]=await Promise.all([
      prisma.company.findMany({where:{AND:[externalCompaniesExcluded],OR:[{obligationStartDate:{lt:end},OR:[{exitDate:null},{exitDate:{gte:start}}]},{closings:{some:{type:'CONTABIL',referencePeriod:start}}}]},include:{responsibles:{include:{user:{select:{id:true,name:true,email:true}}}}}}),
      prisma.departmentColumn.findMany({where:{department:'CONTABIL'},orderBy:{orderIndex:'asc'}}),
      prisma.closing.findMany({where:{type:'CONTABIL',referencePeriod:{gte:start,lt:end}}}),
    ]);
    const annual=existing.filter((row:any)=>new Date(row.referencePeriod).getTime()===start.getTime());
    const historic=new Set(existing.map((row:any)=>row.companyId));
    const mapped=new Map<string,any>(annual.map((row:any)=>[row.companyId,row]));
    const eligible=companies.filter((company:any)=>!company.activeSectors||company.activeSectors==='TODOS'||company.activeSectors.split(',').map((item:string)=>item.trim()).includes('CONTABIL')||historic.has(company.id));
    const newRows=eligible.filter((company:any)=>!mapped.has(company.id)).map((company:any)=>({companyId:company.id,type:'CONTABIL',referencePeriod:start,status:'PENDING',columnsData:annualValues(company,year,columns,{})}));
    const result=newRows.length?await prisma.closing.createMany({data:newRows,skipDuplicates:true}):{count:0};
    const closings=result.count?await prisma.closing.findMany({where:{type:'CONTABIL',referencePeriod:start}}):annual;
    if(columns.length)for(const closing of closings){
      const company=eligible.find((item:any)=>item.id===closing.companyId);if(!company)continue;
      const data=annualValues(company,year,columns,closing.columnsData||{});
      const progress=accountingProgress(company,year,columns,data,latestOpenPeriod(now()));
      if(closing.status!==progress.calculatedStatus)await prisma.closing.updateMany({where:{id:closing.id,updatedAt:closing.updatedAt},data:{status:progress.calculatedStatus}});
    }
    syncedYears.set(year, Date.now());
    return {createdCount:result.count,companies:eligible,columns,closings};
  }
  function sync(year:number){const result=queue.catch(()=>{}).then(()=>synchronize(year));queue=result;return result;}
  return {sync,ensureAutomatic:()=>sync(accountingYear(now()))};
}
