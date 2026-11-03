import {AccountingMonthsModal} from './AccountingMonthsModal';
import {ClosingProgressDetails} from './ClosingProgressDetails';
import {groupAccountingColumns,buildClosingProgress,summarizeClosingProgress} from '../config/closingProgress';
import {useEffect,useMemo,useRef,useState,useDeferredValue} from 'react';
import {Building2,FileCheck,CheckCircle2,Clock,AlertCircle,Sparkles,Search,ChevronLeft,ChevronRight,ExternalLink,AlertTriangle,Copy,RefreshCw,LockKeyhole,X} from 'lucide-react';
import {Sidebar} from './Sidebar';
import {CompanyDetailsModal,getCertificateStatus,formatCnpj,formatRegimeLabel} from './CompanyDetailsModal';
import {ClosingSectorTabs,hasSectorAccess} from './ClosingSectorTabs';
import {PayrollInput} from './PayrollClosings';
import {useCompetenceCalendar} from './useCompetenceCalendar';
import {TableSkeleton,ButtonSpinner} from './LoadingSkeleton';
import {ACCOUNTING_API_VERSION,accountingYear,accountingMonth,NOT_CLIENT} from '../config/accountingColumns';
import {resolveColumnKey} from '../config/payrollColumns';
import {visibilitySummary} from '../config/columnVisibility';
import {exportToCsv} from '../utils/exportCsv';
import {compareCodes,formatCompanyCode} from '../utils/codeSort';
import {canUserEditCompany,canUserViewCompany,isUserResponsibleForCompany} from '../config/companyPermissions';
import {installmentHeaders} from '../config/installments';
import type {CurrentUser} from '../types/auth';
import {API_URL as API} from '../api';
import './AccountingClosings.css';
type Props={currentView:string;onNavigate:(view:string)=>void;currentUser?:CurrentUser|null;onLogout?:()=>void};
type Row={company:any;closingId:string;columnsData:Record<string,any>;calculatedStatus:string;progressPercent:number};
export const ACCOUNTING_HEADERS=['Código','Empresa / Certificado','Grupo','Responsável','CNPJ','Situação','Tributação'];
function monthClass(value:any){return value==='OK - FINALIZADO'?'done':value==='SEM MOVIMENTO'?'no-movement':value==='DOC. REDE'?'documents':value==='COBRANÇA DOC.'?'collection':'pending';}
export function AccountingClosings({currentView,onNavigate,currentUser,onLogout}:Props){
  const [progressOpen,setProgressOpen]=useState(false);const [monthsClosingId,setMonthsClosingId]=useState('');
  const [year,setYear]=useState(()=>accountingYear());
  const latestPeriod=useCompetenceCalendar();
  const latestYear=new Date(Date.UTC(latestPeriod.getUTCFullYear(),latestPeriod.getUTCMonth()+1,1)).getUTCFullYear();
  const [rows,setRows]=useState<Row[]>([]);const [columns,setColumns]=useState<any[]>([]);const [users,setUsers]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [pending,setPending]=useState(0);
  const [search,setSearch]=useState('');const [situation,setSituation]=useState('ALL');const [responsibleFilter,setResponsibleFilter]=useState('ALL');const [regime,setRegime]=useState('ALL');const [groupFilter,setGroupFilter]=useState('ALL');
  const [sort,setSort]=useState<{key:'code'|'name'|'groupName';asc:boolean}>({key:'code',asc:true});
  const [companyDetails,setCompanyDetails]=useState<any|null>(null);
  const [notes,setNotes]=useState<{row:Row;column:any}|null>(null);const [noteDraft,setNoteDraft]=useState('');const [noteSaving,setNoteSaving]=useState(false);const [noteError,setNoteError]=useState('');
  const [copied,setCopied]=useState('');const [scrollWidth,setScrollWidth]=useState(0);
  const [onlyMyCompanies,setOnlyMyCompanies]=useState(false);
  const tableScroll=useRef<HTMLDivElement>(null);const upperScroll=useRef<HTMLDivElement>(null);const syncingScroll=useRef(false);const sequence=useRef(0);const queue=useRef<Promise<any>>(Promise.resolve());const currentYear=useRef(year);currentYear.current=year;
  const syncScroll=(source:HTMLDivElement,target:HTMLDivElement|null)=>{if(!target||syncingScroll.current)return;syncingScroll.current=true;target.scrollLeft=source.scrollLeft;requestAnimationFrame(()=>{syncingScroll.current=false;});};
  const canView=hasSectorAccess(currentUser,'CONTABIL');const canEdit=hasSectorAccess(currentUser,'CONTABIL',true);
  const isPrivileged=currentUser?.role==='ADMIN'||currentUser?.role==='SOCIO';
  const isRowEditable=(row:Row)=>canEdit&&(isPrivileged||canUserEditCompany(currentUser,row.company,'CONTABIL'));
  const responsible=(company:any)=>company.responsibles?.find((entry:any)=>entry.sector==='CONTABIL')||company.responsibles?.find((entry:any)=>entry.sector==='FISCAL')||null;
  const left=(company:any)=>!!company.exitDate&&new Date(company.exitDate)<new Date(Date.UTC(year+1,0,1))&&new Date(company.exitDate)<=new Date();
  async function load(){
    const request=++sequence.current;setLoading(true);setError('');
    try{const response=await fetch(`${API}/accounting-closings?year=${year}`);const data=await response.json();if(!response.ok)throw new Error(data.error||'Não foi possível carregar o Contábil.');if(request!==sequence.current)return;
      if(data.accountingApiVersion!==ACCOUNTING_API_VERSION)throw new Error('Reinicie a API para carregar a atualização do Contábil.');
      if(!data.configured)throw new Error('Prepare as colunas com npx.cmd tsx scripts/configurar-contabil.ts.');
      setRows(data.rows||[]);setColumns(data.columns||[]);setUsers(data.users||[]);
    }catch(cause){if(request===sequence.current){setRows([]);setColumns([]);setError(cause instanceof Error?cause.message:'Erro ao carregar.');}}finally{if(request===sequence.current)setLoading(false);}
  }
  useEffect(()=>{if(canView)void load();return()=>{sequence.current++;};},[year,canView]);
  useEffect(()=>{setNotes(null);setCompanyDetails(null);setMonthsClosingId('');setProgressOpen(false);},[year]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setCompanyDetails(null);if(!noteSaving)setNotes(null);}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[noteSaving]);
  useEffect(()=>{if(!copied)return;const timer=window.setTimeout(()=>setCopied(''),2500);return()=>window.clearTimeout(timer);},[copied]);
  useEffect(()=>{const table=tableScroll.current?.querySelector('table');if(!table)return;const update=()=>setScrollWidth(table.scrollWidth);update();const observer=new ResizeObserver(update);observer.observe(table);return()=>observer.disconnect();},[loading,columns]);
  const scopedRows=useMemo(()=>rows.filter(row=>{
    if(onlyMyCompanies)return isUserResponsibleForCompany(currentUser,row.company,'CONTABIL');
    if(!currentUser||isPrivileged)return true;
    return canUserViewCompany(currentUser,row.company,'CONTABIL');
  }),[rows,currentUser,onlyMyCompanies,isPrivileged]);
  const deferredSearch = useDeferredValue(search);
  const groups=useMemo(()=>Array.from(new Set(scopedRows.map(row=>row.company.groupName).filter(Boolean))).sort((a:any,b:any)=>String(a).localeCompare(String(b),'pt-BR')),[scopedRows]);
  const filtered=useMemo(()=>scopedRows.filter(row=>{
    const company=row.company;const term=deferredSearch.trim().toLocaleLowerCase('pt-BR');const text=[company.code,formatCompanyCode(company.code),company.name,company.tradeName,company.cnpj,company.groupName,company.city].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
    const digits=term.replace(/\D/g,'');const match=text.includes(term)||(digits.length>0&&(company.cnpj||'').replace(/\D/g,'').includes(digits));
    return match&&(situation==='ALL'||(situation==='LEFT'?left(company):!left(company)))&&(responsibleFilter==='ALL'||responsible(company)?.userId===responsibleFilter)&&(regime==='ALL'||company.taxRegime===regime)&&(groupFilter==='ALL'||company.groupName===groupFilter);
  }).sort((a,b)=> {
    if (sort.key === 'code') return compareCodes(a.company.code, b.company.code, sort.asc);
    if (sort.key === 'groupName') return String(a.company.groupName||'').localeCompare(String(b.company.groupName||''),'pt-BR',{numeric:true})*(sort.asc?1:-1);
    return String(a.company[sort.key]||'').localeCompare(String(b.company[sort.key]||''),'pt-BR',{numeric:true})*(sort.asc?1:-1);
  }),[scopedRows,deferredSearch,situation,responsibleFilter,regime,groupFilter,sort,year]);
  const visibleColumns=groupAccountingColumns(columns);const monthsRow=rows.find(row=>row.closingId===monthsClosingId);
  const regimes=Array.from(new Set(scopedRows.map(row=>row.company.taxRegime).filter(Boolean)));
  const summary=summarizeClosingProgress(buildClosingProgress(scopedRows,columns,'CONTABIL',new Date(Date.UTC(year,0,1)),latestPeriod),scopedRows.length);
  function save(row:Row,column:any,value:any):Promise<void>{
    if(!isRowEditable(row))return Promise.reject(new Error('Você só pode editar empresas sob sua responsabilidade.'));
    const capturedYear=year;const key=resolveColumnKey(column)||column.id;setPending(total=>total+1);
    const job=queue.current.catch(()=>{}).then(async()=>{const response=await fetch(`${API}/closings/${row.closingId}/column`,{method:'PUT',headers:installmentHeaders(currentUser),body:JSON.stringify({columnKey:key,columnValue:value,userId:currentUser?.id,userName:currentUser?.name,userEmail:currentUser?.email})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Erro ao salvar.');if(currentYear.current===capturedYear)setRows(previous=>previous.map(item=>item.closingId===row.closingId?{...item,columnsData:data.closing.columnsData,calculatedStatus:data.calculatedStatus,progressPercent:data.progressPercent}:item));});
    queue.current=job;return job.finally(()=>setPending(total=>total-1));
  }
  async function changeResponsible(row:Row,userId:string){
    if(!isRowEditable(row))return;
    const capturedYear=year;setPending(total=>total+1);
    try{const response=await fetch(`${API}/companies/${row.company.id}/responsible`,{method:'PUT',headers:installmentHeaders(currentUser),body:JSON.stringify({userId,sector:'CONTABIL',actorId:currentUser?.id,actorEmail:currentUser?.email,actorName:currentUser?.name||currentUser?.email})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Erro ao salvar responsável.');const selectedUser=users.find(u=>u.id===userId);if(currentYear.current===capturedYear)setRows(previous=>previous.map(item=>item.company.id===row.company.id?{...item,company:{...item.company,responsibles:[...(item.company.responsibles||[]).filter((entry:any)=>entry.sector!=='CONTABIL'&&entry.sector!==null),...(userId?[{userId,sector:'CONTABIL',user:selectedUser}]:[])]}}:item));}
    catch(cause){setError(cause instanceof Error?cause.message:'Erro ao salvar.');}finally{setPending(total=>total-1);}
  }

  const handleExport = () => {
    const csvColumns = [
      { header: 'Código', key: 'code' },
      { header: 'Empresa', key: 'name' },
      { header: 'Grupo', key: 'groupName' },
      { header: 'Responsável', key: 'responsible' },
      { header: 'CNPJ', key: 'cnpj' },
      { header: 'Situação', key: 'situation' },
      { header: 'Tributação', key: 'taxRegime' },
      // O Contábil exibe as colunas anuais + meses consolidados ou todas as colunas
      ...columns.map(c => ({ header: c.name, key: c.id }))
    ];

    const data = filtered.map(r => {
      const isLeft = left(r.company);
      const resp = responsible(r.company);
      const respUser = resp?.user || users.find((u: any) => u.id === resp?.userId);
      const respName = (respUser?.name || respUser?.email || 'Não atribuído').replace(/\s*\(Inativo\)$/i, '');
      const rowData: any = {
        code: formatCompanyCode(r.company.code),
        name: r.company.name || '',
        responsible: respName,
        cnpj: formatCnpj(r.company.cnpj) || '',
        situation: isLeft ? `Saiu em ${new Date(r.company.exitDate).toLocaleDateString('pt-BR',{timeZone:'UTC'})}` : 'Ativa',
        groupName: r.company.groupName || '',
        taxRegime: formatRegimeLabel(r.company.taxRegime)
      };

      columns.forEach(col => {
        const key = resolveColumnKey(col) || col.id;
        const val = r.columnsData[key];
        rowData[col.id] = val || '';
      });
      return rowData;
    });

    exportToCsv(`fechamento_contabil_${year}`, csvColumns, data);
  };

  return <div className="crm-dashboard"><Sidebar currentView={currentView} onNavigate={onNavigate} currentUser={currentUser} onLogout={onLogout}/><main className="crm-main"><div className="closings-container payroll-closings accounting-closings">
    <div className="closings-header"><div className="closings-header-titles"><h1><FileCheck size={28} color="#818cf8"/>Fechamento Contábil</h1><p>Controle anual dos meses e obrigações contábeis</p></div><div className="closings-header-actions"><ClosingSectorTabs sector="CONTABIL" currentUser={currentUser} onNavigate={onNavigate}/><div className="month-selector-box"><button className="month-nav-btn" aria-label="Ano anterior" disabled={pending>0||year<=1900} onClick={()=>setYear(year-1)}><ChevronLeft size={20}/></button><span className="month-display-text">Ano {year}</span><button className="month-nav-btn" aria-label="Próximo ano" title="Novo ano liberado automaticamente em janeiro" disabled={pending>0||year>=latestYear} onClick={()=>{if(year<latestYear)setYear(year+1);}}><ChevronRight size={20}/></button></div></div></div>
    {!canView?<p>Você não tem acesso ao setor Contábil.</p>:<>
      <p className="accounting-calendar-note">Novo ano automático em janeiro, com campos zerados. Os meses liberam na virada seguinte; as empresas que saíram permanecem no histórico do ano.</p>
      <div className="closings-stats-grid">{[{label:'Total Empresas',value:summary.total,kind:'total',Icon:Building2},{label:'Concluídos',value:summary.completed,kind:'completed',Icon:CheckCircle2},{label:'Em Andamento',value:summary.inProgress,kind:'in-progress',Icon:Clock},{label:'Pendentes',value:summary.pending,kind:'pending',Icon:AlertCircle},{label:'Progresso (Campos)',value:summary.overallPercent+'%',kind:'percent',Icon:Sparkles},{label:'Progresso (Empresas)',value:(summary.total ? Math.round(summary.completed / summary.total * 100) : 0)+'%',kind:'percent',Icon:Building2}].map(({label,value,kind,Icon})=><div className={`closing-stat-card ${kind==='percent'?'progress-clickable':''}`} key={label} role={kind==='percent'?'button':undefined} tabIndex={kind==='percent'?0:undefined} aria-expanded={kind==='percent'?progressOpen:undefined} onClick={kind==='percent'?()=>setProgressOpen(v=>!v):undefined} onKeyDown={kind==='percent'?event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();setProgressOpen(v=>!v);}}:undefined}><div className={`closing-stat-icon ${kind}`}><Icon size={22}/></div><div className="closing-stat-info"><span>{label}</span><strong>{loading?'—':value}</strong></div></div>)}</div>
      <ClosingProgressDetails rows={scopedRows} columns={columns} sector="CONTABIL" period={new Date(Date.UTC(year,0,1))} latest={latestPeriod} open={progressOpen} onToggle={()=>setProgressOpen(value=>!value)} loading={loading}/>
      <div className="closings-toolbar"><div className="closings-search-box"><Search size={18} color="#94a3b8"/><input aria-label="Buscar empresa" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por código, empresa, CNPJ, grupo ou cidade..."/></div><div className="closings-filters">
        <label className="checkbox-label filter-my-companies" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, padding: '0 8px', cursor: 'pointer', userSelect: 'none', fontSize: 13, color: '#cbd5e1' }}>
          <input
            type="checkbox"
            checked={onlyMyCompanies}
            onChange={(e) => setOnlyMyCompanies(e.target.checked)}
            style={{ accentColor: '#818cf8', cursor: 'pointer' }}
          />
          <span>Minhas empresas</span>
        </label>
        <select className="closings-select" aria-label="Filtrar situação" value={situation} onChange={event=>setSituation(event.target.value)}><option value="ALL">Situação: Todas</option><option value="ACTIVE">Ativas</option><option value="LEFT">Saíram no ano</option></select>
        <select className="closings-select" aria-label="Filtrar tributação" value={regime} onChange={event=>setRegime(event.target.value)}><option value="ALL">Tributação: Todas</option>{regimes.map(value=><option key={value} value={value}>{formatRegimeLabel(value)}</option>)}</select>
        <select className="closings-select" aria-label="Filtrar grupo" value={groupFilter} onChange={event=>setGroupFilter(event.target.value)}><option value="ALL">Grupo: Todos</option>{groups.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select className="closings-select" aria-label="Filtrar responsável" value={responsibleFilter} onChange={event=>setResponsibleFilter(event.target.value)}><option value="ALL">Responsável: Todos</option>{users.map(user=><option key={user.id} value={user.id}>{user.name||user.email}</option>)}</select>
        <button className="payroll-refresh-btn" aria-label="Atualizar Contábil" disabled={pending>0||loading} onClick={()=>{void load();}}><RefreshCw size={16}/></button>
        <button className="btn-secondary-light" onClick={handleExport} title="Exportar para Excel (CSV)">
          <ExternalLink size={16} />
          Exportar
        </button>
      </div></div>
      <div className="payroll-table-meta"><span>{loading?'Carregando...':`${filtered.length} de ${scopedRows.length} empresas`} · Ano {year}</span><span className="payroll-save-status" aria-live="polite">{pending>0?<><ButtonSpinner/>Salvando alterações...</>:<><CheckCircle2 size={14}/>Salvamento automático</>}</span></div>
      {error&&<p className="payroll-error" role="alert">{error}<button onClick={()=>{void load();}}>Tentar novamente</button></p>}
      <div className="closings-table-card">{loading?<div className="payroll-loading"><TableSkeleton count={6}/></div>:<><div className="payroll-scroll-top" ref={upperScroll} onScroll={event=>syncScroll(event.currentTarget,tableScroll.current)}><div style={{width:scrollWidth||4200,height:1}}/></div><div className="closings-table-wrapper payroll-table-scroll" ref={tableScroll} onScroll={event=>syncScroll(event.currentTarget,upperScroll.current)}><table className="closings-table payroll-table accounting-table" style={{minWidth:1400+visibleColumns.length*170}}><thead><tr>
        {ACCOUNTING_HEADERS.map((label,index)=>{
          const isCode = index === 0;
          const isCompany = index === 1;
          const isGroup = label === 'Grupo';
          return (
            <th key={label} className={isCode ? 'sticky-col-code' : isCompany ? 'sticky-col-company' : ''}>
              <div className="th-header-cell">
                {isCode ? (
                  <button className="payroll-sort-btn" onClick={() => setSort({ key: 'code', asc: sort.key === 'code' ? !sort.asc : true })}>
                    {label}<span>{sort.key === 'code' ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
                  </button>
                ) : isCompany ? (
                  <button className="payroll-sort-btn" onClick={() => setSort({ key: 'name', asc: sort.key === 'name' ? !sort.asc : true })}>
                    {label}<span>{sort.key === 'name' ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
                  </button>
                ) : isGroup ? (
                  <button className="payroll-sort-btn" onClick={() => setSort({ key: 'groupName', asc: sort.key === 'groupName' ? !sort.asc : true })}>
                    {label}<span>{sort.key === 'groupName' ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
                  </button>
                ) : (
                  label
                )}
              </div>
            </th>
          );
        })}
        {visibleColumns.map(column=>{const month=accountingMonth(column);const locked=!!month&&Date.UTC(year,month-1,1)>latestPeriod.getTime();return <th key={column.id} title={locked?'Libera na virada do mês seguinte':visibilitySummary(column)}><div className="th-header-cell">{column.name}{locked&&<LockKeyhole size={12}/>}</div></th>;})}
      </tr></thead><tbody>{!filtered.length?<tr><td colSpan={7+visibleColumns.length} className="payroll-empty">Nenhuma empresa encontrada neste ano.</td></tr>:filtered.map(row=>{const company=row.company;const certificate=company.hasClientCertificate?getCertificateStatus(company.certificateExpiration):null;return <tr key={row.closingId}>
        <td className="sticky-col-code"><span style={{fontWeight:600,color:'#94a3b8'}}>{formatCompanyCode(company.code)||'—'}</span></td>
        <td className="sticky-col-company"><div className="company-cell-wrapper"><button className="company-interactive-link" onClick={()=>setCompanyDetails(company)}><div className="company-link-left"><Building2 size={16} color="#818cf8"/><span>{company.name}</span></div><div className="company-link-icon-chip"><span>Ver Dados</span><ExternalLink size={10}/></div></button>{company.tradeName&&<div className="company-cell-trade">{company.tradeName}</div>}{certificate&&<button className={`cert-warning-tag ${certificate.status==='EXPIRED'?'expired':''}`} onClick={()=>setCompanyDetails(company)}><AlertTriangle size={12}/>{certificate.label}</button>}</div></td>
        <td>{company.groupName ? <span className="group-badge" style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.1)', color: '#a5b4fc', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{company.groupName}</span> : <span style={{ color: '#64748b' }}>—</span>}</td>
        <td><select className="table-user-select" aria-label={`Responsável Contábil de ${company.name}`} value={responsible(company)?.userId||''} disabled={!isRowEditable(row)||pending>0} onChange={event=>{void changeResponsible(row,event.target.value);}}><option value="">Não atribuído</option>{users.map(user=><option key={user.id} value={user.id} disabled={user.active===false}>{user.name||user.email}</option>)}</select></td>
        <td><button className="copy-badge-btn" title="Copiar CNPJ" onClick={()=>{void navigator.clipboard.writeText(company.cnpj||'').then(()=>setCopied('CNPJ copiado!')).catch(()=>setError('Não foi possível copiar.'));}}>{formatCnpj(company.cnpj||'')}<Copy size={12}/></button></td>
        <td><span className={`status-badge ${left(company)?'pending':'completed'}`}>{left(company)?`Saiu em ${new Date(company.exitDate).toLocaleDateString('pt-BR',{timeZone:'UTC'})}`:'Ativa'}</span></td>
        <td><span className={`tax-regime-pill ${company.taxRegime==='SIMPLES_NACIONAL'?'simples':company.taxRegime?.includes('PRESUMIDO')?'presumido':company.taxRegime?.includes('REAL')?'real':company.taxRegime==='MEI'?'mei':''}`}>{formatRegimeLabel(company.taxRegime||'')}</span></td>
        {visibleColumns.map(column=>{if(column.isMonthsGroup){const values=column.months.map((monthColumn:any)=>row.columnsData[resolveColumnKey(monthColumn)||monthColumn.id]).filter((value:any)=>value!==NOT_CLIENT);const done=values.filter((value:any)=>['OK - FINALIZADO','SEM MOVIMENTO'].includes(value)).length;return <td key={column.id}><button type="button" className="accounting-months-button" onClick={()=>setMonthsClosingId(row.closingId)} aria-label={`Ver meses de ${company.name}`}><strong>Meses · {year}</strong><small>{values.length?`${done} / ${values.length} meses concluídos · abrir`:'Não é cliente no período · abrir'}</small></button></td>;}const key=resolveColumnKey(column)||column.id;const value=row.columnsData[key];const month=accountingMonth(column);const blocked=!!month&&Date.UTC(year,month-1,1)>latestPeriod.getTime();return <td key={column.id} className={month?`accounting-month ${monthClass(value)}`:''} title={blocked?'Esta competência abre no mês seguinte':value===NOT_CLIENT?'Definido pelas datas de obrigação e saída':undefined}>
          {month&&value===NOT_CLIENT?<span className="obligation-btn na accounting-not-client">{NOT_CLIENT}</span>:key==='cont_observacao'?<button className="copy-badge-btn" style={{background:value?'rgba(99,102,241,.15)':undefined}} title={value||'Observações Contábil'} onClick={()=>{setNotes({row,column});setNoteDraft(value||'');setNoteError('');}}>{value?String(value).slice(0,16)+(String(value).length>16?'...':''):'+ Obs'}</button>:<PayrollInput column={column} value={value} disabled={!isRowEditable(row)||column.isEditable===false||blocked} onSave={next=>save(row,column,next)}/>}
        </td>;})}
      </tr>;})}</tbody></table></div></>}</div>
    </>}
  </div></main>
  {copied&&<div className="payroll-copy-toast" role="status"><CheckCircle2 size={16}/>{copied}</div>}
  {monthsRow&&<AccountingMonthsModal row={monthsRow} columns={columns} year={year} latest={latestPeriod} canEdit={isRowEditable(monthsRow)} pending={pending} onSave={save} onClose={()=>setMonthsClosingId('')}/>}
  {companyDetails&&(()=>{
    const activeCompanyRow = rows.find(r => r.company.id === companyDetails.id);
    const notesCol = columns.find(c => (resolveColumnKey(c) || c.id) === 'cont_observacao');
    const noteKey = notesCol ? (resolveColumnKey(notesCol) || notesCol.id) : 'cont_observacao';
    const initialNotesValue = activeCompanyRow?.columnsData?.[noteKey] ?? companyDetails.notes ?? '';
    return (
      <CompanyDetailsModal
        company={companyDetails}
        notesLabel="Observações Contábil"
        initialNotes={initialNotesValue}
        canEditNotes={activeCompanyRow ? isRowEditable(activeCompanyRow) : false}
        onSaveNotes={activeCompanyRow && notesCol ? async (newNotes: string) => {
          await save(activeCompanyRow, notesCol, newNotes);
          try {
            await fetch(`${API}/companies/${companyDetails.id}/notes`, {
              method: 'PUT',
              headers: installmentHeaders(currentUser),
              body: JSON.stringify({ notes: newNotes, notesScope: 'CONTABIL' })
            });
            setCompanyDetails((prev: any) => prev ? { ...prev, notes: newNotes } : prev);
          } catch {
            // non-blocking
          }
        } : undefined}
        onClose={() => setCompanyDetails(null)}
      />
    );
  })()}
  {notes&&<div className="closing-modal-backdrop" onClick={()=>{if(!noteSaving)setNotes(null);}}><div className="closing-modal-content" style={{maxWidth:520}} onClick={event=>event.stopPropagation()}><div className="closing-modal-header"><div className="closing-modal-title purple">Observações Contábil · {year}</div><button className="closing-modal-close-btn" aria-label="Fechar observações" disabled={noteSaving} onClick={()=>setNotes(null)}><X size={20}/></button></div><div className="closing-modal-body"><p>{notes.row.company.name}</p><textarea className="payroll-note-textarea" value={noteDraft} disabled={!isRowEditable(notes.row)||noteSaving||notes.column.isEditable===false} onChange={event=>setNoteDraft(event.target.value)} rows={6}/>{noteError&&<p role="alert">{noteError}</p>}<div className="sub-modal-actions"><button className="btn-secondary-light" disabled={noteSaving} onClick={()=>setNotes(null)}>Fechar</button>{isRowEditable(notes.row)&&notes.column.isEditable!==false&&<button className="btn-primary-gradient" disabled={noteSaving} onClick={async()=>{setNoteSaving(true);setNoteError('');try{await save(notes.row,notes.column,noteDraft);setNotes(null);}catch(cause){setNoteError(cause instanceof Error?cause.message:'Erro ao salvar.');}finally{setNoteSaving(false);}}}>{noteSaving?'Salvando...':'Salvar observações'}</button>}</div></div></div></div>}
  </div>;
}
