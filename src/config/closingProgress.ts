import {isColumnComplete,isColumnFilled,isColumnActive} from './columnVisibility';
import {accountingMonth,isClientMonth,NOT_CLIENT,accountingColumnComplete,annualColumnActive,accountingColumnReleased} from './accountingColumns';
import {resolveColumnKey} from './payrollColumns';
import {effectivePopup} from './fiscalPopups';
export type ProgressRecord={id:string;name:string;code:string;value:string;status:string;complete:boolean;filled:boolean;eligible:boolean;blocked:boolean};
export type ProgressColumn={key:string;name:string;tracked:boolean;total:number;done:number;filled:number;percent:number;records:ProgressRecord[]};
const statusLabels:Record<string,string>={CONCLUIDO:'Concluído',SEM_MOVIMENTO:'Sem movimento','OK - DATA':'Concluído com data','OK - SEM MOVIMENTO':'Sem movimento','N/A':'N/A',PENDENTE:'Pendente',PENDENCIA:'Pendência','PENDÊNCIA':'Pendência'};
export function displayProgressValue(value:any,column:any,key:string):string {
 if(value===null||value===undefined||value==='')return 'Não preenchido';
 if(column.inputType==='PASSWORD'||/senha|password|secret|token/i.test(key))return 'Preenchido · conteúdo protegido';
 if(typeof value==='boolean')return value?'Marcado':'Não marcado';
 if(typeof value!=='object')return String(value);
 const fields=effectivePopup(column,key).fields;
 const details=Object.entries(value.data||{}).filter(([,item])=>item!==null&&item!==undefined&&item!=='').map(([field,item])=>{
  const definition=fields.find(candidate=>candidate.key===field);const label=definition?.label||field.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ');
  return `${label}: ${/senha|password|secret|token/i.test(field+' '+label)?'Conteúdo protegido':typeof item==='boolean'?item?'Sim':'Não':typeof item==='object'?'Preenchido':String(item)}`;
 });
 if(value.completionDate)details.push(`Conclusão: ${value.completionDate}`);
 if(value.pendingReason)details.push(`Pendência: ${value.pendingReason}`);
 if(typeof value.sentWithApi==='boolean')details.push(`Envio via API: ${value.sentWithApi?'Sim':'Não'}`);
 return [statusLabels[value.status]||value.status||'Sem situação',...details].join(' · ');
}
export function groupAccountingColumns(columns:any[]):any[]{
 const months=columns.filter(column=>accountingMonth(column)!==null);let inserted=false;
 return columns.flatMap(column=>{if(accountingMonth(column)===null)return [column];if(inserted)return [];inserted=true;return [{id:'accounting-months-group',name:'Meses',isMonthsGroup:true,months}];});
}
export function buildClosingProgress(rows:any[],columns:any[],sector:'FISCAL'|'DP'|'CONTABIL'|'CUSHMAN',period:Date,latest:Date):ProgressColumn[]{
 return columns.map(column=>{
  const key=resolveColumnKey(column)||column.columnKey||column.id;const month=sector==='CONTABIL'?accountingMonth(column):null;
  const tracked=column.countsProgress===true||(column.countsProgress===undefined&&sector==='FISCAL');
  const records=rows.map(row=>{
   const value=key==='dp_reinf_fiscal'?row.fiscalReinf:row.columnsData?.[key];
   const applicable=sector==='CONTABIL'?annualColumnActive(column,period.getUTCFullYear()):isColumnActive(column,period);
   const client=month?isClientMonth(row.company,period.getUTCFullYear(),month)&&value!==NOT_CLIENT:true;
   const blocked=sector==='CONTABIL'?!accountingColumnReleased(column,period.getUTCFullYear(),latest):period.getTime()>latest.getTime();
   const eligible=applicable&&client&&!blocked;
   const complete=eligible&&(sector==='CONTABIL'?accountingColumnComplete(column,value):isColumnComplete(column,value));
   const filled=eligible&&isColumnFilled(value);
   const status=!client?NOT_CLIENT:blocked?'Competência futura':!applicable?'Coluna fora da competência':complete?'Concluído':filled?'Preenchido / em andamento':'Pendente';
   return {id:row.closingId||row.company.id,name:row.company.name,code:row.company.code||'',value:displayProgressValue(value,column,key),status,complete,filled,eligible,blocked};
  });
  const total=records.filter(record=>record.eligible).length;const done=records.filter(record=>record.complete).length;const filled=records.filter(record=>record.filled).length;
  return {key,name:column.name,tracked,total,done,filled,percent:total?Math.round((tracked?done:filled)/total*100):0,records};
 });
}

// Conta obrigações aplicáveis antes de arredondar: cards e detalhes usam a mesma base.
export function summarizeClosingProgress(items:ProgressColumn[],_rowCount:number) {
 const tracked=items.filter(item=>item.tracked);const progressTotal=tracked.reduce((sum,item)=>sum+item.total,0);const progressDone=tracked.reduce((sum,item)=>sum+item.done,0);
 const companies=new Map<string,{total:number;done:number;filled:number}>();
 for(const item of tracked)for(const record of item.records){if(!record.eligible)continue;const counts=companies.get(record.id)||{total:0,done:0,filled:0};counts.total++;counts.done+=Number(record.complete);counts.filled+=Number(record.filled);companies.set(record.id,counts);}
 const applicableCounts=[...companies.values()].filter(counts=>counts.total>0);
 const total=applicableCounts.length;
 const completed=applicableCounts.filter(counts=>counts.total===counts.done).length;
 const inProgress=applicableCounts.filter(counts=>counts.done<counts.total&&counts.filled>0).length;
 return {total,completed,inProgress,pending:total-completed-inProgress,progressTotal,progressDone,overallPercent:progressTotal?Math.round(progressDone/progressTotal*100):0};
}
