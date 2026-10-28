import {CushmanTextModal} from './CushmanTextModal';
import {useEffect,useMemo,useRef,useState,useDeferredValue} from 'react';
import {Building2,CheckCircle2,Clock,AlertCircle,Sparkles,Search,ChevronLeft,ChevronRight,RefreshCw,Settings2,Eye,LockKeyhole,FileCheck,X,ExternalLink} from 'lucide-react';
import {Sidebar} from './Sidebar';
import {ClosingSectorTabs} from './ClosingSectorTabs';
import {ClosingProgressDetails} from './ClosingProgressDetails';
import {CushmanCompanyModal} from './CushmanCompanyModal';
import {CushmanObligationModal} from './CushmanObligationModal';
import {PayrollInput} from './PayrollClosings';
import {formatCnpj,getCertificateStatus} from './CompanyDetailsModal';
import {TableSkeleton} from './LoadingSkeleton';
import {useCompetenceCalendar} from './useCompetenceCalendar';
import {CUSHMAN_API_VERSION,cushmanAccess,resolveCushmanKey,cushmanTextValue} from '../config/cushmanColumns';
import {buildClosingProgress,summarizeClosingProgress} from '../config/closingProgress';
import {exportToCsv} from '../utils/exportCsv';
import {compareCodes} from '../utils/codeSort';
import {isColumnComplete} from '../config/columnVisibility';
import {installmentHeaders} from '../config/installments';
import {latestOpenPeriod} from '../config/competenceCalendar';
import type {CurrentUser} from '../types/auth';
import {API_URL as API} from '../api';
import './Closings.css';
import './PayrollClosings.css';
import './CushmanClosings.css';
type Props={currentView:string;onNavigate:(view:string)=>void;currentUser?:CurrentUser|null;onLogout?:()=>void};
const STATUS:Record<string,string>={COMPLETED:'Concluído',IN_PROGRESS:'Em andamento',PENDING:'Pendente',NOT_APPLICABLE:'Fora da competência'};
function obligationAppearance(value:any,column:any){
 if(column.inputType==='TEXT'){const text=cushmanTextValue(value,column);return {label:text||'Preencher',kind:text.trim().toUpperCase()==='N/A'?'na':isColumnComplete(column,text)?'ok-data':'pendente'};}
 if(value?.status==='N/A')return {label:'N/A',kind:'na'};
 if(['SEM_MOVIMENTO','OK - SEM MOVIMENTO'].includes(value?.status))return {label:'OK - S/ MOV',kind:'sem-mov'};
 if(['PENDENCIA','PENDÊNCIA'].includes(value?.status))return {label:'Pendência',kind:'pendencia'};
 if(isColumnComplete(column,value))return {label:value?.completionDate?new Date(value.completionDate).toLocaleDateString('pt-BR',{timeZone:'UTC'}):'Concluído',kind:'ok-data'};
 return {label:typeof value==='string'&&value.trim()?'Preenchido':'Pendente',kind:'pendente'};
}
export function CushmanClosings({currentView,onNavigate,currentUser,onLogout}:Props){
 const [period,setPeriod]=useState(()=>latestOpenPeriod());const latest=useCompetenceCalendar();const [mode,setMode]=useState('CUSHMAN');const [rows,setRows]=useState<any[]>([]);const [columns,setColumns]=useState<any[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [configured,setConfigured]=useState(true);const [pending,setPending]=useState(0);const [search,setSearch]=useState('');const [status,setStatus]=useState('ALL');const [city,setCity]=useState('ALL');const [cert,setCert]=useState('ALL');const [sort,setSort]=useState<{key:'code'|'name';asc:boolean}>({key:'code',asc:true});const [progressOpen,setProgressOpen]=useState(false);const [companyId,setCompanyId]=useState('');const [obligation,setObligation]=useState<{id:string;key:string}|null>(null);const [field,setField]=useState<{id:string;key:string}|null>(null);const [scrollWidth,setScrollWidth]=useState(0);
 const sequence=useRef(0);const periodKey=period.toISOString();const currentPeriod=useRef(periodKey);currentPeriod.current=periodKey;const tableScroll=useRef<HTMLDivElement>(null);const topScroll=useRef<HTMLDivElement>(null);const syncing=useRef(false);const headers=installmentHeaders(currentUser);const canView=cushmanAccess(currentUser);const canEdit=cushmanAccess(currentUser,true);
 async function load(){const request=++sequence.current;setLoading(true);setError('');try{const response=await fetch(`${API}/cushman-closings?year=${period.getUTCFullYear()}&month=${period.getUTCMonth()+1}&companies=${mode}`,{headers});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar o Cushman.');if(data.cushmanApiVersion!==CUSHMAN_API_VERSION)throw new Error('Reinicie a API para carregar o Cushman.');if(request===sequence.current){setRows(data.rows||[]);setColumns(data.columns||[]);setConfigured(data.configured===true);}}catch(cause){if(request===sequence.current){setRows([]);setError(cause instanceof Error?cause.message:'Erro ao carregar.');}}finally{if(request===sequence.current)setLoading(false);}}
 useEffect(()=>{setRows([]);if(canView)void load();else setLoading(false);return()=>{sequence.current++;};},[periodKey,mode,canView,currentUser?.sessionToken]);
 useEffect(()=>{setCompanyId('');setObligation(null);setField(null);setProgressOpen(false);},[periodKey,mode]);
 useEffect(()=>{const table=tableScroll.current?.querySelector('table');if(!table)return;const update=()=>setScrollWidth(table.scrollWidth);update();const observer=new ResizeObserver(update);observer.observe(table);return()=>observer.disconnect();},[loading,columns.length]);
 const activeRows=rows.filter(row=>row.participates);const summary=summarizeClosingProgress(buildClosingProgress(activeRows,columns,'CUSHMAN',period,latest),activeRows.length);
 const deferredSearch = useDeferredValue(search);
 const filtered=useMemo(()=>rows.filter(row=>{const company=row.company;const term=deferredSearch.trim().toLocaleLowerCase('pt-BR');const digits=term.replace(/\D/g,'');const matches=[company.code,company.name,company.tradeName,company.cnpj,company.city].join(' ').toLocaleLowerCase('pt-BR').includes(term)||digits.length>=3&&(company.cnpj||'').replace(/\D/g,'').includes(digits);const certificate=company.hasClientCertificate?getCertificateStatus(company.certificateExpiration):null;return matches&&(status==='ALL'||row.calculatedStatus===status)&&(city==='ALL'||company.city===city)&&(cert==='ALL'||cert==='NONE'&&!company.hasClientCertificate||certificate?.status===cert);}).sort((a,b)=>{
   if (sort.key === 'code') return compareCodes(a.company.code, b.company.code, sort.asc);
   return String(a.company[sort.key]||'').localeCompare(String(b.company[sort.key]||''),'pt-BR',{numeric:true})*(sort.asc?1:-1);
 }),[rows,deferredSearch,status,city,cert,sort]);
 const cities=Array.from(new Set(rows.map(row=>row.company.city).filter(Boolean))).sort();const companyRow=rows.find(row=>row.company.id===companyId);const obligationRow=rows.find(row=>row.company.id===obligation?.id);const obligationColumn=columns.find(column=>resolveCushmanKey(column)===obligation?.key);const fieldRow=rows.find(row=>row.company.id===field?.id);const fieldColumn=columns.find(column=>resolveCushmanKey(column)===field?.key);const notesColumn=columns.find(column=>resolveCushmanKey(column)==='cush_observacao');
 async function saveColumn(row:any,key:string,value:any){if(!canEdit)throw new Error('Permissão somente de leitura.');const captured=currentPeriod.current;setPending(count=>count+1);try{const response=await fetch(`${API}/cushman-closings/${row.closingId}/column`,{method:'PUT',headers,body:JSON.stringify({columnKey:key,columnValue:value,expectedUpdatedAt:row.updatedAt})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível salvar.');if(currentPeriod.current===captured)setRows(previous=>previous.map(item=>item.company.id===row.company.id?{...item,...result,columnsData:result.closing.columnsData,updatedAt:result.closing.updatedAt}:item));}finally{setPending(count=>count-1);}}
 async function saveCompany(row:any,body:any){if(!canEdit)throw new Error('Permissão somente de leitura.');setPending(count=>count+1);try{const response=await fetch(`${API}/cushman-companies/${row.company.id}`,{method:'PUT',headers,body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível salvar o cadastro.');await load();}finally{setPending(count=>count-1);}}

  const handleExport = () => {
    const csvColumns = [
      { header: 'Código', key: 'code' },
      { header: 'Empresa', key: 'name' },
      { header: 'CNPJ', key: 'cnpj' },
      { header: 'Município', key: 'city' },
      { header: 'Status Geral', key: 'status' },
      ...columns.map(c => ({ header: c.name, key: c.id }))
    ];

    const data = filtered.map(r => {
      const rowData: any = {
        code: r.company.code || '',
        name: r.company.name || '',
        cnpj: formatCnpj(r.company.cnpj) || '',
        city: r.company.city || '',
        status: STATUS[r.calculatedStatus] || r.calculatedStatus
      };

      columns.forEach(col => {
        const key = resolveCushmanKey(col) || col.id;
        const val = r.columnsData[key];
        
        if (key === 'cush_observacao') {
           rowData[col.id] = val || '';
           return;
        }

        const appearance = obligationAppearance(val, col);
        rowData[col.id] = appearance.label === 'Preencher' ? '' : appearance.label;
      });
      return rowData;
    });

    const mesStr = String(period.getUTCMonth() + 1).padStart(2, '0') + '-' + period.getUTCFullYear();
    exportToCsv(`fechamento_cushman_${mesStr}`, csvColumns, data);
  };

 const scroll=(source:HTMLDivElement,target:HTMLDivElement|null)=>{if(!target||syncing.current)return;syncing.current=true;target.scrollLeft=source.scrollLeft;syncing.current=false;};
 const label=period.toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'});
 return <div className="crm-dashboard"><Sidebar currentView={currentView} onNavigate={onNavigate} currentUser={currentUser} onLogout={onLogout}/><main className="crm-main"><div className="closings-container payroll-closings cushman-closings"><div className="closings-header"><div className="closings-header-titles"><h1><Building2 size={28} color="#818cf8"/>Fechamento Cushman</h1><p>Obrigações mensais e dados da empresa organizados em um só lugar</p></div><div className="closings-header-actions"><ClosingSectorTabs sector="CUSHMAN" currentUser={currentUser} onNavigate={onNavigate}/><div className="month-selector-box"><button className="month-nav-btn" aria-label="Competência anterior" disabled={pending>0} onClick={()=>setPeriod(new Date(Date.UTC(period.getUTCFullYear(),period.getUTCMonth()-1,1)))}><ChevronLeft size={20}/></button><span className="month-display-text">{label}</span><button className="month-nav-btn" aria-label="Próxima competência" disabled={pending>0||period>=latest} title="A próxima competência abre automaticamente na virada do mês" onClick={()=>setPeriod(new Date(Date.UTC(period.getUTCFullYear(),period.getUTCMonth()+1,1)))}><ChevronRight size={20}/></button></div></div></div>
 {!canView?<p className="cushman-error">Você não tem acesso ao fechamento Cushman.</p>:<>
 <div className="closings-stats-grid">{[{label:'Empresas na competência',value:summary.total,kind:'total',Icon:Building2},{label:'Concluídos',value:summary.completed,kind:'completed',Icon:CheckCircle2},{label:'Em Andamento',value:summary.inProgress,kind:'in-progress',Icon:Clock},{label:'Pendentes',value:summary.pending,kind:'pending',Icon:AlertCircle},{label:'Progresso (Campos)',value:summary.overallPercent+'%',kind:'percent',Icon:Sparkles},{label:'Progresso (Empresas)',value:(summary.total ? Math.round(summary.completed / summary.total * 100) : 0)+'%',kind:'percent',Icon:Building2}].map(({label,value,kind,Icon})=><div key={label} className={`closing-stat-card ${kind==='percent'?'progress-clickable':''}`} role={kind==='percent'?'button':undefined} tabIndex={kind==='percent'?0:undefined} aria-expanded={kind==='percent'?progressOpen:undefined} onClick={kind==='percent'?()=>setProgressOpen(open=>!open):undefined} onKeyDown={kind==='percent'?event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();setProgressOpen(open=>!open);}}:undefined}><div className={`closing-stat-icon ${kind}`}><Icon size={22}/></div><div className="closing-stat-info"><span>{label}</span><strong>{loading?'—':value}</strong></div></div>)}</div>
 <ClosingProgressDetails rows={activeRows} columns={columns} sector="CUSHMAN" period={period} latest={latest} open={progressOpen} onToggle={()=>setProgressOpen(open=>!open)} loading={loading}/>
 <div className="closings-toolbar"><div className="closings-search-box"><Search size={18}/><input aria-label="Pesquisar empresas Cushman" placeholder="Pesquisar código, empresa, CNPJ ou município..." value={search} onChange={event=>setSearch(event.target.value)}/></div><div className="closings-filters"><select className="closings-select" aria-label="Exibir empresas" disabled={pending>0} value={mode} onChange={event=>{setMode(event.target.value);setStatus('ALL');setCity('ALL');}}><option value="CUSHMAN">Empresas do Cushman na competência</option><option value="ALL">Todas as empresas</option></select><select className="closings-select" aria-label="Filtrar status Cushman" value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">Todos os status</option>{Object.entries(STATUS).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select><select className="closings-select" aria-label="Filtrar município" value={city} onChange={event=>setCity(event.target.value)}><option value="ALL">Todos os municípios</option>{cities.map(value=><option key={value}>{value}</option>)}</select><select className="closings-select" aria-label="Filtrar certificado" value={cert} onChange={event=>setCert(event.target.value)}><option value="ALL">Todos os certificados</option><option value="EXPIRED">Certificado vencido</option><option value="WARNING">Vence em até 30 dias</option><option value="OK">Certificado válido</option><option value="NONE">Sem certificado</option></select><button type="button" className="payroll-refresh-btn" aria-label="Atualizar Cushman" disabled={loading||pending>0} onClick={()=>{void load();}}><RefreshCw size={17}/></button>
 <button className="btn-secondary-light" onClick={handleExport} title="Exportar para Excel (CSV)">
    <ExternalLink size={16} />
    Exportar
 </button>
 </div></div>
 <div className="payroll-table-meta"><span>{filtered.length} empresa(s) exibida(s) · {activeRows.length} na competência</span><span><LockKeyhole size={14}/>{canEdit?'Editar cadastro no botão à esquerda · obrigações nos popups':'Acesso somente de leitura'}</span></div>{mode==='ALL'&&<p className="cushman-all-note">Todas as empresas liberadas para seu usuário. Empresas fora do Cushman ou do período permitem consultar/editar o cadastro conforme sua permissão; as obrigações do mês ficam bloqueadas.</p>}
 {error&&<p className="cushman-error" role="alert">{error}</p>}{!loading&&!configured&&<p className="cushman-error" role="alert">As colunas Cushman ainda não foram preparadas. Execute o instalador desta atualização e reinicie a API.</p>}
 <div className="cushman-obligation-navigation"><span><strong>Campos digitáveis:</strong> ISS · DEVEC · SPED Fiscal · REINF · e-social</span><button type="button" onClick={()=>tableScroll.current?.scrollTo({left:scrollWidth,behavior:'smooth'})}>Ver obrigações à direita →</button></div>
 <div className="closings-table-card">{loading?<div className="payroll-loading"><TableSkeleton count={6}/></div>:<><div className="payroll-scroll-top" ref={topScroll} onScroll={event=>scroll(event.currentTarget,tableScroll.current)}><div style={{width:scrollWidth,height:1}}/></div><div className="closings-table-scroll payroll-table-scroll" ref={tableScroll} onScroll={event=>scroll(event.currentTarget,topScroll.current)}><table className="closings-table cushman-table"><thead><tr><th className="cushman-sticky-action">Dados</th>{(['code','name'] as const).map(key=><th key={key} className={key==='code'?'cushman-sticky-code':'cushman-sticky-company'}><button type="button" className="payroll-sort-btn" onClick={()=>setSort({key,asc:sort.key===key?!sort.asc:true})}>{key==='code'?'Código':'Empresa / Certificado'}<span>{sort.key===key?(sort.asc?'▲':'▼'):'⇅'}</span></button></th>)}<th>CNPJ</th><th>Status</th>{columns.map(column=><th key={column.id}>{column.name}</th>)}</tr></thead><tbody>{filtered.map(row=>{const company=row.company;const certificate=company.hasClientCertificate?getCertificateStatus(company.certificateExpiration):null;return <tr key={company.id} className={!row.participates?'cushman-outside-row':''}><td className="cushman-sticky-action"><button type="button" className="cushman-company-button" aria-label={`${canEdit?'Editar':'Ver'} dados de ${company.name}`} title={canEdit?'Editar dados da empresa, certificado e procuração':'Ver dados da empresa, certificado e procuração'} disabled={pending>0} onClick={()=>setCompanyId(company.id)}>{canEdit?<Settings2 size={18}/>:<Eye size={18}/>}</button></td><td className="cushman-sticky-code">{company.code||'—'}</td><td className="cushman-sticky-company"><div className="cushman-company-cell"><strong>{company.name}</strong><small>{company.city||'Município não informado'}</small>{certificate&&<span className={`cushman-certificate ${certificate.status.toLowerCase()}`}>{certificate.isUrgent&&<AlertCircle size={12}/>}Certificado · {certificate.label}</span>}</div></td><td>{formatCnpj(company.cnpj||'')}</td><td><span className={`status-badge ${row.calculatedStatus==='COMPLETED'?'completed':row.calculatedStatus==='IN_PROGRESS'?'in-progress':'pending'}`}>{STATUS[row.calculatedStatus]||row.calculatedStatus}</span><small className="cushman-client-status">{company.exitDate?`Saída: ${new Date(company.exitDate).toLocaleDateString('pt-BR',{timeZone:'UTC'})}`:'Ativa'}</small></td>{columns.map(column=>{const key=resolveCushmanKey(column)||column.id;const value=row.columnsData[key];if(key==='cush_observacao')return <td key={column.id}><span className="cushman-notes" title={String(value||'')}>{value||'—'}</span></td>;const appearance=obligationAppearance(value,column);return <td key={column.id}><button type="button" className={`obligation-btn ${column.inputType==='TEXT'?'cushman-text-button':''} ${row.participates?appearance.kind:'na'}`} disabled={!row.participates||!row.closingId||pending>0} title={!row.participates?'Sem obrigação Cushman nesta competência':`${column.name}: ${cushmanTextValue(value,column)||'Não preenchido'} · clique para ${canEdit&&column.isEditable!==false?'editar':'consultar'}`} onClick={()=>column.inputType==='POPUP'?setObligation({id:company.id,key}):setField({id:company.id,key})}>{row.participates?appearance.label:'N/A'}</button></td>;})}</tr>;})}{!filtered.length&&<tr><td colSpan={5+columns.length} className="cushman-empty">Nenhuma empresa encontrada para estes filtros.</td></tr>}</tbody></table></div></>}</div>
 {companyRow&&<CushmanCompanyModal row={{...companyRow,notesEditable:notesColumn?.isEditable!==false&&!!notesColumn}} canEdit={canEdit} onClose={()=>setCompanyId('')} onSave={body=>saveCompany(companyRow,body)} onSaveNotes={value=>saveColumn(companyRow,'cush_observacao',value)}/>}
 {obligationRow&&obligationColumn&&<CushmanObligationModal row={obligationRow} column={obligationColumn} canEdit={canEdit} onClose={()=>setObligation(null)} onSave={value=>saveColumn(obligationRow,obligation?.key||'',value)}/>}
 {fieldRow&&fieldColumn&&fieldColumn.inputType==='TEXT'&&<CushmanTextModal row={fieldRow} column={fieldColumn} canEdit={canEdit} onClose={()=>setField(null)} onSave={value=>saveColumn(fieldRow,field?.key||'',value)}/>}
 {fieldRow&&fieldColumn&&fieldColumn.inputType!=='TEXT'&&<div className="closing-modal-backdrop" onClick={()=>{if(!pending)setField(null);}}><section className="closing-modal-content cushman-dialog cushman-obligation-dialog" role="dialog" aria-modal="true" aria-label={fieldColumn.name} onClick={event=>event.stopPropagation()}><div className="closing-modal-header"><div className="closing-modal-title"><FileCheck size={20}/>{fieldColumn.name}</div><button type="button" className="closing-modal-close-btn" aria-label="Fechar campo" disabled={pending>0} onClick={()=>setField(null)}><X size={20}/></button></div><div className="closing-modal-body"><p>{fieldRow.company.name}</p><PayrollInput column={fieldColumn} value={fieldRow.columnsData[field?.key||'']} disabled={!canEdit||fieldColumn.isEditable===false} onSave={async value=>{await saveColumn(fieldRow,field?.key||'',value);setField(null);}}/><p className="cushman-help">O campo salva ao sair da edição.</p></div></section></div>}
 </>}
 </div></main></div>;
}
