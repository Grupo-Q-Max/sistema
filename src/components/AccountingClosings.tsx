import {AccountingMonthsModal} from './AccountingMonthsModal';
import {ClosingProgressDetails} from './ClosingProgressDetails';
import {groupAccountingColumns,buildClosingProgress,summarizeClosingProgress} from '../config/closingProgress';
import {useEffect,useMemo,useRef,useState,useDeferredValue} from 'react';
import {Building2,FileCheck,CheckCircle2,Clock,AlertCircle,Sparkles,Search,ChevronLeft,ChevronRight,ExternalLink,AlertTriangle,Copy,RefreshCw,LockKeyhole,X,Users,BarChart3,Filter,Check,Calendar} from 'lucide-react';
import {Sidebar} from './Sidebar';
import {CompanyDetailsModal,getCertificateStatus,formatCnpj,formatRegimeLabel} from './CompanyDetailsModal';
import {BulkAssignResponsibleModal} from './BulkAssignResponsibleModal';
import {ResponsibleWorkloadModal} from './ResponsibleWorkloadModal';
import {ClosingSectorTabs,hasSectorAccess} from './ClosingSectorTabs';
import {PayrollInput} from './PayrollClosings';
import {AccountingMonthInput,parseMonthValue} from './AccountingMonthInput';
import {useCompetenceCalendar} from './useCompetenceCalendar';
import {TableSkeleton,ButtonSpinner} from './LoadingSkeleton';
import {ACCOUNTING_API_VERSION,accountingYear,accountingMonth,NOT_CLIENT} from '../config/accountingColumns';
import {resolveColumnKey} from '../config/payrollColumns';
import {visibilitySummary} from '../config/columnVisibility';
import {exportToCsv} from '../utils/exportCsv';
import {compareCodes,formatCompanyCode} from '../utils/codeSort';
import {canUserEditCompany,canUserViewCompany,isUserResponsibleForCompany,companyBelongsToSector} from '../config/companyPermissions';
import {installmentHeaders} from '../config/installments';
import type {CurrentUser} from '../types/auth';
import {API_URL as API} from '../api';
import './AccountingClosings.css';
type Props={currentView:string;onNavigate:(view:string)=>void;currentUser?:CurrentUser|null;onLogout?:()=>void};
type Row={company:any;closingId:string;columnsData:Record<string,any>;calculatedStatus:string;progressPercent:number};
export const ACCOUNTING_HEADERS=['Código','Empresa / Certificado','Grupo','Responsável','CNPJ','Situação','Tributação'];
function monthClass(value:any){
  const str = typeof value === 'object' && value !== null ? (value.status || value.label || '') : String(value || '');
  return str.startsWith('OK - FINALIZADO') ? 'done'
    : str.startsWith('SEM MOVIMENTO') ? 'no-movement'
    : str.startsWith('DOC. REDE') ? 'documents'
    : str.startsWith('COBRANÇA DOC.') ? 'collection'
    : 'pending';
}
export function AccountingClosings({currentView,onNavigate,currentUser,onLogout}:Props){
  const [progressOpen,setProgressOpen]=useState(false);const [monthsClosingId,setMonthsClosingId]=useState('');
  const [year,setYear]=useState(()=>accountingYear());
  const latestPeriod=useCompetenceCalendar();
  const latestYear=new Date(Date.UTC(latestPeriod.getUTCFullYear(),latestPeriod.getUTCMonth()+1,1)).getUTCFullYear();
  const [rows,setRows]=useState<Row[]>([]);const [columns,setColumns]=useState<any[]>([]);const [users,setUsers]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [pending,setPending]=useState(0);
  const [search,setSearch]=useState('');const [situation,setSituation]=useState('ALL');const [statusFilter,setStatusFilter]=useState<'ALL'|'COMPLETED'|'IN_PROGRESS'|'PENDING'>('ALL');const [responsibleFilter,setResponsibleFilter]=useState('ALL');const [regime,setRegime]=useState('ALL');const [groupFilter,setGroupFilter]=useState('ALL');const [certFilter,setCertFilter]=useState('ALL');
  const [monthStatusFilter,setMonthStatusFilter]=useState<'ALL'|'DONE'|'DOC_REDE'|'SEM_MOVIMENTO'|'COBRANCA'|'PENDING'>('ALL');
  const [columnFilters,setColumnFilters]=useState<Record<string,string>>({});
  const [openHeaderFilter,setOpenHeaderFilter]=useState<string|null>(null);
  const [sort,setSort]=useState<{key:'code'|'name'|'groupName';asc:boolean}>({key:'code',asc:true});
  const [selectedCompanyIds,setSelectedCompanyIds]=useState<string[]>([]);
  const [bulkAssignOpen,setBulkAssignOpen]=useState(false);
  const [bulkToast,setBulkToast]=useState<string|null>(null);
  const [workloadOpen,setWorkloadOpen]=useState(false);
  const [companyDetails,setCompanyDetails]=useState<any|null>(null);
  const [notes,setNotes]=useState<{row:Row;column:any}|null>(null);const [noteDraft,setNoteDraft]=useState('');const [noteSaving,setNoteSaving]=useState(false);const [noteError,setNoteError]=useState('');
  const [copied,setCopied]=useState('');const [scrollWidth,setScrollWidth]=useState(0);
  const [onlyMyCompanies,setOnlyMyCompanies]=useState(false);
  const tableScroll=useRef<HTMLDivElement>(null);const upperScroll=useRef<HTMLDivElement>(null);const syncingScroll=useRef(false);const sequence=useRef(0);const queue=useRef<Promise<any>>(Promise.resolve());const currentYear=useRef(year);currentYear.current=year;
  const syncScroll=(source:HTMLDivElement,target:HTMLDivElement|null)=>{if(!target||syncingScroll.current)return;syncingScroll.current=true;target.scrollLeft=source.scrollLeft;requestAnimationFrame(()=>{syncingScroll.current=false;});};
  const canView=hasSectorAccess(currentUser,'CONTABIL');const canEdit=hasSectorAccess(currentUser,'CONTABIL',true);
  const isPrivileged=currentUser?.role==='ADMIN'||currentUser?.role==='SOCIO';
  const isRowEditable=(row:Row)=>canEdit&&(isPrivileged||canUserEditCompany(currentUser,row.company,'CONTABIL'));
  const responsible=(company:any)=>company.responsibles?.find((entry:any)=>entry.sector==='CONTABIL')||null;
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
  useEffect(()=>{setNotes(null);setCompanyDetails(null);setMonthsClosingId('');setProgressOpen(false);setOpenHeaderFilter(null);setMonthStatusFilter('ALL');setColumnFilters({});},[year]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setCompanyDetails(null);if(!noteSaving)setNotes(null);}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[noteSaving]);
  useEffect(()=>{
    if(!openHeaderFilter)return;
    const handlePointerDown=(event:MouseEvent|TouchEvent)=>{
      const target=event.target as HTMLElement|null;
      if(!target?.closest('.th-filter-wrapper'))setOpenHeaderFilter(null);
    };
    const handleKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpenHeaderFilter(null);};
    document.addEventListener('pointerdown',handlePointerDown as any);
    document.addEventListener('keydown',handleKeyDown);
    return()=>{
      document.removeEventListener('pointerdown',handlePointerDown as any);
      document.removeEventListener('keydown',handleKeyDown);
    };
  },[openHeaderFilter]);
  useEffect(()=>{if(!copied)return;const timer=window.setTimeout(()=>setCopied(''),2500);return()=>window.clearTimeout(timer);},[copied]);
  useEffect(()=>{const table=tableScroll.current?.querySelector('table');if(!table)return;const update=()=>setScrollWidth(table.scrollWidth);update();const observer=new ResizeObserver(update);observer.observe(table);return()=>observer.disconnect();},[loading,columns]);
  const scopedRows=useMemo(()=>rows.filter(row=>{
    if(!companyBelongsToSector(row.company,'CONTABIL')) return false;
    if(onlyMyCompanies)return isUserResponsibleForCompany(currentUser,row.company,'CONTABIL');
    if(!currentUser||isPrivileged)return true;
    return canUserViewCompany(currentUser,row.company,'CONTABIL');
  }),[rows,currentUser,onlyMyCompanies,isPrivileged]);
  const deferredSearch = useDeferredValue(search);
  const groups=useMemo(()=>Array.from(new Set(scopedRows.map(row=>row.company.groupName).filter(Boolean))).sort((a:any,b:any)=>String(a).localeCompare(String(b),'pt-BR')),[scopedRows]);

  const contabilUsers = useMemo(() => {
    const assignedUserIds = new Set(
      scopedRows.map(r => responsible(r.company)?.userId).filter(Boolean)
    );
    const activeContabilUsers = users.filter(u => assignedUserIds.has(u.id) || u.role === 'ADMIN' || u.role === 'SOCIO');
    return activeContabilUsers.length > 0 ? activeContabilUsers : users;
  }, [scopedRows, users]);

  const monthsBreakdown = useMemo(() => {
    let totalEligible = 0;
    let done = 0;
    let noMovement = 0;
    let docRede = 0;
    let collection = 0;
    let pending = 0;

    for (const row of scopedRows) {
      for (let m = 0; m < 12; m++) {
        const isBlocked = Date.UTC(year, m, 1) > latestPeriod.getTime();
        if (isBlocked) continue;

        const col = columns.find(item => accountingMonth(item) === m + 1);
        const key = col ? (resolveColumnKey(col) || col.id) : `cont_mes_${String(m + 1).padStart(2, '0')}`;
        const val = row.columnsData?.[key];

        if (val === NOT_CLIENT) continue;

        const valStr = typeof val === 'object' && val !== null ? (val.status || val.value || '') : String(val || '');

        totalEligible++;
        if (valStr.startsWith('OK - FINALIZADO')) {
          done++;
        } else if (valStr.startsWith('SEM MOVIMENTO')) {
          noMovement++;
        } else if (valStr.startsWith('DOC. REDE')) {
          docRede++;
        } else if (valStr.startsWith('COBRANÇA DOC.')) {
          collection++;
        } else {
          pending++;
        }
      }
    }

    return { totalEligible, done, noMovement, docRede, collection, pending };
  }, [scopedRows, columns, year, latestPeriod]);

  const filtered=useMemo(()=>scopedRows.filter(row=>{
    const company=row.company;const term=deferredSearch.trim().toLocaleLowerCase('pt-BR');const text=[company.code,formatCompanyCode(company.code),company.name,company.tradeName,company.cnpj,company.groupName,company.city].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
    const digits=term.replace(/\D/g,'');const match=text.includes(term)||(digits.length>0&&(company.cnpj||'').replace(/\D/g,'').includes(digits));
    let matchCert = true;
    if (certFilter !== 'ALL') {
      const cert = company.hasClientCertificate ? getCertificateStatus(company.certificateExpiration) : null;
      if (certFilter === 'EXPIRING') matchCert = cert?.status === 'EXPIRED' || cert?.status === 'WARNING';
      else if (certFilter === 'EXPIRED') matchCert = cert?.status === 'EXPIRED';
      else if (certFilter === 'WARNING') matchCert = cert?.status === 'WARNING';
      else if (certFilter === 'OK') matchCert = cert?.status === 'OK';
      else if (certFilter === 'HAS_CERT') matchCert = Boolean(company.hasClientCertificate);
      else if (certFilter === 'NO_CERT') matchCert = !company.hasClientCertificate;
    }

    let matchMonthStatus = true;
    if (monthStatusFilter !== 'ALL') {
      let hasMatch = false;
      for (let m = 0; m < 12; m++) {
        const isBlocked = Date.UTC(year, m, 1) > latestPeriod.getTime();
        if (isBlocked) continue;
        const col = columns.find(item => accountingMonth(item) === m + 1);
        const k = col ? (resolveColumnKey(col) || col.id) : `cont_mes_${String(m + 1).padStart(2, '0')}`;
        const val = row.columnsData?.[k];
        if (val === NOT_CLIENT) continue;

        const valStr = typeof val === 'object' && val !== null ? (val.status || val.value || '') : String(val || '');

        if (monthStatusFilter === 'DONE' && (valStr.startsWith('OK - FINALIZADO') || valStr.startsWith('SEM MOVIMENTO'))) { hasMatch = true; break; }
        if (monthStatusFilter === 'DOC_REDE' && valStr.startsWith('DOC. REDE')) { hasMatch = true; break; }
        if (monthStatusFilter === 'SEM_MOVIMENTO' && valStr.startsWith('SEM MOVIMENTO')) { hasMatch = true; break; }
        if (monthStatusFilter === 'COBRANCA' && valStr.startsWith('COBRANÇA DOC.')) { hasMatch = true; break; }
        if (monthStatusFilter === 'PENDING' && (!valStr || valStr === 'Pendente')) { hasMatch = true; break; }
      }
      matchMonthStatus = hasMatch;
    }

    let matchColumnFilters = true;
    for (const [colKey, filterVal] of Object.entries(columnFilters)) {
      if (!filterVal || filterVal === 'ALL') continue;
      const cellVal = row.columnsData?.[colKey];
      const normalizedCell = typeof cellVal === 'object' && cellVal !== null ? (cellVal.status || cellVal.value || '') : String(cellVal || '');
      if (normalizedCell !== filterVal) {
        matchColumnFilters = false;
        break;
      }
    }

    return match && matchCert && matchMonthStatus && matchColumnFilters &&(situation==='ALL'||(situation==='LEFT'?left(company):!left(company)))&&(statusFilter==='ALL'||row.calculatedStatus===statusFilter)&&(responsibleFilter==='ALL'||(responsibleFilter==='UNASSIGNED'?!responsible(company)?.userId:responsible(company)?.userId===responsibleFilter))&&(regime==='ALL'||company.taxRegime===regime)&&(groupFilter==='ALL'||company.groupName===groupFilter);
  }).sort((a,b)=> {
    if (sort.key === 'code') return compareCodes(a.company.code, b.company.code, sort.asc);
    if (sort.key === 'groupName') return String(a.company.groupName||'').localeCompare(String(b.company.groupName||''),'pt-BR',{numeric:true})*(sort.asc?1:-1);
    return String(a.company[sort.key]||'').localeCompare(String(b.company[sort.key]||''),'pt-BR',{numeric:true})*(sort.asc?1:-1);
  }),[scopedRows,deferredSearch,situation,statusFilter,responsibleFilter,regime,groupFilter,certFilter,monthStatusFilter,columnFilters,sort,year,columns,latestPeriod]);
  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedCompanyIds.includes(r.company.id));
  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedCompanyIds([]);
    } else {
      setSelectedCompanyIds(filtered.map(r => r.company.id));
    }
  };
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
    try{
      const response=await fetch(`${API}/companies/${row.company.id}/responsible`,{
        method:'PUT',
        headers:installmentHeaders(currentUser),
        body:JSON.stringify({
          userId,
          sector:'CONTABIL',
          actorId:currentUser?.id,
          actorEmail:currentUser?.email,
          actorName:currentUser?.name||currentUser?.email
        })
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||'Erro ao salvar responsável.');
      const selectedUser=users.find(u=>u.id===userId);
      if(currentYear.current===capturedYear){
        setRows(previous=>previous.map(item=>{
          if(item.company.id!==row.company.id)return item;
          const other=(item.company.responsibles||[]).filter((entry:any)=>entry.sector!=='CONTABIL');
          const updated=userId
            ? [...other, { companyId: row.company.id, userId, sector: 'CONTABIL', user: selectedUser }]
            : other;
          return {
            ...item,
            company: {
              ...item.company,
              responsibles: updated
            }
          };
        }));
      }
    }
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

  const handleCopyAllCnpjs = async () => {
    const cnpjs = filtered.map(r => r.company.cnpj).filter(Boolean);
    if (!cnpjs.length) {
      setCopied('Nenhum CNPJ encontrado.');
      return;
    }
    const cleanList = cnpjs.map((c: string) => c.replace(/\D/g, '')).join('\n');
    try {
      await navigator.clipboard.writeText(cleanList);
      setCopied(`${cnpjs.length} CNPJs copiados!`);
    } catch {
      setError('Não foi possível copiar os CNPJs.');
    }
  };

  return <div className="crm-dashboard"><Sidebar currentView={currentView} onNavigate={onNavigate} currentUser={currentUser} onLogout={onLogout}/><main className="crm-main"><div className="closings-container payroll-closings accounting-closings">
    <div className="closings-header"><div className="closings-header-titles"><h1><FileCheck size={28} color="#818cf8"/>Fechamento Contábil</h1><p>Controle anual dos meses e obrigações contábeis</p></div><div className="closings-header-actions"><ClosingSectorTabs sector="CONTABIL" currentUser={currentUser} onNavigate={onNavigate}/><div className="month-selector-box"><button className="month-nav-btn" aria-label="Ano anterior" disabled={pending>0||year<=1900} onClick={()=>setYear(year-1)}><ChevronLeft size={20}/></button><span className="month-display-text">Ano {year}</span><button className="month-nav-btn" aria-label="Próximo ano" title="Novo ano liberado automaticamente em janeiro" disabled={pending>0||year>=latestYear} onClick={()=>{if(year<latestYear)setYear(year+1);}}><ChevronRight size={20}/></button></div></div></div>
    {!canView?<p>Você não tem acesso ao setor Contábil.</p>:<>
      <p className="accounting-calendar-note">Novo ano automático em janeiro, com campos zerados. Os meses liberam na virada seguinte; as empresas que saíram permanecem no histórico do ano.</p>
      <div className="closings-stats-grid">{[
        { label: 'Total Empresas', value: summary.total, kind: 'total', Icon: Building2, status: 'ALL' },
        { label: 'Concluídos', value: summary.completed, kind: 'completed', Icon: CheckCircle2, status: 'COMPLETED' },
        { label: 'Em Andamento', value: summary.inProgress, kind: 'in-progress', Icon: Clock, status: 'IN_PROGRESS' },
        { label: 'Pendentes', value: summary.pending, kind: 'pending', Icon: AlertCircle, status: 'PENDING' },
        { label: 'Progresso (Campos)', value: summary.overallPercent + '%', kind: 'percent', Icon: Sparkles },
        { label: 'Progresso (Empresas)', value: (summary.total ? Math.round(summary.completed / summary.total * 100) : 0) + '%', kind: 'percent', Icon: Building2 }
      ].map(({ label, value, kind, Icon, status }) => {
        const isClickable = Boolean(status) || kind === 'percent';
        const isActive = status && status !== 'ALL' && statusFilter === status;
        return (
          <div
            className={`closing-stat-card ${kind === 'percent' ? 'progress-clickable' : isClickable ? 'stat-clickable' : ''} ${isActive ? `stat-active ${kind}` : ''}`}
            key={label}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            aria-expanded={kind === 'percent' ? progressOpen : undefined}
            title={status ? (status === 'ALL' ? 'Clique para mostrar todas' : `Clique para filtrar apenas empresas ${label.toLowerCase()}`) : kind === 'percent' ? 'Clique para ver detalhes do progresso' : undefined}
            onClick={() => {
              if (kind === 'percent') {
                setProgressOpen(v => !v);
              } else if (status) {
                setStatusFilter(prev => prev === status ? 'ALL' : (status as any));
              }
            }}
            onKeyDown={event => {
              if (['Enter', ' '].includes(event.key)) {
                event.preventDefault();
                if (kind === 'percent') {
                  setProgressOpen(v => !v);
                } else if (status) {
                  setStatusFilter(prev => prev === status ? 'ALL' : (status as any));
                }
              }
            }}
          >
            <div className={`closing-stat-icon ${kind}`}><Icon size={22} /></div>
            <div className="closing-stat-info">
              <span>{label}</span>
              <strong>{loading ? '—' : value}</strong>
            </div>
          </div>
        );
      })}</div>

      <div className="accounting-months-breakdown-card">
        <div className="breakdown-header">
          <div className="breakdown-title">
            <Calendar size={18} />
            <span>Detalhamento dos Meses · {year}</span>
          </div>
          <span className="breakdown-subtitle">
            {monthsBreakdown.totalEligible} meses liberados nas empresas ativas (clique para filtrar)
          </span>
        </div>
        <div className="breakdown-chips">
          <button
            type="button"
            className={`breakdown-chip done ${monthStatusFilter === 'DONE' ? 'active' : ''}`}
            onClick={() => setMonthStatusFilter(prev => prev === 'DONE' ? 'ALL' : 'DONE')}
            title="Filtrar empresas com meses Concluídos"
          >
            <span className="chip-dot" />
            <span className="chip-label">CONCLUÍDO</span>
            <strong>{monthsBreakdown.done} / {monthsBreakdown.totalEligible}</strong>
            <span className="chip-pct">{monthsBreakdown.totalEligible ? Math.round(monthsBreakdown.done / monthsBreakdown.totalEligible * 100) : 0}%</span>
          </button>
          <button
            type="button"
            className={`breakdown-chip doc-rede ${monthStatusFilter === 'DOC_REDE' ? 'active' : ''}`}
            onClick={() => setMonthStatusFilter(prev => prev === 'DOC_REDE' ? 'ALL' : 'DOC_REDE')}
            title="Filtrar empresas com DOC. REDE"
          >
            <span className="chip-dot" />
            <span className="chip-label">DOC. REDE</span>
            <strong>{monthsBreakdown.docRede} / {monthsBreakdown.totalEligible}</strong>
            <span className="chip-pct">{monthsBreakdown.totalEligible ? Math.round(monthsBreakdown.docRede / monthsBreakdown.totalEligible * 100) : 0}%</span>
          </button>
          <button
            type="button"
            className={`breakdown-chip no-movement ${monthStatusFilter === 'SEM_MOVIMENTO' ? 'active' : ''}`}
            onClick={() => setMonthStatusFilter(prev => prev === 'SEM_MOVIMENTO' ? 'ALL' : 'SEM_MOVIMENTO')}
            title="Filtrar empresas com SEM MOVIMENTO"
          >
            <span className="chip-dot" />
            <span className="chip-label">SEM MOVIMENTO</span>
            <strong>{monthsBreakdown.noMovement} / {monthsBreakdown.totalEligible}</strong>
            <span className="chip-pct">{monthsBreakdown.totalEligible ? Math.round(monthsBreakdown.noMovement / monthsBreakdown.totalEligible * 100) : 0}%</span>
          </button>
          <button
            type="button"
            className={`breakdown-chip collection ${monthStatusFilter === 'COBRANCA' ? 'active' : ''}`}
            onClick={() => setMonthStatusFilter(prev => prev === 'COBRANCA' ? 'ALL' : 'COBRANCA')}
            title="Filtrar empresas com COBRANÇA DOC."
          >
            <span className="chip-dot" />
            <span className="chip-label">COBRANÇA DOC.</span>
            <strong>{monthsBreakdown.collection} / {monthsBreakdown.totalEligible}</strong>
            <span className="chip-pct">{monthsBreakdown.totalEligible ? Math.round(monthsBreakdown.collection / monthsBreakdown.totalEligible * 100) : 0}%</span>
          </button>
          <button
            type="button"
            className={`breakdown-chip pending ${monthStatusFilter === 'PENDING' ? 'active' : ''}`}
            onClick={() => setMonthStatusFilter(prev => prev === 'PENDING' ? 'ALL' : 'PENDING')}
            title="Filtrar empresas com meses Pendentes"
          >
            <span className="chip-dot" />
            <span className="chip-label">PENDENTE</span>
            <strong>{monthsBreakdown.pending} / {monthsBreakdown.totalEligible}</strong>
            <span className="chip-pct">{monthsBreakdown.totalEligible ? Math.round(monthsBreakdown.pending / monthsBreakdown.totalEligible * 100) : 0}%</span>
          </button>
          {monthStatusFilter !== 'ALL' && (
            <button
              type="button"
              className="breakdown-clear-btn"
              onClick={() => setMonthStatusFilter('ALL')}
              title="Remover filtro dos meses"
            >
              <X size={13} />
              Limpar filtro
            </button>
          )}
        </div>
      </div>

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
        <select className="closings-select" aria-label="Filtrar status" value={statusFilter} onChange={event=>setStatusFilter(event.target.value as any)}><option value="ALL">Status: Todos</option><option value="COMPLETED">Concluídos</option><option value="IN_PROGRESS">Em Andamento</option><option value="PENDING">Pendentes</option></select>
        <select className="closings-select" aria-label="Filtrar situação" value={situation} onChange={event=>setSituation(event.target.value)}><option value="ALL">Situação: Todas</option><option value="ACTIVE">Ativas</option><option value="LEFT">Saíram no ano</option></select>
        <select className="closings-select" aria-label="Filtrar tributação" value={regime} onChange={event=>setRegime(event.target.value)}><option value="ALL">Tributação: Todas</option>{regimes.map(value=><option key={value} value={value}>{formatRegimeLabel(value)}</option>)}</select>
        <select className="closings-select" aria-label="Filtrar grupo" value={groupFilter} onChange={event=>setGroupFilter(event.target.value)}><option value="ALL">Grupo: Todos</option>{groups.map(value=><option key={value} value={value}>{value}</option>)}</select>
        <select className="closings-select" aria-label="Filtrar responsável" value={responsibleFilter} onChange={event=>setResponsibleFilter(event.target.value)}>
          <option value="ALL">Responsável: Todos</option>
          <option value="UNASSIGNED">Não atribuído</option>
          {contabilUsers.map(user=><option key={user.id} value={user.id}>{user.name||user.email}</option>)}
        </select>
        <select className="closings-select" aria-label="Filtrar certificado digital" value={certFilter} onChange={event=>setCertFilter(event.target.value)}>
          <option value="ALL">Certificados: Todos</option>
          <option value="EXPIRING">Vencendo ou Vencidos</option>
          <option value="EXPIRED">Apenas Vencidos</option>
          <option value="WARNING">Vencendo em até 30 dias</option>
          <option value="OK">Válidos (&gt; 30 dias)</option>
          <option value="HAS_CERT">Com certificado</option>
          <option value="NO_CERT">Sem certificado</option>
        </select>
        {statusFilter !== 'ALL' && (
          <button
            type="button"
            className="filter-clear-pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(129, 140, 248, 0.4)', color: '#c7d2fe', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setStatusFilter('ALL')}
            title="Remover filtro de status"
          >
            <span>Filtro: {statusFilter === 'COMPLETED' ? 'Concluídos' : statusFilter === 'IN_PROGRESS' ? 'Em Andamento' : 'Pendentes'}</span>
            <X size={13} />
          </button>
        )}
        {responsibleFilter !== 'ALL' && (
          <button
            type="button"
            className="filter-clear-pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(129, 140, 248, 0.4)', color: '#c7d2fe', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setResponsibleFilter('ALL')}
            title="Remover filtro de responsável"
          >
            <span>Responsável: {responsibleFilter === 'UNASSIGNED' ? 'Não atribuído' : users.find(u => u.id === responsibleFilter)?.name || 'Selecionado'}</span>
            <X size={13} />
          </button>
        )}
        {monthStatusFilter !== 'ALL' && (
          <button
            type="button"
            className="filter-clear-pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(129, 140, 248, 0.4)', color: '#c7d2fe', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setMonthStatusFilter('ALL')}
            title="Remover filtro de status dos meses"
          >
            <span>Meses: {monthStatusFilter === 'DONE' ? 'Concluídos' : monthStatusFilter === 'DOC_REDE' ? 'DOC. REDE' : monthStatusFilter === 'SEM_MOVIMENTO' ? 'Sem Movimento' : monthStatusFilter === 'COBRANCA' ? 'Cobrança Doc.' : 'Pendentes'}</span>
            <X size={13} />
          </button>
        )}
        {Object.entries(columnFilters).filter(([, val]) => val && val !== 'ALL').map(([colKey, val]) => (
          <button
            key={colKey}
            type="button"
            className="filter-clear-pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(129, 140, 248, 0.4)', color: '#c7d2fe', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setColumnFilters(prev => { const n = { ...prev }; delete n[colKey]; return n; })}
            title="Remover filtro de coluna"
          >
            <span>Filtro coluna: {val}</span>
            <X size={13} />
          </button>
        ))}
        <button className="payroll-refresh-btn" aria-label="Atualizar Contábil" disabled={pending>0||loading} onClick={()=>{void load();}}><RefreshCw size={16}/></button>
        <button type="button" className="btn-secondary-light" onClick={handleCopyAllCnpjs} title="Copiar CNPJs limpos das empresas filtradas">
          <Copy size={15} />
          Copiar CNPJs
        </button>
        <button type="button" className="btn-secondary-light" onClick={() => setWorkloadOpen(true)} title="Ver ranking e distribuição de empresas por responsável">
          <BarChart3 size={15} />
          Carga da Equipe
        </button>
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
          const isResponsible = label === 'Responsável';
          const isSituation = label === 'Situação';
          const isRegime = label === 'Tributação';

          return (
            <th key={label} className={isCode ? 'sticky-col-code' : isCompany ? 'sticky-col-company' : ''}>
              <div className="th-header-cell">
                {isCode ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={handleToggleSelectAll}
                      title={allFilteredSelected ? "Desmarcar todas" : "Selecionar todas as empresas filtradas"}
                      style={{ accentColor: '#818cf8', cursor: 'pointer', width: 14, height: 14 }}
                    />
                    <button className="payroll-sort-btn" onClick={() => setSort({ key: 'code', asc: sort.key === 'code' ? !sort.asc : true })}>
                      {label}<span>{sort.key === 'code' ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
                    </button>
                  </div>
                ) : isCompany ? (
                  <>
                    <button className="payroll-sort-btn" onClick={() => setSort({ key: 'name', asc: sort.key === 'name' ? !sort.asc : true })}>
                      {label}<span>{sort.key === 'name' ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
                    </button>
                    <div className="th-filter-wrapper">
                      <button
                        type="button"
                        className={`th-filter-icon-btn ${certFilter !== 'ALL' ? 'has-filter' : ''}`}
                        title="Filtrar por certificado digital"
                        aria-label="Filtrar por certificado digital"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenHeaderFilter(openHeaderFilter === 'header-cert' ? null : 'header-cert');
                        }}
                      >
                        <Filter size={11} />
                      </button>
                      {openHeaderFilter === 'header-cert' && (
                        <div className="th-filter-popover" onClick={e => e.stopPropagation()}>
                          <div className="payroll-filter-heading" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #334155', marginBottom: '4px' }}>
                            Filtrar Certificados
                          </div>
                          {[
                            { value: 'ALL', label: 'Certificados: Todos' },
                            { value: 'EXPIRING', label: 'Vencendo ou Vencidos' },
                            { value: 'EXPIRED', label: 'Apenas Vencidos' },
                            { value: 'WARNING', label: 'Vencendo em até 30 dias' },
                            { value: 'OK', label: 'Válidos (> 30 dias)' },
                            { value: 'HAS_CERT', label: 'Com certificado' },
                            { value: 'NO_CERT', label: 'Sem certificado' },
                          ].map(item => (
                            <button
                              key={item.value}
                              type="button"
                              className={`th-filter-popover-item ${certFilter === item.value ? 'active' : ''}`}
                              onClick={() => {
                                setCertFilter(item.value);
                                setOpenHeaderFilter(null);
                              }}
                            >
                              <span>{item.label}</span>
                              {certFilter === item.value && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : isGroup ? (
                  <>
                    <button className="payroll-sort-btn" onClick={() => setSort({ key: 'groupName', asc: sort.key === 'groupName' ? !sort.asc : true })}>
                      {label}<span>{sort.key === 'groupName' ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
                    </button>
                    <div className="th-filter-wrapper">
                      <button
                        type="button"
                        className={`th-filter-icon-btn ${groupFilter !== 'ALL' ? 'has-filter' : ''}`}
                        title="Filtrar por grupo"
                        aria-label="Filtrar por grupo"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenHeaderFilter(openHeaderFilter === 'header-group' ? null : 'header-group');
                        }}
                      >
                        <Filter size={11} />
                      </button>
                      {openHeaderFilter === 'header-group' && (
                        <div className="th-filter-popover" onClick={e => e.stopPropagation()} style={{ maxHeight: '250px', overflowY: 'auto' }}>
                          <div className="payroll-filter-heading" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #334155', marginBottom: '4px' }}>
                            Filtrar Grupo
                          </div>
                          <button
                            type="button"
                            className={`th-filter-popover-item ${groupFilter === 'ALL' ? 'active' : ''}`}
                            onClick={() => {
                              setGroupFilter('ALL');
                              setOpenHeaderFilter(null);
                            }}
                          >
                            <span>Grupo: Todos</span>
                            {groupFilter === 'ALL' && <Check size={12} />}
                          </button>
                          {groups.map(grp => (
                            <button
                              key={grp}
                              type="button"
                              className={`th-filter-popover-item ${groupFilter === grp ? 'active' : ''}`}
                              onClick={() => {
                                setGroupFilter(grp);
                                setOpenHeaderFilter(null);
                              }}
                            >
                              <span>{grp}</span>
                              {groupFilter === grp && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : isResponsible ? (
                  <>
                    <span>{label}</span>
                    <div className="th-filter-wrapper">
                      <button
                        type="button"
                        className={`th-filter-icon-btn ${responsibleFilter !== 'ALL' ? 'has-filter' : ''}`}
                        title="Filtrar por responsável"
                        aria-label="Filtrar por responsável"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenHeaderFilter(openHeaderFilter === 'header-resp' ? null : 'header-resp');
                        }}
                      >
                        <Filter size={11} />
                      </button>
                      {openHeaderFilter === 'header-resp' && (
                        <div className="th-filter-popover" onClick={e => e.stopPropagation()} style={{ maxHeight: '250px', overflowY: 'auto' }}>
                          <div className="payroll-filter-heading" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #334155', marginBottom: '4px' }}>
                            Filtrar Responsável
                          </div>
                          <button
                            type="button"
                            className={`th-filter-popover-item ${responsibleFilter === 'ALL' ? 'active' : ''}`}
                            onClick={() => {
                              setResponsibleFilter('ALL');
                              setOpenHeaderFilter(null);
                            }}
                          >
                            <span>Responsável: Todos</span>
                            {responsibleFilter === 'ALL' && <Check size={12} />}
                          </button>
                          <button
                            type="button"
                            className={`th-filter-popover-item ${responsibleFilter === 'UNASSIGNED' ? 'active' : ''}`}
                            onClick={() => {
                              setResponsibleFilter('UNASSIGNED');
                              setOpenHeaderFilter(null);
                            }}
                          >
                            <span>Não atribuído</span>
                            {responsibleFilter === 'UNASSIGNED' && <Check size={12} />}
                          </button>
                          {contabilUsers.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              className={`th-filter-popover-item ${responsibleFilter === u.id ? 'active' : ''}`}
                              onClick={() => {
                                setResponsibleFilter(u.id);
                                setOpenHeaderFilter(null);
                              }}
                            >
                              <span>{u.name || u.email}</span>
                              {responsibleFilter === u.id && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : isSituation ? (
                  <>
                    <span>{label}</span>
                    <div className="th-filter-wrapper">
                      <button
                        type="button"
                        className={`th-filter-icon-btn ${situation !== 'ALL' ? 'has-filter' : ''}`}
                        title="Filtrar por situação"
                        aria-label="Filtrar por situação"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenHeaderFilter(openHeaderFilter === 'header-situation' ? null : 'header-situation');
                        }}
                      >
                        <Filter size={11} />
                      </button>
                      {openHeaderFilter === 'header-situation' && (
                        <div className="th-filter-popover" onClick={e => e.stopPropagation()}>
                          <div className="payroll-filter-heading" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #334155', marginBottom: '4px' }}>
                            Filtrar Situação
                          </div>
                          {[
                            { value: 'ALL', label: 'Situação: Todas' },
                            { value: 'ACTIVE', label: 'Ativas' },
                            { value: 'LEFT', label: 'Saíram no ano' },
                          ].map(item => (
                            <button
                              key={item.value}
                              type="button"
                              className={`th-filter-popover-item ${situation === item.value ? 'active' : ''}`}
                              onClick={() => {
                                setSituation(item.value);
                                setOpenHeaderFilter(null);
                              }}
                            >
                              <span>{item.label}</span>
                              {situation === item.value && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : isRegime ? (
                  <>
                    <span>{label}</span>
                    <div className="th-filter-wrapper">
                      <button
                        type="button"
                        className={`th-filter-icon-btn ${regime !== 'ALL' ? 'has-filter' : ''}`}
                        title="Filtrar por tributação"
                        aria-label="Filtrar por tributação"
                        onClick={e => {
                          e.stopPropagation();
                          setOpenHeaderFilter(openHeaderFilter === 'header-regime' ? null : 'header-regime');
                        }}
                      >
                        <Filter size={11} />
                      </button>
                      {openHeaderFilter === 'header-regime' && (
                        <div className="th-filter-popover" onClick={e => e.stopPropagation()} style={{ maxHeight: '250px', overflowY: 'auto' }}>
                          <div className="payroll-filter-heading" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #334155', marginBottom: '4px' }}>
                            Filtrar Tributação
                          </div>
                          <button
                            type="button"
                            className={`th-filter-popover-item ${regime === 'ALL' ? 'active' : ''}`}
                            onClick={() => {
                              setRegime('ALL');
                              setOpenHeaderFilter(null);
                            }}
                          >
                            <span>Tributação: Todas</span>
                            {regime === 'ALL' && <Check size={12} />}
                          </button>
                          {regimes.map(r => (
                            <button
                              key={r}
                              type="button"
                              className={`th-filter-popover-item ${regime === r ? 'active' : ''}`}
                              onClick={() => {
                                setRegime(r);
                                setOpenHeaderFilter(null);
                              }}
                            >
                              <span>{formatRegimeLabel(r)}</span>
                              {regime === r && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  label
                )}
              </div>
            </th>
          );
        })}
        {visibleColumns.map(column => {
          if (column.isMonthsGroup) {
            return (
              <th key={column.id} style={{ minWidth: '180px' }}>
                <div className="th-header-cell">
                  <span>Meses</span>
                  <div className="th-filter-wrapper">
                    <button
                      type="button"
                      className={`th-filter-icon-btn ${monthStatusFilter !== 'ALL' ? 'has-filter' : ''}`}
                      title="Filtrar por status dos meses"
                      aria-label="Filtrar por status dos meses"
                      onClick={e => {
                        e.stopPropagation();
                        setOpenHeaderFilter(openHeaderFilter === 'col-months' ? null : 'col-months');
                      }}
                    >
                      <Filter size={11} />
                    </button>
                    {openHeaderFilter === 'col-months' && (
                      <div className="th-filter-popover" onClick={e => e.stopPropagation()}>
                        <div className="payroll-filter-heading" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #334155', marginBottom: '4px' }}>
                          Filtrar Meses
                        </div>
                        {[
                          { value: 'ALL', label: 'Todos os status' },
                          ...(monthsBreakdown.done > 0 ? [{ value: 'DONE', label: `CONCLUÍDO (${monthsBreakdown.done})` }] : []),
                          ...(monthsBreakdown.docRede > 0 ? [{ value: 'DOC_REDE', label: `DOC. REDE (${monthsBreakdown.docRede})` }] : []),
                          ...(monthsBreakdown.noMovement > 0 ? [{ value: 'SEM_MOVIMENTO', label: `SEM MOVIMENTO (${monthsBreakdown.noMovement})` }] : []),
                          ...(monthsBreakdown.collection > 0 ? [{ value: 'COBRANCA', label: `COBRANÇA DOC. (${monthsBreakdown.collection})` }] : []),
                          ...(monthsBreakdown.pending > 0 ? [{ value: 'PENDING', label: `PENDENTE (${monthsBreakdown.pending})` }] : []),
                        ].map(item => (
                          <button
                            key={item.value}
                            type="button"
                            className={`th-filter-popover-item ${monthStatusFilter === item.value ? 'active' : ''}`}
                            onClick={() => {
                              setMonthStatusFilter(item.value as any);
                              setOpenHeaderFilter(null);
                            }}
                          >
                            <span>{item.label}</span>
                            {monthStatusFilter === item.value && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </th>
            );
          }

          const month = accountingMonth(column);
          const locked = !!month && Date.UTC(year, month - 1, 1) > latestPeriod.getTime();
          const colKey = resolveColumnKey(column) || column.id;
          const activeColFilter = columnFilters[colKey] || 'ALL';

          const uniqueColValues = Array.from(new Set(scopedRows.map(r => {
            const v = r.columnsData?.[colKey];
            if (v === null || v === undefined || v === '') return '';
            return typeof v === 'object' ? (v.status || v.value || '') : String(v);
          }).filter(Boolean))).slice(0, 15);

          return (
            <th key={column.id} title={locked ? 'Libera na virada do mês seguinte' : visibilitySummary(column)}>
              <div className="th-header-cell">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {column.name}
                  {locked && <LockKeyhole size={12} />}
                </span>
                {uniqueColValues.length > 0 && (
                  <div className="th-filter-wrapper">
                    <button
                      type="button"
                      className={`th-filter-icon-btn ${activeColFilter !== 'ALL' ? 'has-filter' : ''}`}
                      title={`Filtrar ${column.name}`}
                      aria-label={`Filtrar ${column.name}`}
                      onClick={e => {
                        e.stopPropagation();
                        setOpenHeaderFilter(openHeaderFilter === `col-${colKey}` ? null : `col-${colKey}`);
                      }}
                    >
                      <Filter size={11} />
                    </button>
                    {openHeaderFilter === `col-${colKey}` && (
                      <div className="th-filter-popover" onClick={e => e.stopPropagation()}>
                        <div className="payroll-filter-heading" style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #334155', marginBottom: '4px' }}>
                          Filtrar {column.name}
                        </div>
                        <button
                          type="button"
                          className={`th-filter-popover-item ${activeColFilter === 'ALL' ? 'active' : ''}`}
                          onClick={() => {
                            setColumnFilters(prev => ({ ...prev, [colKey]: 'ALL' }));
                            setOpenHeaderFilter(null);
                          }}
                        >
                          <span>Todos</span>
                          {activeColFilter === 'ALL' && <Check size={12} />}
                        </button>
                        {uniqueColValues.map(val => (
                          <button
                            key={val}
                            type="button"
                            className={`th-filter-popover-item ${activeColFilter === val ? 'active' : ''}`}
                            onClick={() => {
                              setColumnFilters(prev => ({ ...prev, [colKey]: val }));
                              setOpenHeaderFilter(null);
                            }}
                          >
                            <span>{val}</span>
                            {activeColFilter === val && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </th>
          );
        })}
      </tr></thead><tbody>{!filtered.length?<tr><td colSpan={7+visibleColumns.length} className="payroll-empty">Nenhuma empresa encontrada neste ano.</td></tr>:filtered.map(row=>{const company=row.company;const certificate=company.hasClientCertificate?getCertificateStatus(company.certificateExpiration):null;return <tr key={row.closingId}>
        <td className="sticky-col-code">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={selectedCompanyIds.includes(company.id)}
              onChange={(e) => {
                e.stopPropagation();
                setSelectedCompanyIds(prev =>
                  prev.includes(company.id) ? prev.filter(id => id !== company.id) : [...prev, company.id]
                );
              }}
              title="Selecionar empresa"
              style={{ accentColor: '#818cf8', cursor: 'pointer', width: 14, height: 14 }}
            />
            <span style={{fontWeight:600,color:'#94a3b8'}}>{formatCompanyCode(company.code)||'—'}</span>
          </div>
        </td>
        <td className="sticky-col-company"><div className="company-cell-wrapper"><button className="company-interactive-link" onClick={()=>setCompanyDetails(company)}><div className="company-link-left"><Building2 size={16} color="#818cf8"/><span>{company.name}</span></div><div className="company-link-icon-chip"><span>Ver Dados</span><ExternalLink size={10}/></div></button>{company.tradeName&&<div className="company-cell-trade">{company.tradeName}</div>}{certificate&&<button className={`cert-warning-tag ${certificate.status==='EXPIRED'?'expired':''}`} onClick={()=>setCompanyDetails(company)}><AlertTriangle size={12}/>{certificate.label}</button>}</div></td>
        <td>{company.groupName ? <span className="group-badge" style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.1)', color: '#a5b4fc', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{company.groupName}</span> : <span style={{ color: '#64748b' }}>—</span>}</td>
        <td><select className="table-user-select" aria-label={`Responsável Contábil de ${company.name}`} value={responsible(company)?.userId||''} disabled={!isRowEditable(row)||pending>0} onChange={event=>{void changeResponsible(row,event.target.value);}}><option value="">Não atribuído</option>{users.map(user=><option key={user.id} value={user.id} disabled={user.active===false}>{user.name||user.email}</option>)}</select></td>
        <td><button className="copy-badge-btn" title="Copiar CNPJ" onClick={()=>{void navigator.clipboard.writeText(company.cnpj||'').then(()=>setCopied('CNPJ copiado!')).catch(()=>setError('Não foi possível copiar.'));}}>{formatCnpj(company.cnpj||'')}<Copy size={12}/></button></td>
        <td><span className={`status-badge ${left(company)?'pending':'completed'}`}>{left(company)?`Saiu em ${new Date(company.exitDate).toLocaleDateString('pt-BR',{timeZone:'UTC'})}`:'Ativa'}</span></td>
        <td><span className={`tax-regime-pill ${company.taxRegime==='SIMPLES_NACIONAL'?'simples':company.taxRegime?.includes('PRESUMIDO')?'presumido':company.taxRegime?.includes('REAL')?'real':company.taxRegime==='MEI'?'mei':''}`}>{formatRegimeLabel(company.taxRegime||'')}</span></td>
        {visibleColumns.map(column=>{if(column.isMonthsGroup){const values=column.months.map((monthColumn:any)=>row.columnsData[resolveColumnKey(monthColumn)||monthColumn.id]).filter((value:any)=>value!==NOT_CLIENT);const done=values.filter((value:any)=>['OK - FINALIZADO','SEM MOVIMENTO'].includes(parseMonthValue(value).status)).length;return <td key={column.id}><button type="button" className="accounting-months-button" onClick={()=>setMonthsClosingId(row.closingId)} aria-label={`Ver meses de ${company.name}`}><strong>Meses · {year}</strong><small>{values.length?`${done} / ${values.length} meses concluídos · abrir`:'Não é cliente no período · abrir'}</small></button></td>;}const key=resolveColumnKey(column)||column.id;const value=row.columnsData[key];const month=accountingMonth(column);const blocked=!!month&&Date.UTC(year,month-1,1)>latestPeriod.getTime();return <td key={column.id} className={month?`accounting-month ${monthClass(value)}`:''} title={blocked?'Esta competência abre no mês seguinte':value===NOT_CLIENT?'Definido pelas datas de obrigação e saída':undefined}>
          {month&&value===NOT_CLIENT?<span className="obligation-btn na accounting-not-client">{NOT_CLIENT}</span>:month?<AccountingMonthInput value={value} disabled={!isRowEditable(row)||column.isEditable===false||blocked} onSave={next=>save(row,column,next)} ariaLabel={`${column.name} de ${company.name}`}/>:key==='cont_observacao'?<button className="copy-badge-btn" style={{background:value?'rgba(99,102,241,.15)':undefined}} title={value||'Observações Contábil'} onClick={()=>{setNotes({row,column});setNoteDraft(value||'');setNoteError('');}}>{value?String(value).slice(0,16)+(String(value).length>16?'...':''):'+ Obs'}</button>:<PayrollInput column={column} value={value} disabled={!isRowEditable(row)||column.isEditable===false||blocked} onSave={next=>save(row,column,next)}/>}
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
        currentUser={currentUser}
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
  {selectedCompanyIds.length > 0 && (
    <div className="companies-bulk-bar">
      <div className="bulk-bar-info">
        <CheckCircle2 size={18} color="#818cf8" />
        <span>
          <strong>{selectedCompanyIds.length}</strong> empresa(s) selecionada(s)
        </span>
      </div>
      <div className="bulk-bar-actions">
        <button
          type="button"
          className="bulk-btn-assign"
          onClick={() => setBulkAssignOpen(true)}
        >
          <Users size={16} />
          <span>Atribuir Responsável em Massa</span>
        </button>
        <button
          type="button"
          className="bulk-btn-clear"
          onClick={() => setSelectedCompanyIds([])}
        >
          Desmarcar Todas
        </button>
      </div>
    </div>
  )}

  <BulkAssignResponsibleModal
    isOpen={bulkAssignOpen}
    onClose={() => setBulkAssignOpen(false)}
    selectedCompanyIds={selectedCompanyIds}
    companies={scopedRows.map(r => r.company)}
    users={users}
    currentUser={currentUser}
    defaultSector="CONTABIL"
    onSuccess={(count, sectorLabel, respName) => {
      setSelectedCompanyIds([]);
      setBulkToast(`${count} empresa(s) atribuída(s) para ${respName} no ${sectorLabel}!`);
      setTimeout(() => setBulkToast(null), 5000);
      void load();
    }}
  />

  {bulkToast && (
    <div className="payroll-copy-toast" role="status" style={{ background: '#10b981' }}>
      <CheckCircle2 size={16} />
      {bulkToast}
    </div>
  )}

  <ResponsibleWorkloadModal
    isOpen={workloadOpen}
    onClose={() => setWorkloadOpen(false)}
    rows={scopedRows}
    users={users}
    sector="CONTABIL"
    onSelectResponsible={userId => setResponsibleFilter(userId || 'ALL')}
    onReload={() => { void load(); }}
    currentUser={currentUser}
  />
  </div>;
}
