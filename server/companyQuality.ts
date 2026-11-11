import {resolveAuthenticatedUser} from './installments';
import {companyQuality} from '../src/config/companyQuality';

let qualityCache: { ts: number; items: any[]; summary: any; generatedAt: string } | null = null;
export function invalidateCompanyQualityCache() {
  qualityCache = null;
}

export function registerCompanyQuality(app:any,prisma:any,decrypt:(value:any)=>any){
 const endpoint=(handler:any)=>async(req:any,res:any)=>{try{
  const user=await resolveAuthenticatedUser(prisma,req);
  if(!user)return res.status(401).json({error:'Saia e entre novamente para renovar sua sessão.'});
  if(!user.active||!['ADMIN','SOCIO'].includes(user.role))return res.status(403).json({error:'Acesso exclusivo do administrador ou sócio.'});
  await handler(req,res);
 }catch(error){console.error('Erro ao consultar pendências cadastrais',error);res.status(500).json({error:'Não foi possível consultar as pendências.'});}};
 app.get('/api/admin/company-quality',endpoint(async(req:any,res:any)=>{
  const nowMs=Date.now();
  if(!qualityCache||nowMs-qualityCache.ts>60_000){
   const companies=await prisma.company.findMany({where:{deletedAt:null},select:{id:true,name:true,code:true,cnpj:true,taxRegime:true,city:true,contractDate:true,obligationStartDate:true,exitDate:true,hasClientCertificate:true,certificateType:true,certificateExpiration:true,certificatePassword:true,legacyData:true},orderBy:[{name:'asc'}]});
   const items=companies.map((company:any)=>{const {certificatePassword,legacyData,...safe}=company;return {company:{...safe,legacyData:legacyData?true:null},issues:companyQuality(company),active:!company.exitDate||new Date(company.exitDate)>=new Date()};});
   const issues=items.flatMap((item:any)=>item.issues);const summary={companies:items.length,affected:items.filter((item:any)=>item.issues.length).length,errors:issues.filter((item:any)=>item.severity==='ERROR').length,warnings:issues.filter((item:any)=>item.severity==='WARNING').length,missingDates:items.filter((item:any)=>item.issues.some((issue:any)=>['contractDate','obligationStartDate'].includes(issue.key))).length,noCertificate:items.filter((item:any)=>item.issues.some((issue:any)=>issue.key==='noCertificate')).length};
   qualityCache={ts:nowMs,items,summary,generatedAt:new Date().toISOString()};
  }
  res.json({...(req.query.summary==='1'?{}:{items:qualityCache.items}),summary:qualityCache.summary,generatedAt:qualityCache.generatedAt});
 }));
 app.get('/api/admin/company-quality/:id/history',endpoint(async(req:any,res:any)=>{
  const records=await prisma.closing.findMany({where:{companyId:String(req.params.id)},select:{type:true,referencePeriod:true,columnsData:true},orderBy:{referencePeriod:'desc'}});
  const mask=(value:any):any=>Array.isArray(value)?value.map(mask):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,/senha|password|secret|token/i.test(key)?item?'Conteúdo protegido':null:mask(item)])):value;
  const decoded=records.map((record:any)=>{let original=record.columnsData?._legacy;if(typeof original==='string'){try{original=JSON.parse(decrypt(original));}catch{original={aviso:'Não foi possível abrir o registro original com a chave de criptografia atual.'};}}return {...record,original};});
  res.json({records:decoded.filter((record:any)=>record.original).flatMap((record:any)=>record.original.sourceRecords?record.original.sourceRecords.map((source:any)=>({sector:record.type,period:source.period,original:mask({row:source.row})})):[{sector:record.type,period:record.referencePeriod,original:mask(record.original)}])});
 }));
}
