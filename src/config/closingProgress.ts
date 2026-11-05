import {isColumnComplete,isColumnFilled,isColumnActive,MONTH_NAMES} from './columnVisibility';
import {accountingMonth,isClientMonth,NOT_CLIENT,accountingColumnComplete,annualColumnActive,accountingColumnReleased} from './accountingColumns';
import {resolveColumnKey} from './payrollColumns';
import {effectivePopup} from './fiscalPopups';
import {formatCompanyCode} from '../utils/codeSort';

export type ValueBreakdownItem = {
  label: string;
  key: string;
  badgeClass: string;
  count: number;
  percent: number;
};

export type ProgressRecord = {
  id: string;
  name: string;
  code: string;
  value: string;
  rawValue?: any;
  categoryKey: string;
  categoryLabel: string;
  categoryBadge: string;
  status: string;
  complete: boolean;
  filled: boolean;
  eligible: boolean;
  blocked: boolean;
};

export type ProgressColumn = {
  key: string;
  name: string;
  tracked: boolean;
  total: number;
  done: number;
  filled: number;
  percent: number;
  records: ProgressRecord[];
  valueBreakdown?: ValueBreakdownItem[];
  isGroup?: boolean;
  subColumns?: ProgressColumn[];
};

export function normalizeRecordCategory(rawVal: any, _sector?: string, isMonth?: boolean): { label: string; key: string; badgeClass: string } {
  const str = typeof rawVal === 'object' && rawVal !== null
    ? (rawVal.status || rawVal.value || '')
    : String(rawVal || '').trim();

  if (isMonth || str.startsWith('OK') || str.startsWith('DOC.') || str.startsWith('SEM') || str.startsWith('COBRANÇA')) {
    if (str.startsWith('OK - FINALIZADO') || str === 'OK' || str.startsWith('OK')) {
      return { label: 'CONCLUÍDO', key: 'DONE', badgeClass: 'done' };
    }
    if (str.startsWith('DOC. REDE') || /doc\.?\s*rede/i.test(str)) {
      return { label: 'DOC. REDE', key: 'DOC_REDE', badgeClass: 'doc-rede' };
    }
    if (str.startsWith('SEM MOVIMENTO') || /sem\s*movimento/i.test(str)) {
      return { label: 'SEM MOVIMENTO', key: 'SEM_MOVIMENTO', badgeClass: 'no-movement' };
    }
    if (str.startsWith('COBRANÇA') || /cobran[cç]a/i.test(str)) {
      return { label: 'COBRANÇA DOC.', key: 'COBRANCA', badgeClass: 'collection' };
    }
    if (!str || str === 'Pendente' || str === 'Não preenchido') {
      return { label: 'PENDENTE', key: 'PENDING', badgeClass: 'pending' };
    }
  }

  if (str === 'Enviado' || str === 'Concluído') {
    return { label: str, key: 'DONE', badgeClass: 'done' };
  }
  if (!str || str === 'Pendente' || str === 'Não preenchido') {
    return { label: 'Pendente', key: 'PENDING', badgeClass: 'pending' };
  }

  return { label: str, key: str.toUpperCase().replace(/\s+/g, '_'), badgeClass: 'neutral' };
}

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
 const rawColumns: ProgressColumn[] = columns.map(column=>{
  const key=resolveColumnKey(column)||column.columnKey||column.id;
  const month=sector==='CONTABIL'?accountingMonth(column):null;
  const colName = (sector === 'CONTABIL' && month) ? MONTH_NAMES[month - 1] : column.name;
  const tracked=column.countsProgress===true||(column.countsProgress===undefined&&sector==='FISCAL');
  const records: ProgressRecord[] = rows.map(row=>{
   const value=key==='dp_reinf_fiscal'?row.fiscalReinf:row.columnsData?.[key];
   const applicable=sector==='CONTABIL'?annualColumnActive(column,period.getUTCFullYear()):isColumnActive(column,period);
   const client=month?isClientMonth(row.company,period.getUTCFullYear(),month)&&value!==NOT_CLIENT:true;
   const blocked=sector==='CONTABIL'?!accountingColumnReleased(column,period.getUTCFullYear(),latest):period.getTime()>latest.getTime();
   const eligible=applicable&&client&&!blocked;
   const complete=eligible&&(sector==='CONTABIL'?accountingColumnComplete(column,value):isColumnComplete(column,value));
   const filled=eligible&&isColumnFilled(value);
   const status=!client?NOT_CLIENT:blocked?'Competência futura':!applicable?'Coluna fora da competência':complete?'Concluído':filled?'Preenchido / em andamento':'Pendente';
   const cat = normalizeRecordCategory(value, sector, month !== null);
   return {
     id:row.closingId||row.company.id,
     name:row.company.name,
     code:formatCompanyCode(row.company.code),
     value:displayProgressValue(value,column,key),
     rawValue: value,
     categoryKey: cat.key,
     categoryLabel: cat.label,
     categoryBadge: cat.badgeClass,
     status,
     complete,
     filled,
     eligible,
     blocked
   };
  });
  const total=records.filter(record=>record.eligible).length;
  const done=records.filter(record=>record.complete).length;
  const filled=records.filter(record=>record.filled).length;

  let valueBreakdown: ValueBreakdownItem[] | undefined = undefined;
  if (sector === 'CONTABIL' && month) {
    const countsMap = new Map<string, { label: string; key: string; badgeClass: string; count: number }>([
      ['DONE', { label: 'CONCLUÍDO', key: 'DONE', badgeClass: 'done', count: 0 }],
      ['DOC_REDE', { label: 'DOC. REDE', key: 'DOC_REDE', badgeClass: 'doc-rede', count: 0 }],
      ['SEM_MOVIMENTO', { label: 'SEM MOVIMENTO', key: 'SEM_MOVIMENTO', badgeClass: 'no-movement', count: 0 }],
      ['COBRANCA', { label: 'COBRANÇA DOC.', key: 'COBRANCA', badgeClass: 'collection', count: 0 }],
      ['PENDING', { label: 'PENDENTE', key: 'PENDING', badgeClass: 'pending', count: 0 }],
    ]);

    for (const rec of records) {
      if (!rec.eligible) continue;
      const target = countsMap.get(rec.categoryKey);
      if (target) {
        target.count++;
      } else {
        countsMap.set(rec.categoryKey, {
          label: rec.categoryLabel,
          key: rec.categoryKey,
          badgeClass: rec.categoryBadge,
          count: 1
        });
      }
    }

    valueBreakdown = Array.from(countsMap.values()).map(item => ({
      ...item,
      percent: total ? Math.round((item.count / total) * 100) : 0
    }));
  }

  return {
    key,
    name: colName,
    tracked,
    total,
    done,
    filled,
    percent: total ? Math.round((tracked ? done : filled) / total * 100) : 0,
    records,
    valueBreakdown
  };
 });

 if (sector === 'CONTABIL') {
   const monthCols = rawColumns.filter(c => c.key.startsWith('cont_mes_'));
   if (monthCols.length > 0) {
     const nonMonthCols = rawColumns.filter(c => !c.key.startsWith('cont_mes_'));

     const groupTotal = monthCols.reduce((sum, c) => sum + c.total, 0);
     const groupDone = monthCols.reduce((sum, c) => sum + c.done, 0);
     const groupFilled = monthCols.reduce((sum, c) => sum + c.filled, 0);

     const consMap = new Map<string, { label: string; key: string; badgeClass: string; count: number }>([
       ['DONE', { label: 'CONCLUÍDO', key: 'DONE', badgeClass: 'done', count: 0 }],
       ['DOC_REDE', { label: 'DOC. REDE', key: 'DOC_REDE', badgeClass: 'doc-rede', count: 0 }],
       ['SEM_MOVIMENTO', { label: 'SEM MOVIMENTO', key: 'SEM_MOVIMENTO', badgeClass: 'no-movement', count: 0 }],
       ['COBRANCA', { label: 'COBRANÇA DOC.', key: 'COBRANCA', badgeClass: 'collection', count: 0 }],
       ['PENDING', { label: 'PENDENTE', key: 'PENDING', badgeClass: 'pending', count: 0 }],
     ]);

     for (const mCol of monthCols) {
       if (mCol.valueBreakdown) {
         for (const vb of mCol.valueBreakdown) {
           const target = consMap.get(vb.key);
           if (target) {
             target.count += vb.count;
           } else {
             consMap.set(vb.key, { label: vb.label, key: vb.key, badgeClass: vb.badgeClass, count: vb.count });
           }
         }
       }
     }

     const consolidatedBreakdown: ValueBreakdownItem[] = Array.from(consMap.values()).map(item => ({
       ...item,
       percent: groupTotal ? Math.round((item.count / groupTotal) * 100) : 0
     }));

     const groupColumn: ProgressColumn = {
       key: 'accounting_months_group',
       name: 'Meses (12 Meses)',
       tracked: true,
       total: groupTotal,
       done: groupDone,
       filled: groupFilled,
       percent: groupTotal ? Math.round(groupDone / groupTotal * 100) : 0,
       records: monthCols.flatMap(m => m.records),
       valueBreakdown: consolidatedBreakdown,
       isGroup: true,
       subColumns: monthCols
     };

     const obsIdx = nonMonthCols.findIndex(c => c.key === 'cont_observacao');
     const insertAt = obsIdx >= 0 ? obsIdx + 1 : 0;
     nonMonthCols.splice(insertAt, 0, groupColumn);
     return nonMonthCols;
   }
 }

 return rawColumns;
}

// Conta obrigações aplicáveis antes de arredondar: cards e detalhes usam a mesma base.
export function summarizeClosingProgress(items:ProgressColumn[],_rowCount:number) {
 const allCols = items.flatMap(item => item.isGroup && item.subColumns ? item.subColumns : [item]);
 const tracked=allCols.filter(item=>item.tracked);
 const progressTotal=tracked.reduce((sum,item)=>sum+item.total,0);
 const progressDone=tracked.reduce((sum,item)=>sum+item.done,0);
 const companies=new Map<string,{total:number;done:number;filled:number}>();
 for(const item of tracked)for(const record of item.records){if(!record.eligible)continue;const counts=companies.get(record.id)||{total:0,done:0,filled:0};counts.total++;counts.done+=Number(record.complete);counts.filled+=Number(record.filled);companies.set(record.id,counts);}
 const applicableCounts=[...companies.values()].filter(counts=>counts.total>0);
 const total=applicableCounts.length;
 const completed=applicableCounts.filter(counts=>counts.total===counts.done).length;
 const inProgress=applicableCounts.filter(counts=>counts.done<counts.total&&counts.filled>0).length;
 return {total,completed,inProgress,pending:total-completed-inProgress,progressTotal,progressDone,overallPercent:progressTotal?Math.round(progressDone/progressTotal*100):0};
}
