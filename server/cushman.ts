import {companyExitAllowsPeriod,exitDecisionError,exitDecisionValue} from '../src/config/companyExit';
import {resolveAuthenticatedUser} from './installments';
import {queryClosingsBySectorAndRange} from './cleanClosingsSql';
import {CUSHMAN_API_VERSION,CUSHMAN_COLUMNS,CUSHMAN_COMPANY_FIELDS,resolveCushmanKey,cushmanAccess,cushmanCompanyAllowed,cushmanCompanyEditable,cushmanCompanyEligible,cushmanApplicableColumns,isCushmanCompany} from '../src/config/cushmanColumns';
import {periodIsOpen,blockedPeriodMessage} from '../src/config/competenceCalendar';
import {isColumnActive,calculateColumnProgress} from '../src/config/columnVisibility';
import {effectivePopup} from '../src/config/fiscalPopups';
import {validatePayrollValue} from '../src/config/payrollColumns';
import {validDate} from '../src/config/installments';
import {formatCompanyCode} from '../src/utils/codeSort';
const fail=(status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
function validPopupDate(value:any):boolean {
 if(typeof value!=='string')return false;
 const text=value.trim();if(!text)return false;
 if(validDate(text))return true;
 const br=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 return !!(br&&validDate(`${br[3]}-${br[2]}-${br[1]}`));
}
export function validateCushmanCompanyPatch(body:any,existing:any,encrypt:(value:any)=>any):any {
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Dados de cadastro inválidos.');
 const data:any={};
 for(const field of CUSHMAN_COMPANY_FIELDS){
  if(!Object.prototype.hasOwnProperty.call(body,field.key))continue;
  const value=body[field.key];
  if(field.type==='checkbox'){data[field.key]=Boolean(value);continue;}
  if(value===null||value===undefined){data[field.key]=null;continue;}
  if(typeof value!=='string')fail(400,`${field.label}: informe um texto válido.`);
  const text=value.trim();if(text.length>190)fail(400,`${field.label}: máximo de 190 caracteres.`);
  if(field.type==='date'){const parsed=text?validDate(text):null;if(text&&!parsed)fail(400,`${field.label}: data inválida.`);if(!parsed&&['contractDate','obligationStartDate'].includes(field.key))fail(400,`${field.label} é obrigatória.`);data[field.key]=parsed;}
  else if(field.type==='password'){const protectedValue=text?encrypt(text):null;data[field.key]=protectedValue;}
  else if(field.type==='url'){if(text){try{const url=new URL(text);if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{fail(400,'Link Prefeitura: informe uma URL começando com https:// ou http://.');}}data[field.key]=text||null;}
  else if(field.type==='certificate'){if(text&&text.length>60)fail(400,'Selecione um tipo de certificado válido.');data[field.key]=text||null;}
  else{if(['certificateIssue','certificateExpiration'].includes(field.key)&&text){const month=text.match(/^(\d{2})\/(\d{4})$/);const br=text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!(month&&Number(month[1])>=1&&Number(month[1])<=12&&Number(month[2])>=1900)&&!(br&&validDate(`${br[3]}-${br[2]}-${br[1]}`))&&!validDate(text))fail(400,`${field.label}: use MM/AAAA, DD/MM/AAAA ou AAAA-MM-DD.`);}data[field.key]=text||null;}
 }
 const start=data.obligationStartDate??existing.obligationStartDate,exit=data.exitDate!==undefined?data.exitDate:existing.exitDate;
 if(start&&exit&&new Date(exit)<new Date(start))fail(400,'A saída não pode ser anterior ao início da obrigação.');
 if(data.certificateExpiration || data.certificatePassword || data.certificateType){
  data.hasClientCertificate = true;
 } else if(data.hasClientCertificate === false){
  for(const key of ['certificateType','certificatePassword','certificateIssue','certificateExpiration'])data[key]=null;
 }
 const exitError=exitDecisionError(body,existing,data.exitDate);
 if(exitError)fail(400,exitError);
 if(body.exitDate!==undefined||body.exitMonthHasObligations!==undefined)data.exitMonthHasObligations=exitDecisionValue(body,existing,data.exitDate);
 return data;
}
export function validateCushmanPopup(column:any,value:any,key:string):string|null {
 if(value===null||value===''||typeof value==='string')return null;
 if(!value||typeof value!=='object'||Array.isArray(value))return 'Informações do popup inválidas.';
 const allowedActions:Record<string,string[]>={'N/A':['NA'],PENDENCIA:['PENDENCIA'],'OK - SEM MOVIMENTO':['SEM_MOV'],CONCLUIDO:['SALVAR','OK_DATA'],'OK - DATA':['OK_DATA','SALVAR'],PENDENTE:['LIMPAR']};
 const actions=allowedActions[value.status];if(!actions)return 'Situação inválida.';
 const popup=effectivePopup(column,key);if(!popup.actions.some(item=>actions.includes(item.id)&&item.enabled))return 'Esta ação está desativada na configuração da coluna.';
 if(value.data!==undefined&&(!value.data||typeof value.data!=='object'||Array.isArray(value.data)))return 'Campos do popup inválidos.';
 for(const [field,item] of Object.entries(value.data||{})){
  if(typeof item!=='string'&&typeof item!=='number'&&typeof item!=='boolean'&&item!==null)return `Campo inválido: ${field}`;
  const definition=popup.fields.find(candidate=>candidate.key===field);if(!definition)continue;const text=String(item??'').trim();
  if(text&&definition.type==='NUMBER'&&!Number.isFinite(Number(text)))return `Informe um número em ${definition.label}.`;
  if(text&&definition.type==='DATE'&&!validPopupDate(text))return `Data inválida em ${definition.label}.`;
  if(text&&definition.type==='SELECT'&&!definition.options.includes(text))return `Escolha uma opção em ${definition.label}.`;
 }
 if(value.status==='CONCLUIDO'){const missing=popup.fields.find(field=>field.required&&!String(value.data?.[field.key]??'').trim());if(missing)return `Preencha o campo: ${missing.label}`;}
 if(['CONCLUIDO','OK - DATA'].includes(value.status)&&popup.askDate&&!validPopupDate(value.completionDate))return 'Informe a data da conclusão.';
 if(value.status==='PENDENCIA'&&!String(value.pendingReason||'').trim())return 'Informe o motivo da pendência.';
 return null;
}
export function registerCushman(app:any,prisma:any,options:{sync:(period:Date)=>Promise<any>;encrypt:(value:any)=>any;decrypt:(value:any)=>any;pool?:any;onCompanyUpdated?:()=>void;onClosingUpdated?:()=>void}){
 const endpoint=(handler:any)=>async(req:any,res:any)=>{try{
  const user=await resolveAuthenticatedUser(prisma,req);
  if (!user) fail(401, 'Sua sessão expirou. Saia e entre novamente.');
  if (!user.active) fail(403, 'Usuário inativo.');
  if(!cushmanAccess(user))fail(403,'Sem acesso ao fechamento Cushman.');await handler(req,res,user);
 }catch(error:any){if(!error.status)console.error('Erro no Cushman:',error);res.status(error.status||500).json({error:error.status?error.message:'Não foi possível concluir a operação no Cushman.'});}};
 const reference=(query:any)=>{const year=Number(query.year),month=Number(query.month);if(!Number.isInteger(year)||year<1900||year>9999||!Number.isInteger(month)||month<1||month>12)fail(400,'Competência inválida.');const period=new Date(Date.UTC(year,month-1,1));if(!periodIsOpen(period))fail(423,blockedPeriodMessage(period));return period;};
 const safeCompany=(company:any)=>{const {certificatePassword,ginfessPassword,gissOnlinePassword,...safe}=company;return {...safe,code:formatCompanyCode(company.code)||null,certificatePasswordDecrypted:options.decrypt(certificatePassword),ginfessPasswordDecrypted:options.decrypt(ginfessPassword),gissOnlinePasswordDecrypted:options.decrypt(gissOnlinePassword)};};
 const companyAllowed=async(user:any,id:string)=>{const company=await prisma.company.findUnique({where:{id},include:{responsibles:true}});if(!company)fail(404,'Empresa não encontrada.');if(!cushmanCompanyAllowed(user,company))fail(403,'Empresa fora do seu acesso no Cushman.');return company;};
 app.get('/api/cushman-closings',endpoint(async(req:any,res:any,user:any)=>{
  const period=reference(req.query);const mode=req.query.companies||'CUSHMAN';if(!['CUSHMAN','ALL'].includes(mode))fail(400,'Filtro de empresas inválido.');
  const nextPeriod=new Date(Date.UTC(period.getUTCFullYear(),period.getUTCMonth()+1,1));
  let [companies,closings,storedColumns]=await Promise.all([
   prisma.company.findMany({omit:{legacyData:true},include:{responsibles:true},orderBy:[{code:'asc'},{name:'asc'}]}),
   queryClosingsBySectorAndRange(options.pool,prisma,'CUSHMAN',period,nextPeriod,{includeHasLegacy:true}),
   prisma.departmentColumn.findMany({where:{department:'CUSHMAN'},orderBy:{orderIndex:'asc'}}),
  ]);
  if(!closings.length){
   await options.sync(period);
   closings=await queryClosingsBySectorAndRange(options.pool,prisma,'CUSHMAN',period,nextPeriod,{includeHasLegacy:true});
  }else{
   void options.sync(period);
  }
  const columns=cushmanApplicableColumns(storedColumns,period);const mapped=new Map<string,any>(closings.map((closing:any)=>[closing.companyId,closing]));
  const missingCompanies=companies.filter((company:any)=>isCushmanCompany(company)&&!mapped.has(company.id)&&cushmanCompanyEligible(company,period));
  if(missingCompanies.length>0){
   const prevPeriod=new Date(Date.UTC(period.getUTCFullYear(),period.getUTCMonth()-1,1));
   const prevClosings=await queryClosingsBySectorAndRange(options.pool,prisma,'CUSHMAN',prevPeriod,period,{companyIds:missingCompanies.map((c:any)=>c.id)});
   const prevMap=new Map<string,any>(prevClosings.map((cl:any)=>[cl.companyId,cl]));
   const toCreate=missingCompanies.map((c:any)=>{
    const prev=prevMap.get(c.id);
    const initialData:Record<string,any>={};
    if(prev?.columnsData?.cush_observacao){
     initialData.cush_observacao=prev.columnsData.cush_observacao;
    }else if(c.notes&&(c.notesScope==='CUSHMAN'||c.notesScope==='GERAL'||!c.notesScope)){
     initialData.cush_observacao=c.notes;
    }
    return {
     companyId:c.id,
     type:'CUSHMAN',
     referencePeriod:period,
     status:'PENDING',
     columnsData:initialData,
    };
   });
   await prisma.closing.createMany({data:toCreate,skipDuplicates:true});
   const created=await queryClosingsBySectorAndRange(options.pool,prisma,'CUSHMAN',period,nextPeriod,{includeHasLegacy:true,companyIds:missingCompanies.map((c:any)=>c.id)});
   for(const cl of created)mapped.set(cl.companyId,cl);
  }
  const rows=companies.filter((company:any)=>{const cl=mapped.get(company.id);const hasLeg=Boolean(cl?.hasLegacy||cl?.columnsData?._legacy);const belongsToCushman=isCushmanCompany(company);if(!belongsToCushman)return false;return cushmanCompanyAllowed(user,company)&&companyExitAllowsPeriod(company,period)&&(mode==='ALL'||cushmanCompanyEligible(company,period)||hasLeg);}).map((company:any)=>{
   const closing=mapped.get(company.id);const hasLeg=Boolean(closing?.hasLegacy||closing?.columnsData?._legacy);const participates=cushmanCompanyEligible(company,period)||hasLeg;const data={...(closing?.columnsData||{})};delete data._legacy;
   for(const column of columns){const key=resolveCushmanKey(column)||column.id;if(column.inputType==='PASSWORD'&&data[key])data[key]=options.decrypt(data[key]);}
   if((!data.cush_observacao || data.cush_observacao === '') && (company.notesScope === 'CUSHMAN' || company.notesScope === 'GERAL' || !company.notesScope)){ data.cush_observacao = company.notes || ''; }
   const progress=calculateColumnProgress(participates?columns.filter((column:any)=>column.countsProgress):[],data,column=>resolveCushmanKey(column)||column.id);
   return {company:safeCompany(company),closingId:closing?.id||null,columnsData:data,participates,editable:cushmanCompanyEditable(user,company),...progress,calculatedStatus:participates?progress.calculatedStatus:'NOT_APPLICABLE',updatedAt:closing?.updatedAt||null};
  });
  res.json({cushmanApiVersion:CUSHMAN_API_VERSION,rows,columns,configured:CUSHMAN_COLUMNS.every(template=>storedColumns.some((column:any)=>column.columnKey===template.key)),access:{edit:cushmanAccess(user,true)}});
 }));
 app.put('/api/cushman-companies/:id',endpoint(async(req:any,res:any,user:any)=>{
  if(!cushmanAccess(user,true))fail(403,'Permissão somente de leitura no Cushman.');const company=await companyAllowed(user,req.params.id);if(!cushmanCompanyEditable(user,company))fail(403,'Você só pode editar empresas sob sua responsabilidade.');
  if(req.body.expectedUpdatedAt){
    const diff = Math.abs(new Date(req.body.expectedUpdatedAt).getTime() - new Date(company.updatedAt).getTime());
    if(diff > 5000) fail(409,'O cadastro foi alterado por outra pessoa. Atualize a tela antes de editar novamente.');
  }
  const data=validateCushmanCompanyPatch(req.body,company,options.encrypt);
  await prisma.company.update({where:{id:company.id},data});
  options.onCompanyUpdated?.();
  res.json({company:safeCompany(await prisma.company.findUnique({where:{id:company.id},omit:{legacyData:true},include:{responsibles:true}}))});
 }));
 app.put('/api/cushman-closings/:id/column',endpoint(async(req:any,res:any,user:any)=>{
  if(!cushmanAccess(user,true))fail(403,'Permissão somente de leitura no Cushman.');
  let closing=await prisma.closing.findUnique({where:{id:req.params.id}});
  if(!closing){
    const comp=await prisma.company.findUnique({where:{id:req.params.id}});
    if(comp){
      const period=req.query.period?new Date(req.query.period):(req.body.referencePeriod?new Date(req.body.referencePeriod):null);
      if(period){
        closing=await prisma.closing.findFirst({where:{companyId:comp.id,type:'CUSHMAN',referencePeriod:period}});
        if(!closing){
          closing=await prisma.closing.create({data:{companyId:comp.id,type:'CUSHMAN',referencePeriod:period,status:'PENDING',columnsData:{}}});
        }
      }
    }
  }
  if(!closing||closing.type!=='CUSHMAN')fail(404,'Fechamento Cushman não encontrado.');
  const company=await companyAllowed(user,closing.companyId);if(!cushmanCompanyEditable(user,company))fail(403,'Você só pode editar empresas sob sua responsabilidade.');const period=new Date(closing.referencePeriod);if(!periodIsOpen(period))fail(423,blockedPeriodMessage(period));if(!companyExitAllowsPeriod(company,period)||(!cushmanCompanyEligible(company,period)&&!closing.columnsData?._legacy))fail(403,'Esta empresa não tem obrigação Cushman nesta competência.');
  const {columnKey,columnValue,expectedUpdatedAt}=req.body;const columns=await prisma.departmentColumn.findMany({where:{department:'CUSHMAN'}});const column=columns.find((item:any)=>resolveCushmanKey(item)===columnKey);
  if(!column||!isColumnActive(column,period)||column.isEditable===false||column.inputType==='READONLY')fail(403,'Coluna indisponível para edição.');
  if(expectedUpdatedAt){
    const diff=Math.abs(new Date(expectedUpdatedAt).getTime()-new Date(closing.updatedAt).getTime());
    if(diff>5000)fail(409,'O fechamento foi alterado por outra pessoa. Atualize a tela antes de editar novamente.');
  }
  const error=column.inputType==='POPUP'?validateCushmanPopup(column,columnValue,columnKey):validatePayrollValue(column,columnValue);if(error)fail(400,error);
  const data={...(closing.columnsData||{}),[columnKey]:column.inputType==='PASSWORD'?options.encrypt(columnValue):columnValue};const progress=calculateColumnProgress(columns.filter((item:any)=>item.countsProgress&&isColumnActive(item,period)),data,column=>resolveCushmanKey(column)||column.id);
  const updated=await prisma.closing.updateMany({where:{id:closing.id},data:{columnsData:data,status:progress.calculatedStatus}});if(!updated.count)fail(409,'O fechamento mudou durante a edição. Atualize a tela.');
  options.onClosingUpdated?.();
  const fresh=await prisma.closing.findUnique({where:{id:closing.id}});const responseData={...(fresh.columnsData||{})};delete responseData._legacy;for(const item of columns)if(item.inputType==='PASSWORD'){const key=resolveCushmanKey(item)||item.id;if(responseData[key])responseData[key]=options.decrypt(responseData[key]);}
  res.json({closing:{...fresh,columnsData:responseData},...progress});
 }));
}
