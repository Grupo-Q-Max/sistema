import {useEffect} from 'react';
import {Calendar,LockKeyhole,X} from 'lucide-react';
import {MONTH_NAMES} from '../config/columnVisibility';
import {accountingMonth,NOT_CLIENT} from '../config/accountingColumns';
import {resolveColumnKey} from '../config/payrollColumns';
import {PayrollInput} from './PayrollClosings';
import './ClosingProgressDetails.css';
export function AccountingMonthsModal({row,columns,year,latest,canEdit,pending,onSave,onClose}:{row:any;columns:any[];year:number;latest:Date;canEdit:boolean;pending:number;onSave:(row:any,column:any,value:any)=>Promise<void>;onClose:()=>void}){
 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!pending)onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[pending,onClose]);
 return <div className="closing-modal-backdrop" onClick={()=>{if(!pending)onClose();}}><section className="closing-modal-content" style={{maxWidth:1000}} role="dialog" aria-modal="true" aria-labelledby="accounting-months-title" onClick={event=>event.stopPropagation()}><div className="closing-modal-header"><div className="closing-modal-title purple" id="accounting-months-title"><Calendar size={22}/>Meses · {year}</div><button className="closing-modal-close-btn" aria-label="Fechar meses" disabled={pending>0} onClick={onClose}><X size={21}/></button></div><div className="closing-modal-body"><h3 style={{color:'#334155'}}>{row.company.name}</h3><p style={{color:'#64748b',fontSize:'.8rem'}}>Salvamento automático em cada seleção. Meses futuros e períodos em que não é cliente permanecem protegidos.</p><div className="accounting-months-grid">{MONTH_NAMES.map((name,index)=>{
  const column=columns.find(item=>accountingMonth(item)===index+1);const key=column?(resolveColumnKey(column)||column.id):`cont_mes_${String(index+1).padStart(2,'0')}`;const value=row.columnsData[key];const blocked=Date.UTC(year,index,1)>latest.getTime();
  return <div className={`accounting-months-card ${value===NOT_CLIENT?'excluded':['OK - FINALIZADO','SEM MOVIMENTO'].includes(value)?'done':'pending'}`} key={name}><h4>{name}{blocked&&<LockKeyhole size={13}/>}</h4>{!column?<><span>{value||'Sem preenchimento'}</span><small>Coluna não ativa/configurada neste ano.</small></>:value===NOT_CLIENT?<span className="obligation-btn na">{NOT_CLIENT}</span>:<PayrollInput column={{...column,name}} value={value} disabled={!canEdit||column.isEditable===false||blocked} onSave={next=>onSave(row,column,next)}/>}{blocked&&<small>Libera na virada do mês seguinte.</small>}</div>;
 })}</div><p role="status" style={{color:'#64748b',fontSize:'.8rem'}}>{pending?'Salvando alteração...':'Seleções salvas aparecem imediatamente no progresso.'}</p></div></section></div>;
}
