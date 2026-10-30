import {useEffect,useState} from 'react';
import {Search,FileText,X,ChevronLeft,ChevronRight,RefreshCw,Edit2,Eye} from 'lucide-react';
import {installmentHeaders,formatMoney} from '../config/installments';
import {isExternalInstallmentCompany} from '../config/installmentCompanies';
import {exportToCsv} from '../utils/exportCsv';
import {formatCnpj} from './CompanyDetailsModal';
import type {CurrentUser} from '../types/auth';
import { API } from '../api';
import './Installments.css';
const labels:Record<string,string>={ATIVO:'Ativo',ATRASADO:'Atrasado',QUITADO:'Quitado',PAID:'Pago',OVERDUE:'Atrasado',PENDING:'Pendente'};
export function AllInstallmentsModal({year,month,currentUser,onClose,onSelect,active=true}:{active?:boolean;year:number;month:number;currentUser?:CurrentUser|null;onClose:()=>void;onSelect:(company:any,planId:string,action:'VIEW'|'EDIT')=>void}){
 const [query,setQuery]=useState('');const [offset,setOffset]=useState(0);const [result,setResult]=useState<any>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 const periodLabel=new Date(Date.UTC(year,month-1,1)).toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
 useEffect(()=>{if(!active)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose,active]);
 useEffect(()=>{if(!active)return;const controller=new AbortController();setLoading(true);setError('');setResult(null);
  const timer=window.setTimeout(()=>{void fetch(`${API}/api/installments/plans?year=${year}&month=${month}&offset=${offset}&q=${encodeURIComponent(query)}`,{headers:installmentHeaders(currentUser),signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível listar parcelamentos.');if(!controller.signal.aborted)setResult(data);}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},250);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[year,month,query,offset,retry,currentUser?.sessionToken,active]);
  const handleExport = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/api/installments/plans?year=${year}&month=${month}&offset=0&limit=999999&q=${encodeURIComponent(query)}`,{headers:installmentHeaders(currentUser)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao exportar.');
      
      const csvColumns = [
        { header: 'Empresa', key: 'companyName' },
        { header: 'Código', key: 'companyCode' },
        { header: 'CNPJ', key: 'companyCnpj' },
        { header: 'Tipo', key: 'typeName' },
        { header: 'Valor Total', key: 'totalAmount' },
        { header: 'Status', key: 'status' },
        { header: 'Responsável', key: 'responsible' },
        { header: 'Pagas/Total', key: 'paidStatus' },
        { header: 'Parcela do Mês', key: 'monthInstallment' },
        { header: 'Vencimento', key: 'dueDate' },
        { header: 'Situação da Parcela', key: 'monthStatus' },
        { header: 'Atrasos Anteriores', key: 'priorOverdue' }
      ];

      const csvData = data.plans.map((plan: any) => {
        const item=plan.schedule.find((entry:any)=>new Date(entry.period).getTime()===Date.UTC(year,month-1,1));
        const prior=plan.schedule.filter((entry:any)=>new Date(entry.period)<new Date(Date.UTC(year,month-1,1))&&entry.status==='OVERDUE').length;

        return {
          companyName: plan.company.name || '',
          companyCode: plan.company.code || '',
          companyCnpj: formatCnpj(plan.company.cnpj) || '',
          typeName: plan.typeName || '',
          totalAmount: formatMoney(plan.totalAmount) || '',
          status: labels[plan.effectiveStatus] || plan.effectiveStatus,
          responsible: plan.responsible?.name || plan.responsible?.email || 'Não atribuído',
          paidStatus: `${plan.paid}/${plan.installmentCount}`,
          monthInstallment: item ? `${item.number}/${plan.installmentCount} · ${formatMoney(item.amount)}` : 'Sem parcela no mês',
          dueDate: item ? new Date(item.dueDate).toLocaleDateString('pt-BR',{timeZone:'UTC'}) : '—',
          monthStatus: item ? labels[item.status] : 'Sem parcela no mês',
          priorOverdue: prior > 0 ? `${prior} atraso(s)` : '0 atrasos'
        };
      });

      const mesStr = String(month).padStart(2, '0') + '-' + year;
      exportToCsv(`fechamento_parcelamentos_${mesStr}`, csvColumns, csvData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao exportar.');
    } finally {
      setLoading(false);
    }
  };

 return <div className="closing-modal-backdrop" onClick={onClose}><section className="closing-modal-content installments-modal" role="dialog" aria-modal="true" aria-labelledby="all-installments-title" onClick={event=>event.stopPropagation()}><div className="closing-modal-header"><div className="closing-modal-title purple" id="all-installments-title"><FileText size={22}/>Todos os parcelamentos</div><button className="closing-modal-close-btn" aria-label="Fechar todos os parcelamentos" onClick={onClose}><X size={21}/></button></div><div className="closing-modal-body"><div className="installment-toolbar"><div><h3>Visão geral · {periodLabel}</h3><p>{result?.access.edit?'Acesso de edição: todos os parcelamentos, independentemente do responsável.':'Consulta dos parcelamentos disponíveis no seu acesso às empresas.'}</p></div><div style={{display:'flex', gap:'8px'}}><button className="btn-secondary-light" disabled={loading} aria-label="Exportar para Excel" onClick={handleExport}><FileText size={16}/>Exportar</button><button className="btn-secondary-light" disabled={loading} aria-label="Atualizar lista de parcelamentos" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={16}/>Atualizar</button></div></div>
 <label className="installment-company-search"><Search size={18}/><input autoFocus aria-label="Pesquisar todos os parcelamentos" placeholder="Empresa, CNPJ, código, grupo ou tipo de parcelamento..." value={query} onChange={event=>{setQuery(event.target.value);setOffset(0);}}/></label>
 {loading?<p className="installment-muted" role="status">Carregando parcelamentos...</p>:error?<p className="installment-error" role="alert">{error}</p>:!result?.plans.length?<div className="installment-empty">Nenhum parcelamento encontrado para essa pesquisa.</div>:<><p className="installment-muted">{result.total} parcelamento(s) encontrado(s) · mostrando {offset+1} a {offset+result.plans.length}</p><div className="installment-table-scroll"><table className="installment-table all-installments-table"><thead><tr><th>Empresa</th><th>Tipo de parcelamento</th><th>Valor total</th><th>Status</th><th>Responsável</th><th>Pagas / total</th><th>Parcela do mês</th><th>Vencimento</th><th>Ações</th><th>Situação</th></tr></thead><tbody>{result.plans.map((plan:any)=>{
  const item=plan.schedule.find((entry:any)=>new Date(entry.period).getTime()===Date.UTC(year,month-1,1));const prior=plan.schedule.filter((entry:any)=>new Date(entry.period)<new Date(Date.UTC(year,month-1,1))&&entry.status==='OVERDUE').length;
  return <tr key={plan.id}><td><strong>{plan.company.name}</strong><small>Código: {plan.company.code||'—'} · {formatCnpj(plan.company.cnpj)}</small>{isExternalInstallmentCompany(plan.company)&&<small>Externa · somente parcelamento</small>}</td><td>{plan.typeName}</td><td>{formatMoney(plan.totalAmount)}</td><td><span className={`installment-badge ${plan.effectiveStatus.toLowerCase()}`}>{labels[plan.effectiveStatus]}</span></td><td>{plan.responsible?.name||plan.responsible?.email||'Não atribuído'}</td><td>{plan.paid}/{plan.installmentCount}</td><td>{item?`${item.number}/${plan.installmentCount} · ${formatMoney(item.amount)}`:'Sem parcela no mês'}</td><td>{item?new Date(item.dueDate).toLocaleDateString('pt-BR',{timeZone:'UTC'}):'—'}</td><td><div className="installment-row-actions"><button onClick={()=>onSelect(plan.company,plan.id,'VIEW')}><Eye size={14}/>Ver parcelas</button>{(plan.canEdit ?? result.access.edit)&&<button onClick={()=>onSelect(plan.company,plan.id,'EDIT')}><Edit2 size={14}/>Editar</button>}</div></td><td><span className={`installment-badge ${(item?.status||'na').toLowerCase()}`}>{item?labels[item.status]:'Sem parcela no mês'}</span>{prior>0&&<small className="all-installments-overdue">{prior} atraso(s) anterior(es)</small>}</td></tr>;
 })}</tbody></table></div></>}
 <div className="installment-company-pagination"><button className="btn-secondary-light" disabled={loading||offset===0} onClick={()=>setOffset(value=>Math.max(0,value-25))}><ChevronLeft size={16}/>Anterior</button><span>Página {Math.floor(offset/25)+1}</span><button className="btn-secondary-light" disabled={loading||!result?.hasMore} onClick={()=>setOffset(value=>value+25)}>Próxima<ChevronRight size={16}/></button></div>
 </div></section></div>;
}
