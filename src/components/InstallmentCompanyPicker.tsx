import {INSTALLMENT_COMPANY_REGIMES,isExternalInstallmentCompany,validateExternalInstallmentCompany} from '../config/installmentCompanies';
import {useEffect,useState} from 'react';
import {Search,Building2,X,ChevronLeft,ChevronRight,Plus,Save} from 'lucide-react';
import {installmentHeaders,canCreateInstallment,installmentAccess,dayInBrasilia} from '../config/installments';
import type {CurrentUser} from '../types/auth';
import { API } from '../api';
import {formatCnpj} from './CompanyDetailsModal';
import './Installments.css';
export function InstallmentCompanyPicker({currentUser,onSelect,onClose,mode='create'}:{mode?:'create'|'view';currentUser?:CurrentUser|null;onSelect:(company:any)=>void;onClose:()=>void}){
 const [query,setQuery]=useState('');const [offset,setOffset]=useState(0);const [companies,setCompanies]=useState<any[]>([]);const [more,setMore]=useState(false);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 const [showForm,setShowForm]=useState(false);const [busy,setBusy]=useState(false);const [formError,setFormError]=useState('');const [duplicate,setDuplicate]=useState(false);
 const [form,setForm]=useState({name:'',cnpj:'',taxRegime:'',tradeName:'',code:'',city:'',groupName:'',notes:''});
 const allowed=installmentAccess(currentUser);const canCreate=canCreateInstallment(currentUser)&&mode==='create';
 function openCompanyForm(){setFormError('');setDuplicate(false);setShowForm(true);}
 async function saveCompany(event:React.FormEvent){event.preventDefault();if(busy)return;setFormError('');setDuplicate(false);const invalid=validateExternalInstallmentCompany(form);if(invalid){setFormError(invalid);return;}setBusy(true);
  try{const response=await fetch(`${API}/api/installments/companies`,{method:'POST',headers:installmentHeaders(currentUser),body:JSON.stringify(form)});const result=await response.json();if(!response.ok){setDuplicate(response.status===409);throw new Error(result.error||'Não foi possível cadastrar a empresa.');}onSelect(result.company);}catch(cause){setFormError(cause instanceof Error?cause.message:'Erro ao cadastrar.');}finally{setBusy(false);}
 }

 useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){if(showForm)setShowForm(false);else onClose();}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose,busy,showForm]);
 useEffect(()=>{if(!allowed){setLoading(false);return;}const controller=new AbortController();setLoading(true);setError('');setCompanies([]);setMore(false);
  const timer=window.setTimeout(()=>{void fetch(`${API}/api/installments/companies?q=${encodeURIComponent(query)}&offset=${offset}`,{headers:installmentHeaders(currentUser),signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível listar empresas.');if(!controller.signal.aborted){setCompanies(result.companies||[]);setMore(!!result.hasMore);}}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},250);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[query,offset,currentUser?.sessionToken,allowed,retry]);
 const today=dayInBrasilia();
 return <div className="closing-modal-backdrop" onClick={()=>{if(!busy)onClose();}}><section className="closing-modal-content installment-company-picker" role="dialog" aria-modal="true" aria-labelledby="installment-company-title" onClick={event=>event.stopPropagation()}>
  <div className="closing-modal-header"><div className="closing-modal-title purple" id="installment-company-title"><Building2 size={22}/>{mode==='create'?'Criar parcelamento · selecionar empresa':'Consultar parcelamentos · selecionar empresa'}</div><button className="closing-modal-close-btn" aria-label="Fechar seleção de empresa" disabled={busy} onClick={onClose}><X size={22}/></button></div>
  <div className="closing-modal-body"><p className="installment-muted">Pesquise em todas as empresas cadastradas às quais você tem acesso, incluindo empresas que já saíram ou não aparecem no fechamento Fiscal. Selecionar uma empresa não a inclui no fechamento.</p>
  {canCreate&&<div className="installment-toolbar"><div><h3>{showForm?'Nova empresa externa':'Escolha uma empresa ou cadastre uma nova'}</h3><p>Empresas externas ficam disponíveis apenas para parcelamentos, sem vínculo como cliente contábil.</p></div><button type="button" className="btn-primary-gradient" disabled={busy} onClick={()=>{if(showForm)setShowForm(false);else openCompanyForm();}}><Plus size={16}/>{showForm?'Voltar à lista':'Cadastrar empresa para parcelamento'}</button></div>}
  {canCreate&&showForm?<form onSubmit={event=>{void saveCompany(event);}}><div className="installment-form-grid">
   <label>Razão social *<input autoFocus required maxLength={191} disabled={busy} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
   <label>CNPJ *<input required maxLength={20} placeholder="00.000.000/0000-00" disabled={busy} value={form.cnpj} onChange={event=>setForm({...form,cnpj:event.target.value})}/><small>Usado para identificar a empresa e impedir cadastro duplicado.</small></label>
   <label>Tributação *<select required disabled={busy} value={form.taxRegime} onChange={event=>setForm({...form,taxRegime:event.target.value})}><option value="">Selecione...</option>{INSTALLMENT_COMPANY_REGIMES.map(regime=><option key={regime.value} value={regime.value}>{regime.label}</option>)}</select></label>
   <label>Nome fantasia<input maxLength={191} disabled={busy} value={form.tradeName} onChange={event=>setForm({...form,tradeName:event.target.value})}/></label>
   <label>Código (opcional)<input maxLength={191} disabled={busy} value={form.code} onChange={event=>setForm({...form,code:event.target.value})}/></label>
   <label>Município (opcional)<input maxLength={191} disabled={busy} value={form.city} onChange={event=>setForm({...form,city:event.target.value})}/></label>
   <label>Grupo (opcional)<input maxLength={191} disabled={busy} value={form.groupName} onChange={event=>setForm({...form,groupName:event.target.value})}/></label>
   <label className="full-width">Observação (opcional)<textarea rows={3} maxLength={4000} disabled={busy} value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></label>
  </div><p className="installment-muted">Depois de cadastrar, você seguirá para os dados do parcelamento. Não é necessário informar datas de contrato ou obrigações contábeis.</p>
  {formError&&<div className="installment-error" role="alert">{formError}{duplicate&&<button type="button" className="btn-secondary-light" disabled={busy} onClick={()=>{setQuery(form.cnpj);setOffset(0);setShowForm(false);}}>Pesquisar CNPJ informado</button>}</div>}
  <div className="installment-toolbar"><button type="button" className="btn-secondary-light" disabled={busy} onClick={()=>setShowForm(false)}>Cancelar</button><button type="submit" className="btn-primary-gradient" disabled={busy}><Save size={16}/>{busy?'Cadastrando...':'Cadastrar e criar parcelamento'}</button></div>
  </form>:<>
  <label className="installment-company-search"><Search size={18}/><input autoFocus placeholder="Nome, nome fantasia, código, CNPJ ou grupo..." aria-label="Pesquisar empresa para parcelamento" value={query} onChange={event=>{setQuery(event.target.value);setOffset(0);}}/></label>
  {!allowed?<p className="installment-error">Você não tem permissão para consultar parcelamentos.</p>:error?<div className="installment-error" role="alert">{error} <button className="btn-secondary-light" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</button></div>:loading?<p className="installment-muted" role="status">Buscando empresas...</p>:!companies.length?<div className="installment-empty">Nenhuma empresa encontrada. Confira a pesquisa e seu acesso às empresas.</div>:<div className="installment-company-results">{companies.map(company=>{
   const exited=company.exitDate&&String(company.exitDate).slice(0,10)<=today;const future=String(company.obligationStartDate).slice(0,10)>today;const sectors=String(company.activeSectors||'TODOS').split(',');const noFiscal=!sectors.includes('TODOS')&&!sectors.includes('FISCAL');
   return <button className="installment-company-option" key={company.id} onClick={()=>onSelect(company)}><span className="installment-company-info"><strong>{company.name}</strong>{company.tradeName&&<span>{company.tradeName}</span>}<span>Código: {company.code||'—'} · CNPJ: {formatCnpj(company.cnpj)}</span></span><span className={`installment-badge ${exited?'overdue':'ativo'}`}>{isExternalInstallmentCompany(company)?'Externa · somente parcelamento':exited?'Saiu em '+new Date(company.exitDate).toLocaleDateString('pt-BR',{timeZone:'UTC'}):future?'Obrigação futura':noFiscal?'Sem setor Fiscal':'Cliente atual'}</span><ChevronRight size={18}/></button>;
  })}</div>}
  <div className="installment-company-pagination"><button className="btn-secondary-light" disabled={loading||offset===0} onClick={()=>setOffset(value=>Math.max(0,value-50))}><ChevronLeft size={16}/>Anterior</button><span>Página {Math.floor(offset/50)+1} · até 50 empresas</span><button className="btn-secondary-light" disabled={loading||!more} onClick={()=>setOffset(value=>value+50)}>Próxima<ChevronRight size={16}/></button></div>
  </>}
  </div></section></div>;
}
