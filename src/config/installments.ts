import {latestOpenPeriod} from './competenceCalendar';
import {canUserEditCompany, canUserViewCompany} from './companyPermissions';

export type InstallmentRules={lateMode:'MONTH_TURN'|'DUE_DATE';lateMonthOffset:number;dueDay:number;dueMonthOffset:number};
export const DEFAULT_INSTALLMENT_RULES:InstallmentRules={lateMode:'MONTH_TURN',lateMonthOffset:2,dueDay:20,dueMonthOffset:1};

export function installmentAccess(user:any,edit=false):boolean {
  if(!user)return false;
  if(['ADMIN','SOCIO'].includes(user.role))return true;
  const permission=user.sectorPermissions?.find((item:any)=>item.sector==='PARCELAMENTO');
  return edit?permission?.access==='EDIT':['EDIT','VIEW'].includes(permission?.access);
}

export function canEditCompanyInstallment(user:any,company:any,plans:any[]=[]):boolean {
  if(!installmentAccess(user,true))return false;
  if(['ADMIN','SOCIO'].includes(user?.role))return true;
  const extraRespIds=plans.map((p:any)=>p?.responsibleId).filter(Boolean);
  return canUserEditCompany(user,company,'PARCELAMENTO',extraRespIds);
}

export function canViewCompanyInstallment(user:any,company:any,plans:any[]=[]):boolean {
  if(!installmentAccess(user,false))return false;
  if(['ADMIN','SOCIO'].includes(user?.role))return true;
  const extraRespIds=plans.map((p:any)=>p?.responsibleId).filter(Boolean);
  return canUserViewCompany(user,company,'PARCELAMENTO',extraRespIds);
}

export function canCreateInstallment(user:any):boolean {
  return installmentAccess(user,true)&&(['ADMIN','SOCIO'].includes(user.role)||user.screenPermissions?.some((permission:any)=>permission.screen==='installments-create'&&permission.allowed));
}

export function canConfigureInstallments(user:any):boolean {
  return ['ADMIN','SOCIO'].includes(user?.role)||(installmentAccess(user,true)&&Boolean(user?.screenPermissions?.some((permission:any)=>permission.screen==='settings-columns'&&permission.allowed)));
}

export function installmentHeaders(user:any):Record<string,string> {
  return {
    'Content-Type':'application/json',
    ...(user?.sessionToken ? { Authorization:`Bearer ${user.sessionToken}` } : {}),
    ...(user?.id ? { 'X-User-Id': String(user.id) } : {}),
  };
}
export function normalizeTypeName(name:string):string{return name.trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');}
export function moneyCents(value:any):number|null {const text=String(value??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;const [whole,fraction='']=text.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(cents)&&cents>0&&cents<=99999999999999?cents:null;}
export function decimalMoney(cents:number):string{return (cents/100).toFixed(2);}
export function inputMoney(value:string):string {const text=value.trim().replace(/R\$\s*/g,'').replace(/\s/g,'');return text.includes(',')?text.replace(/\./g,'').replace(',','.'): /^\d{1,3}(\.\d{3})+$/.test(text)?text.replace(/\./g,''):text;}
export function formatMoney(value:any):string {return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
export function validDate(value:any):Date|null {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const date=new Date(`${value}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;}
export function endOfPlan(start:Date,count:number):Date {const year=start.getUTCFullYear();const month=start.getUTCMonth()+count-1;const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();return new Date(Date.UTC(year,month,Math.min(start.getUTCDate(),last)));}
export function validateRules(rules:any):string|null {if(!rules||!['MONTH_TURN','DUE_DATE'].includes(rules.lateMode))return 'Escolha a regra de atraso.';if(!Number.isInteger(rules.lateMonthOffset)||rules.lateMonthOffset<1||rules.lateMonthOffset>12)return 'Informe de 1 a 12 meses para a virada de atraso.';if(!Number.isInteger(rules.dueDay)||rules.dueDay<1||rules.dueDay>31)return 'O dia de vencimento deve ser de 1 a 31.';if(!Number.isInteger(rules.dueMonthOffset)||rules.dueMonthOffset<0||rules.dueMonthOffset>12)return 'Informe de 0 a 12 meses para o vencimento.';return null;}
export function dayInBrasilia(now=new Date()):string {const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');}
export function scheduleItem(plan:any,number:number,rules:InstallmentRules,now=new Date(),payment?:any){
  const start=new Date(plan.startsAt);const period=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+number-1,1));
  const actual={...rules,lateMode:plan.lateMode||rules.lateMode,dueDay:plan.dueDay??rules.dueDay,dueMonthOffset:plan.dueMonthOffset??rules.dueMonthOffset,lateMonthOffset:plan.lateMonthOffset??rules.lateMonthOffset};
  const dueMonth=period.getUTCMonth()+actual.dueMonthOffset;const last=new Date(Date.UTC(period.getUTCFullYear(),dueMonth+1,0)).getUTCDate();const due=new Date(Date.UTC(period.getUTCFullYear(),dueMonth,Math.min(actual.dueDay,last)));
  const lateFrom=new Date(Date.UTC(period.getUTCFullYear(),period.getUTCMonth()+actual.lateMonthOffset,1));
  const cents=moneyCents(String(plan.totalAmount))||plan.installmentCount;const base=Math.floor(cents/plan.installmentCount);const amount=base+(number===plan.installmentCount?cents-base*plan.installmentCount:0);
  const overdue=actual.lateMode==='DUE_DATE'?dayInBrasilia(now)>due.toISOString().slice(0,10):dayInBrasilia(now)>=lateFrom.toISOString().slice(0,10);
  const paid=payment?.status==='PAID'||plan.status==='QUITADO';
  const status=paid?'PAID':payment?.status==='OVERDUE'||overdue?'OVERDUE':'PENDING';
  return {number,period:period.toISOString(),amount:decimalMoney(amount),dueDate:due.toISOString().slice(0,10),status,paidOn:payment?.paidOn?new Date(payment.paidOn).toISOString().slice(0,10):null,paidAmount:payment?.paidAmount===null||payment?.paidAmount===undefined?null:String(payment.paidAmount),note:payment?.note||'',updatedBy:payment?.updatedBy||null,editable:period.getTime()<=latestOpenPeriod(now).getTime(),settledInPlan:plan.status==='QUITADO'&&!payment?.paidOn};
}
export function planOverview(plan:any,payments:any[],rules:InstallmentRules,now=new Date()){
  const mapped=new Map<number,any>((payments||[]).map(item=>[item.installmentNumber,item]));
  const schedule=Array.from({length:plan.installmentCount},(_,index)=>scheduleItem(plan,index+1,rules,now,mapped.get(index+1)));
  const paid=schedule.filter(item=>item.status==='PAID').length;const overdue=schedule.filter(item=>item.status==='OVERDUE').length;
  const effectiveStatus=plan.status==='QUITADO'||paid===plan.installmentCount?'QUITADO':plan.status==='ATRASADO'||overdue?'ATRASADO':'ATIVO';
  return {schedule,paid,overdue,pending:schedule.length-paid-overdue,effectiveStatus};
}
export function companySituation(plans:any[],period:Date):{status:string;label:string;count:number} {
  const current=plans.flatMap(plan=>plan.schedule.filter((item:any)=>{
    const d=new Date(item.dueDate);
    return d.getUTCFullYear()===period.getUTCFullYear()&&d.getUTCMonth()===period.getUTCMonth();
  }));
  if(!plans.length)return {status:'NA',label:'N/A',count:0};
  const previousLate=plans.flatMap(plan=>plan.schedule).filter((item:any)=>new Date(item.period)<period&&item.status==='OVERDUE').length;
  if(previousLate)return {status:'OVERDUE',label:'Atrasos anteriores',count:current.length};
  const late=current.filter((item:any)=>item.status==='OVERDUE').length;
  if(late)return {status:'OVERDUE',label:`Atrasado${late>1?` (${late})`:''}`,count:current.length};
  if(!current.length)return {status:'NO_INSTALLMENT',label:'Sem parcela no mês',count:0};
  const pending=current.filter((item:any)=>item.status==='PENDING').length;
  if(pending)return {status:'PENDING',label:`Pendente${pending>1?` (${pending})`:''}`,count:current.length};
  return {status:'PAID',label:'Entregue',count:current.length};
}

/**
 * Calcula o progresso real do setor PARCELAMENTO para Dashboard (Visão Geral) e Analytics (Gráficos)
 * a partir dos planos e pagamentos reais da competência selecionada.
 */
export function computeInstallmentsProgress(
  rawPlans: any[],
  rawSetting: Partial<InstallmentRules> | null | undefined,
  monthStart: Date,
  allowedCompanyIds?: Set<string> | null
) {
  const rules: InstallmentRules = {
    ...DEFAULT_INSTALLMENT_RULES,
    ...(rawSetting?.lateMode ? { lateMode: rawSetting.lateMode } : {}),
    ...(typeof rawSetting?.lateMonthOffset === 'number' ? { lateMonthOffset: rawSetting.lateMonthOffset } : {}),
    ...(typeof rawSetting?.dueDay === 'number' ? { dueDay: rawSetting.dueDay } : {}),
    ...(typeof rawSetting?.dueMonthOffset === 'number' ? { dueMonthOffset: rawSetting.dueMonthOffset } : {}),
  };

  const y = monthStart.getUTCFullYear();
  const m = monthStart.getUTCMonth();

  const byCompany = new Map<string, any[]>();
  let totalFields = 0;
  let completedFields = 0;

  for (const rawPlan of rawPlans || []) {
    if (allowedCompanyIds && !allowedCompanyIds.has(rawPlan.companyId)) continue;
    if (!rawPlan.installmentCount || rawPlan.installmentCount < 1) continue;
    const overview = planOverview(rawPlan, rawPlan.payments || [], rules);
    const enriched = { ...rawPlan, ...overview };

    const list = byCompany.get(rawPlan.companyId);
    if (list) list.push(enriched);
    else byCompany.set(rawPlan.companyId, [enriched]);

    for (const item of overview.schedule) {
      const d = new Date(item.dueDate);
      if (d.getUTCFullYear() === y && d.getUTCMonth() === m) {
        totalFields++;
        if (item.status === 'PAID') completedFields++;
      }
    }
  }

  let total = 0;
  let completed = 0;
  let inProgress = 0;

  for (const [, companyPlans] of byCompany.entries()) {
    const sit = companySituation(companyPlans, monthStart);
    if (sit.status === 'NA' || sit.status === 'NO_INSTALLMENT') continue;
    total++;

    const monthItems = companyPlans.flatMap((p: any) =>
      p.schedule.filter((item: any) => {
        const d = new Date(item.dueDate);
        return d.getUTCFullYear() === y && d.getUTCMonth() === m;
      })
    );

    if (sit.status === 'PAID') {
      completed++;
    } else if (monthItems.some((item: any) => item.status === 'PAID')) {
      inProgress++;
    } else if (monthItems.length === 0 && sit.status === 'OVERDUE') {
      // Empresa sem parcela vencendo neste mês mas com parcela anterior atrasada pendente
      totalFields++;
    }
  }

  const pending = Math.max(0, total - completed - inProgress);
  const percent = totalFields > 0
    ? Math.round((completedFields / totalFields) * 100)
    : total > 0
    ? Math.round((completed / total) * 100)
    : 0;

  return {
    type: 'PARCELAMENTO' as const,
    total,
    completed,
    inProgress,
    pending,
    percent,
    totalFields,
    completedFields,
  };
}
