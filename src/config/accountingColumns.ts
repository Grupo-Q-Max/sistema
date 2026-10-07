import {companyExitAllowsPeriod} from './companyExit';
import { MONTH_NAMES, isColumnActive, isColumnComplete, isColumnFilled } from './columnVisibility';
import { latestOpenPeriod } from './competenceCalendar';
export const ACCOUNTING_API_VERSION=1;
export const MONTH_OPTIONS=['Pendente','COBRANÇA DOC.','DOC. REDE','OK - FINALIZADO','SEM MOVIMENTO'];
export const NOT_CLIENT='Não é cliente';
export const ACCOUNTING_COLUMNS=[
  {key:'cont_observacao',name:'Observações Contábil',inputType:'TEXTAREA',options:[],countsProgress:false,aliases:['Observações Contábeis','Observações contabil']},
  ...MONTH_NAMES.map((name,index)=>({key:`cont_mes_${String(index+1).padStart(2,'0')}`,name,inputType:'SELECT',options:MONTH_OPTIONS,countsProgress:true,aliases:[]})),
  {key:'cont_balancete',name:'Balancete',inputType:'TEXT',options:[],countsProgress:false,aliases:[]},
  {key:'cont_distribuicao_dirf',name:'Distribuição DIRF',inputType:'TEXT',options:[],countsProgress:false,aliases:[]},
  {key:'cont_defs',name:'DEFS',inputType:'SELECT',options:['Pendente','Enviado'],countsProgress:true,aliases:[]},
  {key:'cont_dasn',name:'DASN',inputType:'TEXT',options:[],countsProgress:false,aliases:[]},
  {key:'cont_ecd',name:'ECD',inputType:'SELECT',options:['Pendente','Enviado'],countsProgress:true,aliases:[]},
  {key:'cont_ecf',name:'ECF',inputType:'SELECT',options:['Pendente','Enviado'],countsProgress:true,aliases:[]},
];
export const LEGACY_ACCOUNTING_COLUMNS=['Importação Extratos Bancários','Conciliação Bancária & Caixa','Integração Fiscal x Contábil','Integração Folha x Contábil','Fechamento Balancete','ECD / ECF','Envio Relatórios Contábeis','Aviso Importante / Pendências'];
export function resolveAccountingKey(column:any):string|null {
  if(column.department!=='CONTABIL')return null;
  if(column.columnKey)return column.columnKey;
  return ACCOUNTING_COLUMNS.find(template=>[template.name,...template.aliases].some(name=>name.toLocaleLowerCase('pt-BR')===String(column.name||'').toLocaleLowerCase('pt-BR')))?.key||null;
}
export function accountingYear(now=new Date()):number {const period=latestOpenPeriod(now);return new Date(Date.UTC(period.getUTCFullYear(),period.getUTCMonth()+1,1)).getUTCFullYear();}
export function accountingMonth(column:any):number|null {const match=String(resolveAccountingKey(column)||'').match(/^cont_mes_(\d{2})$/);return match?Number(match[1]):null;}
export function isClientMonth(company:any,year:number,month:number):boolean {
  const period=new Date(Date.UTC(year,month-1,1));const next=new Date(Date.UTC(year,month,1));
  return (!company.obligationStartDate||new Date(company.obligationStartDate)<next)&&companyExitAllowsPeriod(company,period);
}
export function annualColumnActive(column:any,year:number):boolean {
  const month=accountingMonth(column);
  return month?isColumnActive(column,new Date(Date.UTC(year,month-1,1))):Array.from({length:12},(_,index)=>new Date(Date.UTC(year,index,1))).some(period=>isColumnActive(column,period));
}
export function annualValues(company:any,year:number,columns:any[],stored:Record<string,any>):Record<string,any> {
  const data={...stored};
  for(const column of columns){
    const key=resolveAccountingKey(column)||column.id;const month=accountingMonth(column);
    if(month){if(!isClientMonth(company,year,month))data[key]=NOT_CLIENT;else if(data[key]===undefined||data[key]===NOT_CLIENT)data[key]='Pendente';}
    else if(data[key]===undefined)data[key]=column.inputType==='SELECT'&&['cont_defs','cont_ecd','cont_ecf'].includes(key)?'Pendente':column.inputType==='CHECKBOX'?false:'';
  }
  return data;
}
export function accountingColumnComplete(column:any,value:any):boolean {
  const key=resolveAccountingKey(column)||column.id;
  if (accountingMonth(column)) {
    if (value === 'Não é cliente') return true;
    return isColumnComplete(column, value);
  }
  return ['cont_defs','cont_ecd','cont_ecf'].includes(key)?value==='Enviado'||value==='N/A':isColumnComplete(column,value);
}
export function accountingColumnReleased(column:any,year:number,latest:Date):boolean {
  const month=accountingMonth(column);
  return month?Date.UTC(year,month-1,1)<=latest.getTime():Array.from({length:12},(_,index)=>new Date(Date.UTC(year,index,1))).some(period=>period<=latest&&isColumnActive(column,period));
}
export function accountingProgress(company:any,year:number,columns:any[],data:Record<string,any>,latest=latestOpenPeriod()) {
  const tracked=columns.filter(column=>column.countsProgress&&annualColumnActive(column,year)&&accountingColumnReleased(column,year,latest)&&(accountingMonth(column)===null||isClientMonth(company,year,accountingMonth(column)!)));
  const progressDone=tracked.filter(column=>accountingColumnComplete(column,data[resolveAccountingKey(column)||column.id])).length;
  const started=tracked.some(column=>isColumnFilled(data[resolveAccountingKey(column)||column.id]));
  return {progressTotal:tracked.length,progressDone,calculatedStatus:tracked.length===0?'NOT_APPLICABLE':progressDone===tracked.length?'COMPLETED':started?'IN_PROGRESS':'PENDING',progressPercent:tracked.length?Math.round(progressDone/tracked.length*100):0};
}
