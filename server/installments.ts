import {EXTERNAL_INSTALLMENT_SECTOR,normalizeCompanyCnpj,validateExternalInstallmentCompany} from '../src/config/installmentCompanies';
import crypto from 'node:crypto';
import {DEFAULT_INSTALLMENT_RULES,installmentAccess,canEditCompanyInstallment,canCreateInstallment,canConfigureInstallments,normalizeTypeName,moneyCents,decimalMoney,validDate,endOfPlan,validateRules,planOverview,companySituation,scheduleItem,dayInBrasilia} from '../src/config/installments';
import {normalizePeriod,periodIsOpen,blockedPeriodMessage} from '../src/config/competenceCalendar';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
export function getSessionSecret(): string {
  const explicit = (process.env.APP_SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  return crypto
    .createHash('sha256')
    .update('fechamento-session-v1:' + (process.env.ENCRYPTION_KEY || process.env.DATABASE_URL || 'fechamento-qmax-secret'))
    .digest('hex');
}
export function issueSession(userId:string,secret=getSessionSecret(),now=Date.now()):string {const payload=Buffer.from(JSON.stringify({sub:userId,exp:now+SESSION_TTL_MS})).toString('base64url');return payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url');}
export function sessionUser(token:string,secret=getSessionSecret(),now=Date.now()):string|null {try{if(!secret||!token)return null;const [payload,signature,...rest]=token.split('.');if(!payload||!signature||rest.length)return null;const expected=crypto.createHmac('sha256',secret).update(payload).digest();const actual=Buffer.from(signature,'base64url');if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;const data=JSON.parse(Buffer.from(payload,'base64url').toString());return typeof data.sub==='string'&&typeof data.exp==='number'&&data.exp>now?data.sub:null;}catch{return null;}}

const authUserCache = new Map<string, { ts: number; user: any }>();
export function invalidateAuthUserCache() {
  authUserCache.clear();
}
export async function resolveAuthenticatedUser(prisma: any, req: any): Promise<any | null> {
  const secret = getSessionSecret();
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  let userId = sessionUser(bearer, secret);
  if (!userId) {
    const fallbackId = String(req.headers['x-user-id'] || req.query?.userId || req.body?.userId || req.body?.actorId || '').trim();
    if (fallbackId) userId = fallbackId;
  }
  if (!userId) return null;

  const now = Date.now();
  const cached = authUserCache.get(userId);
  if (cached && now - cached.ts < 30_000) {
    return cached.user;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { sectorPermissions: true, screenPermissions: true, companyAccess: true, responsibleAssignments: true },
  });
  if (user) {
    authUserCache.set(userId, { ts: now, user });
  }
  return user;
}
export function installmentCompanyScope(user:any):any {
  if(['ADMIN','SOCIO'].includes(user.role)||user.companyScope==='ALL')return {};
  if(user.companyScope==='CUSTOM')return {id:{in:(user.companyAccess||[]).map((entry:any)=>entry.companyId)}};
  if(user.companyScope==='RESPONSIBLE')return {OR:[{responsibles:{some:{userId:user.id,OR:[{sector:null},{sector:{in:['FISCAL','PARCELAMENTO']}}]}}},{installmentPlans:{some:{responsibleId:user.id}}}]};
  return {id:{in:[]}};
}
function failure(status:number,message:string):never {throw Object.assign(new Error(message),{status});}
export function registerInstallments(app:any,prisma:any,options?:{onChanged?:()=>void}){
  const notifyChanged=()=>options?.onChanged?.();
  const endpoint=(handler:any)=>async(req:any,res:any)=>{try{
    const user=await resolveAuthenticatedUser(prisma,req);
    if(!user)failure(401,'Sua sessão precisa ser renovada. Saia e entre novamente para acessar parcelamentos.');
    if(!user.active)failure(403,'Usuário inativo.');
    if(!installmentAccess(user))failure(403,'Sem permissão para visualizar parcelamentos.');
    await handler(req,res,user);
  }catch(error:any){if(!error.status)console.error('Erro em parcelamentos:',error);res.status(error.status||500).json({error:error.status?error.message:'Não foi possível concluir a operação de parcelamento.'});}};
  async function companyAllowed(user:any,companyId:string){
    const company=await prisma.company.findUnique({where:{id:companyId},include:{responsibles:true}});if(!company)failure(404,'Empresa não encontrada.');
    if(['ADMIN','SOCIO'].includes(user.role)||user.companyScope==='ALL')return company;
    if(user.companyScope==='CUSTOM'&&user.companyAccess.some((access:any)=>access.companyId===companyId))return company;
    if(user.companyScope==='RESPONSIBLE'&&(user.responsibleAssignments.some((entry:any)=>entry.companyId===companyId&&(!entry.sector||['FISCAL','PARCELAMENTO'].includes(entry.sector)))||await prisma.installmentPlan.findFirst({where:{companyId,responsibleId:user.id}})))return company;
    failure(403,'Empresa fora do seu acesso.');
  }
  async function requireCompanyEdit(user:any,companyId:string,plans?:any[]){
    requireEdit(user);
    const company=await companyAllowed(user,companyId);
    if(['ADMIN','SOCIO'].includes(user.role))return company;
    const companyPlans=plans||await prisma.installmentPlan.findMany({where:{companyId},select:{responsibleId:true}});
    if(!canEditCompanyInstallment(user,company,companyPlans)){
      failure(403,'Você só pode editar parcelamentos das empresas em que é responsável.');
    }
    return company;
  }
  async function rules(){return {...DEFAULT_INSTALLMENT_RULES,...(await prisma.installmentSetting.findUnique({where:{id:'global'}})||{})};}
  const requireEdit=(user:any)=>{if(!installmentAccess(user,true))failure(403,'Permissão apenas de leitura para parcelamentos.');};
  const requireConfiguration=(user:any)=>{if(!canConfigureInstallments(user))failure(403,'Sem permissão para configurar parcelamentos.');};
  function reference(req:any){const year=Number(req.query.year),month=Number(req.query.month);if(!Number.isInteger(year)||year<1900||year>9999||!Number.isInteger(month)||month<1||month>12)failure(400,'Informe ano e mês válidos.');const period=new Date(Date.UTC(year,month-1,1));if(!periodIsOpen(period))failure(423,blockedPeriodMessage(period));return period;}
  async function formatted(plans:any[],configuration:any){
    const ids=Array.from(new Set(plans.flatMap(plan=>[plan.responsibleId,...plan.payments.map((payment:any)=>payment.updatedById)].filter(Boolean))));
    const people=ids.length?await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,name:true,email:true}}):[];
    return plans.map(plan=>({...plan,totalAmount:String(plan.totalAmount),responsible:people.find((person:any)=>person.id===plan.responsibleId)||null,payments:undefined,...planOverview(plan,plan.payments.map((payment:any)=>({...payment,updatedBy:people.find((person:any)=>person.id===payment.updatedById)||null})),configuration)}));
  }
  // Cadastro completo: não filtra por competência, saída ou setor Fiscal.
  app.get('/api/installments/companies',endpoint(async(req:any,res:any,user:any)=>{
    const query=String(req.query.q||'').trim().slice(0,120);const offset=Number(req.query.offset||0);
    if(!Number.isInteger(offset)||offset<0||offset>1000000)failure(400,'Página inválida.');
    const scope=installmentCompanyScope(user);
    const digits=query.replace(/\D/g,'');const search=query?{OR:[...['name','tradeName','code','cnpj','groupName'].map(field=>({[field]:{contains:query}})),...(digits.length>=3?[{cnpj:{contains:digits}}]:[]),...(normalizeCompanyCnpj(query).length>=3?[{cnpj:{contains:normalizeCompanyCnpj(query)}}]:[])]}:{};
    const companies=await prisma.company.findMany({where:{AND:[scope,search]},select:{id:true,code:true,name:true,tradeName:true,cnpj:true,exitDate:true,obligationStartDate:true,activeSectors:true},orderBy:[{name:'asc'},{id:'asc'}],skip:offset,take:51});
    res.json({companies:companies.slice(0,50),hasMore:companies.length>50,nextOffset:offset+50});
  }));
  app.get('/api/installments/plans',endpoint(async(req:any,res:any,user:any)=>{
    const period=reference(req);const offset=Number(req.query.offset||0);const takeLimit=Math.min(Math.max(Number(req.query.limit)||25,1),10000);const query=String(req.query.q||'').trim().slice(0,120);
    if(!Number.isInteger(offset)||offset<0||offset>1000000)failure(400,'Página inválida.');
    const scope=installmentCompanyScope(user);const normalized=normalizeCompanyCnpj(query);
    const search=query?{OR:[{typeName:{contains:query}},...['name','tradeName','code','cnpj','groupName'].map(field=>({company:{is:{[field]:{contains:query}}}})),...(normalized.length>=3?[{company:{is:{cnpj:{contains:normalized}}}}]:[])]}:{};
    const where={AND:[{company:{is:scope}},search]};
    const [stored,total,configuration]=await Promise.all([
      prisma.installmentPlan.findMany({where,include:{payments:true,company:{select:{id:true,name:true,tradeName:true,code:true,cnpj:true,activeSectors:true,responsibles:{select:{userId:true,sector:true}}}}},orderBy:[{createdAt:'desc'},{id:'asc'}],skip:offset,take:takeLimit}),
      prisma.installmentPlan.count({where}),rules(),
    ]);
    const plans=(await formatted(stored,configuration)).map((plan:any,idx:number)=>({...plan,canEdit:canEditCompanyInstallment(user,stored[idx]?.company,[stored[idx]])}));
    res.json({plans,total,hasMore:offset+plans.length<total,nextOffset:offset+takeLimit,period,access:{edit:installmentAccess(user,true),create:canCreateInstallment(user)}});
  }));
  app.post('/api/installments/companies',endpoint(async(req:any,res:any,user:any)=>{
    if(!canCreateInstallment(user))failure(403,'Sem autorização para cadastrar empresa para parcelamento.');
    const error=validateExternalInstallmentCompany(req.body);if(error)failure(400,error);
    const cnpj=normalizeCompanyCnpj(req.body.cnpj);const formattedCnpj=`${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`;
    if(await prisma.company.findFirst({where:{cnpj:{in:[cnpj,formattedCnpj]}}}))failure(409,'Este CNPJ já está cadastrado. Pesquise a empresa na lista; se não aparecer, peça acesso ao administrador.');
    const now=new Date();let company:any;
    try{company=await prisma.$transaction(async(tx:any)=>{
      const created=await tx.company.create({data:{name:req.body.name.trim(),cnpj,taxRegime:req.body.taxRegime,code:req.body.code?.trim()||null,tradeName:req.body.tradeName?.trim()||null,city:req.body.city?.trim()||null,groupName:req.body.groupName?.trim()||null,notes:req.body.notes?.trim()||null,notesScope:'PARCELAMENTO',activeSectors:EXTERNAL_INSTALLMENT_SECTOR,contractDate:now,obligationStartDate:now,exitDate:null}});
      await tx.companyResponsible.create({data:{companyId:created.id,userId:user.id,sector:'PARCELAMENTO'}});
      if(user.companyScope==='CUSTOM')await tx.userCompanyAccess.create({data:{companyId:created.id,userId:user.id}});
      return created;
    });}catch(error:any){if(error.code==='P2002')failure(409,'Este CNPJ já está cadastrado. Pesquise a empresa na lista.');throw error;}
    notifyChanged();
    res.status(201).json({company:{id:company.id,name:company.name,cnpj:company.cnpj,code:company.code,tradeName:company.tradeName,activeSectors:company.activeSectors}});
  }));
  app.get('/api/installments/company/:companyId',endpoint(async(req:any,res:any,user:any)=>{
    const company=await companyAllowed(user,req.params.companyId);const period=reference(req);const configuration=await rules();const stored=await prisma.installmentPlan.findMany({where:{companyId:req.params.companyId},include:{payments:true},orderBy:{startsAt:'asc'}});
    const plans=await formatted(stored,configuration);const [types,candidates]=await Promise.all([prisma.installmentType.findMany({orderBy:{name:'asc'}}),prisma.user.findMany({where:{active:true},include:{sectorPermissions:true}})]);
    const people=candidates.filter((person:any)=>installmentAccess(person,true)).map((person:any)=>({id:person.id,name:person.name,email:person.email}));
    const canEditThis=canEditCompanyInstallment(user,company,stored);
    res.json({plans,types,people,rules:configuration,period,access:{edit:canEditThis,create:canCreateInstallment(user)&&canEditThis},situation:companySituation(plans,period)});
  }));
  app.post('/api/installments/summary',endpoint(async(req:any,res:any,user:any)=>{
    const period=reference(req);if(!Array.isArray(req.body.companyIds)||req.body.companyIds.length>5000)failure(400,'Lista de empresas inválida.');const ids=Array.from(new Set(req.body.companyIds.filter((id:any)=>typeof id==='string')));
    const scope=new Set(user.companyAccess.map((access:any)=>access.companyId));
    if(user.companyScope==='RESPONSIBLE'){for(const entry of user.responsibleAssignments)if(!entry.sector||['FISCAL','PARCELAMENTO'].includes(entry.sector))scope.add(entry.companyId);for(const plan of await prisma.installmentPlan.findMany({where:{responsibleId:user.id,companyId:{in:ids}},select:{companyId:true}}))scope.add(plan.companyId);}
    const allowed:string[]=ids.filter((id:any)=>['ADMIN','SOCIO'].includes(user.role)||user.companyScope==='ALL'||scope.has(id)) as string[];
    const [rawPlans,currentRules]=await Promise.all([prisma.installmentPlan.findMany({where:{companyId:{in:allowed}},include:{payments:true}}),rules()]);
    const plans=await formatted(rawPlans,currentRules);
    const byCompany=new Map<string,any[]>();for(const p of plans){const list=byCompany.get(p.companyId);if(list)list.push(p);else byCompany.set(p.companyId,[p]);}
    const summaries=Object.fromEntries(allowed.map(id=>[id,companySituation(byCompany.get(id)||[],period)]));res.json({summaries});
  }));
  async function validatePlan(body:any,user:any,existing?:any){
    if(typeof body.typeName!=='string'||!body.typeName.trim()||body.typeName.trim().length>120)failure(400,'Informe o tipo do parcelamento (até 120 caracteres).');
    const cents=moneyCents(body.totalAmount);const count=Number(body.installmentCount);if(cents===null)failure(400,'Valor total inválido. Use até duas casas decimais.');if(!Number.isInteger(count)||count<1||count>1200||cents!<count)failure(400,'Informe de 1 a 1200 parcelas, com valor de pelo menos um centavo por parcela.');
    const start=validDate(body.startsAt);const end=validDate(body.endsAt);if(!start||!end||end<start||normalizePeriod(end).getTime()!==normalizePeriod(endOfPlan(start,count)).getTime())failure(400,'O fim deve estar no mês da última parcela, conforme início e quantidade.');
    if(!['ATIVO','ATRASADO','QUITADO'].includes(body.status))failure(400,'Status do parcelamento inválido.');
    const policy={...DEFAULT_INSTALLMENT_RULES,...(await rules()),...Object.fromEntries(['lateMode','lateMonthOffset','dueDay','dueMonthOffset'].filter(key=>body[key]!==null&&body[key]!==undefined&&body[key]!=='').map(key=>[key,['lateMonthOffset','dueDay','dueMonthOffset'].includes(key)?Number(body[key]):body[key]]))};const error=validateRules(policy);if(error)failure(400,error);
    if(body.responsibleId){const responsible=await prisma.user.findUnique({where:{id:body.responsibleId},include:{sectorPermissions:true}});if(!responsible?.active||!installmentAccess(responsible,true))failure(400,'Selecione um responsável ativo com permissão de editar parcelamentos.');}
    if(existing){const payments=await prisma.installmentPayment.findMany({where:{planId:existing.id}});if(payments.length&&(normalizePeriod(start).getTime()!==normalizePeriod(new Date(existing.startsAt)).getTime()||count!==existing.installmentCount||Number(existing.totalAmount)!==cents!/100))failure(409,'Há confirmações neste parcelamento. Início, quantidade e valor ficam protegidos para preservar o histórico.');}
    return {companyId:existing?.companyId||body.companyId,typeName:body.typeName.trim().replace(/\s+/g,' '),totalAmount:decimalMoney(cents!),installmentCount:count,startsAt:start,endsAt:end,status:body.status,responsibleId:body.responsibleId||null,lateMode:body.lateMode||null,lateMonthOffset:body.lateMonthOffset===null||body.lateMonthOffset===undefined||body.lateMonthOffset===''?null:Number(body.lateMonthOffset),dueDay:body.dueDay===null||body.dueDay===undefined||body.dueDay===''?null:Number(body.dueDay),dueMonthOffset:body.dueMonthOffset===null||body.dueMonthOffset===undefined||body.dueMonthOffset===''?null:Number(body.dueMonthOffset)};
  }
  app.post('/api/installments/plans',endpoint(async(req:any,res:any,user:any)=>{
    if(!canCreateInstallment(user))failure(403,'Sem autorização para criar parcelamentos.');await requireCompanyEdit(user,String(req.body.companyId||''));const data=await validatePlan(req.body,user);
    const plan=await prisma.$transaction(async(tx:any)=>{await tx.installmentType.upsert({where:{nameKey:normalizeTypeName(data.typeName)},create:{name:data.typeName,nameKey:normalizeTypeName(data.typeName)},update:{}});const created=await tx.installmentPlan.create({data:{...data,createdById:user.id}});await tx.installmentEvent.create({data:{planId:created.id,action:'CREATE_PLAN',actorId:user.id,data:{...data,startsAt:data.startsAt!.toISOString(),endsAt:data.endsAt!.toISOString()}}});return created;});
    notifyChanged();
    res.status(201).json({plan});
  }));
  app.put('/api/installments/plans/:id',endpoint(async(req:any,res:any,user:any)=>{
    requireEdit(user);const existing=await prisma.installmentPlan.findUnique({where:{id:req.params.id}});if(!existing)failure(404,'Parcelamento não encontrado.');await requireCompanyEdit(user,existing.companyId,[existing]);const data=await validatePlan(req.body,user,existing);
    const updated=await prisma.$transaction(async(tx:any)=>{await tx.$queryRawUnsafe('SELECT `id` FROM `InstallmentPlan` WHERE `id` = ? FOR UPDATE',existing.id);const latest=await tx.installmentPlan.findUnique({where:{id:existing.id}});if(new Date(latest.updatedAt).getTime()!==new Date(existing.updatedAt).getTime())failure(409,'Cadastro alterado por outro usuário. Atualize a lista.');await validatePlan(req.body,user,latest);await tx.installmentType.upsert({where:{nameKey:normalizeTypeName(data.typeName)},create:{name:data.typeName,nameKey:normalizeTypeName(data.typeName)},update:{}});const plan=await tx.installmentPlan.update({where:{id:existing.id},data});await tx.installmentEvent.create({data:{planId:plan.id,action:'EDIT_PLAN',actorId:user.id,data:{before:JSON.parse(JSON.stringify(existing)),after:JSON.parse(JSON.stringify(plan))}}});return plan;});
    notifyChanged();
    res.json({plan:updated});
  }));
  app.put('/api/installments/plans/:id/payments/:number',endpoint(async(req:any,res:any,user:any)=>{
    requireEdit(user);const plan=await prisma.installmentPlan.findUnique({where:{id:req.params.id}});if(!plan)failure(404,'Parcelamento não encontrado.');await requireCompanyEdit(user,plan.companyId,[plan]);const number=Number(req.params.number);if(!Number.isInteger(number)||number<1||number>plan.installmentCount)failure(400,'Número de parcela inválido.');
    const item=scheduleItem(plan,number,await rules());if(!item.editable)failure(423,blockedPeriodMessage(new Date(item.period)));if(plan.status==='QUITADO')failure(409,'A quitação está declarada no cadastro. Altere o status do parcelamento para reabrir uma parcela.');
    if(!['PENDING','PAID','OVERDUE'].includes(req.body.status))failure(400,'Situação de parcela inválida.');const paidOn=req.body.status==='PAID'?validDate(req.body.paidOn):null;if(req.body.status==='PAID'&&(!paidOn||paidOn.toISOString().slice(0,10)>dayInBrasilia()))failure(400,'Informe a data real do pagamento, sem data futura.');
    const paidCents=req.body.status==='PAID'?moneyCents(req.body.paidAmount||item.amount):null;if(req.body.status==='PAID'&&paidCents===null)failure(400,'Valor pago inválido.');if(req.body.note!==undefined&&(typeof req.body.note!=='string'||req.body.note.length>4000))failure(400,'Observação inválida (máximo 4000 caracteres).');
    const data={status:req.body.status,paidOn,paidAmount:paidCents===null?null:decimalMoney(paidCents),note:req.body.note||'',updatedById:user.id};
    const payment=await prisma.$transaction(async(tx:any)=>{await tx.$queryRawUnsafe('SELECT `id` FROM `InstallmentPlan` WHERE `id` = ? FOR UPDATE',plan.id);const latest=await tx.installmentPlan.findUnique({where:{id:plan.id}});if(new Date(latest.updatedAt).getTime()!==new Date(plan.updatedAt).getTime())failure(409,'Cadastro alterado. Atualize a lista antes de confirmar o pagamento.');const previous=await tx.installmentPayment.findUnique({where:{planId_installmentNumber:{planId:plan.id,installmentNumber:number}}});const next=await tx.installmentPayment.upsert({where:{planId_installmentNumber:{planId:plan.id,installmentNumber:number}},create:{planId:plan.id,installmentNumber:number,...data},update:data});await tx.installmentEvent.create({data:{planId:plan.id,installmentNumber:number,action:'PAYMENT_STATUS',actorId:user.id,data:{before:previous?JSON.parse(JSON.stringify(previous)):null,after:JSON.parse(JSON.stringify(next))}}});return next;});
    notifyChanged();
    res.json({payment});
  }));
  app.get('/api/installments/plans/:id/events',endpoint(async(req:any,res:any,user:any)=>{const plan=await prisma.installmentPlan.findUnique({where:{id:req.params.id}});if(!plan)failure(404,'Parcelamento não encontrado.');await companyAllowed(user,plan.companyId);const events=await prisma.installmentEvent.findMany({where:{planId:plan.id},orderBy:{createdAt:'desc'},take:100});const ids=Array.from(new Set(events.map((event:any)=>event.actorId)));const users=await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,name:true,email:true}});res.json({events:events.map((event:any)=>({...event,actor:users.find((person:any)=>person.id===event.actorId)||null}))});}));
  app.get('/api/installments/settings',endpoint(async(_req:any,res:any,user:any)=>{
    requireConfiguration(user);
    const [currentRules,types,planTypeCounts]=await Promise.all([
      rules(),
      prisma.installmentType.findMany({orderBy:{name:'asc'}}),
      prisma.installmentPlan.groupBy({by:['typeName'],_count:{_all:true}}).catch(()=>[]),
    ]);
    const countMap=new Map<string,number>(planTypeCounts.map((entry:any)=>[normalizeTypeName(entry.typeName||''),Number(entry._count?._all||0)]));
    res.json({
      rules:currentRules,
      types:types.map((t:any)=>({...t,usageCount:countMap.get(t.nameKey)||0})),
    });
  }));
  app.put('/api/installments/settings',endpoint(async(req:any,res:any,user:any)=>{
    requireConfiguration(user);const error=validateRules(req.body);if(error)failure(400,error);
    const {lateMode,lateMonthOffset,dueDay,dueMonthOffset}=req.body;
    const configuration=await prisma.installmentSetting.upsert({where:{id:'global'},create:{id:'global',lateMode,lateMonthOffset,dueDay,dueMonthOffset},update:{lateMode,lateMonthOffset,dueDay,dueMonthOffset}});
    notifyChanged();
    res.json({rules:configuration});
  }));
  // CRUD de Tipos de Parcelamento
  app.post('/api/installments/types',endpoint(async(req:any,res:any,user:any)=>{
    requireConfiguration(user);
    const rawName=typeof req.body?.name==='string'?req.body.name.trim().replace(/\s+/g,' '):'';
    if(!rawName||rawName.length>120)failure(400,'Informe o nome do tipo de parcelamento (até 120 caracteres).');
    const nameKey=normalizeTypeName(rawName);
    const existing=await prisma.installmentType.findUnique({where:{nameKey}});
    if(existing)failure(409,'Já existe um tipo de parcelamento com este nome.');
    const created=await prisma.installmentType.create({data:{name:rawName,nameKey}});
    res.status(201).json({type:{...created,usageCount:0}});
  }));
  app.put('/api/installments/types/:id',endpoint(async(req:any,res:any,user:any)=>{
    requireConfiguration(user);
    const existing=await prisma.installmentType.findUnique({where:{id:req.params.id}});
    if(!existing)failure(404,'Tipo de parcelamento não encontrado.');
    const rawName=typeof req.body?.name==='string'?req.body.name.trim().replace(/\s+/g,' '):'';
    if(!rawName||rawName.length>120)failure(400,'Informe o nome do tipo de parcelamento (até 120 caracteres).');
    const nameKey=normalizeTypeName(rawName);
    const conflict=await prisma.installmentType.findUnique({where:{nameKey}});
    if(conflict&&conflict.id!==existing.id)failure(409,'Já existe outro tipo com este nome.');
    const updatePlans=req.body?.updatePlans!==false;
    const updated=await prisma.$transaction(async(tx:any)=>{
      const type=await tx.installmentType.update({where:{id:existing.id},data:{name:rawName,nameKey}});
      if(updatePlans&&existing.name!==rawName){
        await tx.installmentPlan.updateMany({where:{typeName:existing.name},data:{typeName:rawName}});
      }
      return type;
    });
    notifyChanged();
    res.json({type:updated});
  }));
  app.delete('/api/installments/types/:id',endpoint(async(req:any,res:any,user:any)=>{
    requireConfiguration(user);
    const existing=await prisma.installmentType.findUnique({where:{id:req.params.id}});
    if(!existing)failure(404,'Tipo de parcelamento não encontrado.');
    await prisma.installmentType.delete({where:{id:existing.id}});
    res.json({success:true});
  }));
}
