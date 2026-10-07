import {ProgressDetailsPanel} from './ClosingProgressDetails';
import {formatMoney} from '../config/installments';
import type {ProgressColumn,ProgressRecord} from '../config/closingProgress';
export function buildInstallmentProgress(plans:any[],period:Date):ProgressColumn[]{
 return plans.map(plan=>{
  const records:ProgressRecord[]=plan.schedule.map((item:any)=>{
   const eligible=new Date(item.period)<=period;const complete=eligible&&item.status==='PAID';
   const value=[`Previsto: ${formatMoney(item.amount)}`,`Vencimento: ${new Date(item.dueDate).toLocaleDateString('pt-BR',{timeZone:'UTC'})}`,item.paidOn?`Pago em ${new Date(item.paidOn).toLocaleDateString('pt-BR',{timeZone:'UTC'})}`:'',item.paidAmount?`Valor pago: ${formatMoney(item.paidAmount)}`:'',item.settledInPlan?'Quitação declarada no cadastro':'',item.note?`Observação: ${item.note}`:''].filter(Boolean).join(' · ');
   return {id:String(item.number),name:`Parcela ${item.number}/${plan.installmentCount} · ${new Date(item.period).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'})}`,code:'',value,status:!eligible?'Competência futura':item.status==='PAID'?'Pago':item.status==='OVERDUE'?'Atrasado':'Pendente',complete,filled:eligible&&(item.status==='PAID'||!!item.note),eligible,blocked:!eligible};
  });
  const total=records.filter(record=>record.eligible).length;const done=records.filter(record=>record.complete).length;
  return {key:plan.id,name:plan.typeName,tracked:true,total,done,filled:records.filter(record=>record.filled).length,percent:total?Math.round(done/total*100):0,records};
 });
}
export function InstallmentProgressDetails({plans,year,month,open,onToggle}:{plans:any[];year:number;month:number;open:boolean;onToggle:()=>void}){
 const items=buildInstallmentProgress(plans,new Date(Date.UTC(year,month-1,1)));const total=items.reduce((sum,item)=>sum+item.total,0);const done=items.reduce((sum,item)=>sum+item.done,0);
 return <><ProgressDetailsPanel title="Status detalhado dos parcelamentos" items={items} overall={total?Math.round(done/total*100):0} open={open} onToggle={onToggle}/>{open&&<p className="installment-muted">Cada card detalha um parcelamento. O progresso considera as parcelas até a competência selecionada; parcelas futuras ficam fora do cálculo.</p>}</>;
}
