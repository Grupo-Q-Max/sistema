import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { Building2, CheckCircle2, Clock, AlertCircle, Sparkles, Search, ChevronLeft, ChevronRight, RefreshCw, Settings2, Eye, X, ExternalLink, Calendar, FileText, Check, History } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { ClosingSectorTabs } from './ClosingSectorTabs';
import { ClosingProgressDetails } from './ClosingProgressDetails';
import { CushmanCompanyModal } from './CushmanCompanyModal';
import { CellAuditModal } from './CellAuditModal';
import { usePresence } from '../hooks/usePresence';
import { formatCnpj, getCertificateStatus } from './CompanyDetailsModal';
import { TableSkeleton, ButtonSpinner } from './LoadingSkeleton';
import { useCompetenceCalendar } from './useCompetenceCalendar';
import { CUSHMAN_API_VERSION, cushmanAccess, resolveCushmanKey, cushmanCompanyEditable } from '../config/cushmanColumns';
import { buildClosingProgress, summarizeClosingProgress } from '../config/closingProgress';
import { exportToCsv } from '../utils/exportCsv';
import { compareCodes, formatCompanyCode } from '../utils/codeSort';
import { installmentHeaders } from '../config/installments';
import { latestOpenPeriod } from '../config/competenceCalendar';
import { ColumnHeaderFilter, computeColumnFilterOptions, matchColumnFilterValue } from './ColumnHeaderFilter';
import type { CurrentUser } from '../types/auth';
import { API_URL as API } from '../api';
import './Closings.css';
import './PayrollClosings.css';
import './CushmanClosings.css';

type Props = { currentView: string; onNavigate: (view: string) => void; currentUser?: CurrentUser | null; onLogout?: () => void };
const STATUS: Record<string, string> = { COMPLETED: 'Concluído', IN_PROGRESS: 'Em andamento', PENDING: 'Pendente', NOT_APPLICABLE: 'Fora da competência' };

function getTodayBr(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatDateDisplay(val: string): string {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-');
    return `${d}/${m}/${y}`;
  }
  return val;
}

function brDateToIso(val: string): string {
  const m = String(val || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function isoDateToBr(val: string): string {
  const m = String(val || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : val;
}

export function getCushmanStatusAppearance(value: any): { className: string; label: string; tooltip?: string } {
  if (value === null || value === undefined || value === '') {
    return { className: 'pendente', label: 'Pendente' };
  }

  if (typeof value === 'object') {
    const st = String(value.status || '').toUpperCase().trim();
    if (st === 'N/A' || st === 'NA') return { className: 'na', label: 'N/A' };
    if (st === 'SEM_MOVIMENTO' || st === 'OK - SEM MOVIMENTO' || st === 'SEM MOVIMENTO') {
      return { className: 'sem-mov', label: value.label || 'OK - S/ MOV' };
    }
    if (st === 'PENDENCIA' || st === 'PENDÊNCIA') {
      return { className: 'pendencia', label: 'PENDÊNCIA', tooltip: value.pendingReason ? `Motivo: ${value.pendingReason}` : 'Pendência informada' };
    }
    if (st === 'CONCLUIDO' || st === 'OK - DATA' || st === 'OK') {
      const rawDate = value.completionDate || value.label || 'OK';
      return { className: 'ok-data', label: formatDateDisplay(rawDate) };
    }
    return { className: 'pendente', label: value.label || 'Pendente' };
  }

  const str = String(value).trim();
  const up = str.toUpperCase();
  if (up === 'N/A' || up === 'NA') return { className: 'na', label: 'N/A' };
  if (['SEM MOVIMENTO', 'SEM_MOVIMENTO', 'OK - SEM MOVIMENTO', 'S/ MOV', 'S/MOV'].includes(up)) {
    return { className: 'sem-mov', label: 'OK - S/ MOV' };
  }
  if (['PENDENTE', 'PENDENCIA', 'PENDÊNCIA'].includes(up)) {
    return { className: 'pendencia', label: 'PENDÊNCIA' };
  }
  if (str) {
    return { className: 'ok-data', label: formatDateDisplay(str) };
  }
  return { className: 'pendente', label: 'Pendente' };
}

export function CushmanClosings({ currentView, onNavigate, currentUser, onLogout }: Props) {
  const [period, setPeriod] = useState(() => latestOpenPeriod());
  const latest = useCompetenceCalendar();
  const [mode, setMode] = useState('CUSHMAN');
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(true);
  const [pending, setPending] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [city, setCity] = useState('ALL');
  const [cert, setCert] = useState('ALL');
  const [sort, setSort] = useState<{ key: 'code' | 'name'; asc: boolean }>({ key: 'code', asc: true });
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [openHeaderFilter, setOpenHeaderFilter] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [scrollWidth, setScrollWidth] = useState(0);

  // Modal Padronizado de Ação
  const [actionModal, setActionModal] = useState<{ row: any; column: any; key: string } | null>(null);
  const [modalMode, setModalMode] = useState<'MAIN' | 'DATE' | 'PENDENCY'>('MAIN');
  const [inputDate, setInputDate] = useState('');
  const [inputPendencyReason, setInputPendencyReason] = useState('');
  const [customTextInput, setCustomTextInput] = useState('');
  const [actionError, setActionError] = useState('');

  // Modal de Observação
  const [notesModal, setNotesModal] = useState<{ row: any; column: any } | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState('');

  // Trilha de Auditoria na Célula
  const [auditTarget, setAuditTarget] = useState<{ companyId: string; companyName: string; companyCode?: string | null; columnKey: string; columnLabel: string } | null>(null);

  // Presença em tempo real ("Quem está editando agora?")
  const { getEditorsForCompany } = usePresence({ sector: 'CUSHMAN', currentUserId: currentUser?.id });

  const sequence = useRef(0);
  const periodKey = period.toISOString();
  const currentPeriod = useRef(periodKey);
  currentPeriod.current = periodKey;
  const tableScroll = useRef<HTMLDivElement>(null);
  const topScroll = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const headers = installmentHeaders(currentUser);
  const canView = cushmanAccess(currentUser);
  const canEdit = cushmanAccess(currentUser, true);
  const isRowEditable = (row: any) => canEdit && row.editable !== false && cushmanCompanyEditable(currentUser, row.company);

  async function load() {
    const request = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API}/api/cushman-closings?year=${period.getUTCFullYear()}&month=${period.getUTCMonth() + 1}&companies=${mode}&userId=${currentUser?.id || ''}`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o Cushman.');
      if (data.cushmanApiVersion !== CUSHMAN_API_VERSION) throw new Error('Reinicie a API para carregar o Cushman.');
      if (request === sequence.current) {
        setRows(data.rows || []);
        setColumns(data.columns || []);
        setConfigured(data.configured === true);
      }
    } catch (cause) {
      if (request === sequence.current) {
        setRows([]);
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar.');
      }
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    setRows([]);
    if (canView) void load();
    else setLoading(false);
    return () => { sequence.current++; };
  }, [periodKey, mode, canView, currentUser?.sessionToken]);

  // Atualização em tempo real via SSE (Server-Sent Events)
  useEffect(() => {
    const handleRealtime = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (detail.type === 'CUSHMAN_CLOSING_UPDATED' || detail.type === 'COMPANY_UPDATED' || detail.type === 'COMPANY_DELETED' || detail.type === 'COMPANY_RESTORED') {
        if (canView) void load();
      }
    };
    window.addEventListener('app-realtime-update', handleRealtime);
    return () => window.removeEventListener('app-realtime-update', handleRealtime);
  }, [canView]);

  useEffect(() => {
    setCompanyId('');
    setActionModal(null);
    setNotesModal(null);
    setProgressOpen(false);
    setColumnFilters({});
    setOpenHeaderFilter(null);
  }, [periodKey, mode]);

  useEffect(() => {
    const table = tableScroll.current?.querySelector('table');
    if (!table) return;
    const update = () => setScrollWidth(table.scrollWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(table);
    return () => observer.disconnect();
  }, [loading, columns.length]);

  const activeRows = rows.filter(row => row.participates);
  const summary = summarizeClosingProgress(buildClosingProgress(activeRows, columns, 'CUSHMAN', period, latest), activeRows.length);
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => rows.filter(row => {
    const company = row.company;
    const term = deferredSearch.trim().toLocaleLowerCase('pt-BR');
    const digits = term.replace(/\D/g, '');
    const matches = [company.code, formatCompanyCode(company.code), company.name, company.tradeName, company.cnpj, company.city].join(' ').toLocaleLowerCase('pt-BR').includes(term) || (digits.length >= 3 && (company.cnpj || '').replace(/\D/g, '').includes(digits));
    const certificate = company.hasClientCertificate ? getCertificateStatus(company.certificateExpiration) : null;
    let matchColFilters = true;
    for (const [colKey, filterVal] of Object.entries(columnFilters)) {
      if (!filterVal || filterVal === 'ALL') continue;
      const cellVal = row.columnsData?.[colKey];
      if (!matchColumnFilterValue(cellVal, filterVal)) {
        matchColFilters = false;
        break;
      }
    }
    return matches && matchColFilters && (status === 'ALL' || row.calculatedStatus === status) && (city === 'ALL' || company.city === city) && (cert === 'ALL' || (cert === 'NONE' && !company.hasClientCertificate) || certificate?.status === cert);
  }).sort((a, b) => {
    if (sort.key === 'code') return compareCodes(a.company.code, b.company.code, sort.asc);
    return String(a.company[sort.key] || '').localeCompare(String(b.company[sort.key] || ''), 'pt-BR', { numeric: true }) * (sort.asc ? 1 : -1);
  }), [rows, deferredSearch, status, city, cert, columnFilters, sort]);

  const cities = Array.from(new Set(rows.map(row => row.company.city).filter(Boolean))).sort();
  const companyRow = rows.find(row => row.company.id === companyId);
  const notesColumn = columns.find(column => resolveCushmanKey(column) === 'cush_observacao');

  async function saveColumn(row: any, key: string, value: any) {
    if (!isRowEditable(row)) throw new Error('Você só pode editar empresas sob sua responsabilidade.');
    const captured = currentPeriod.current;
    setPending(count => count + 1);
    try {
      const response = await fetch(`${API}/api/cushman-closings/${row.closingId}/column?userId=${currentUser?.id || ''}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ columnKey: key, columnValue: value, expectedUpdatedAt: row.updatedAt, userId: currentUser?.id })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
      if (currentPeriod.current === captured) {
        setRows(previous => previous.map(item => item.company.id === row.company.id ? { ...item, ...result, columnsData: result.closing.columnsData, updatedAt: result.closing.updatedAt } : item));
      }
    } finally {
      setPending(count => count - 1);
    }
  }

  async function saveCompany(row: any, body: any) {
    if (!isRowEditable(row)) throw new Error('Você só pode editar empresas sob sua responsabilidade.');
    setPending(count => count + 1);
    try {
      const response = await fetch(`${API}/api/cushman-companies/${row.company.id}?userId=${currentUser?.id || ''}`, { method: 'PUT', headers, body: JSON.stringify({ ...body, userId: currentUser?.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o cadastro.');
      await load();
    } finally {
      setPending(count => count - 1);
    }
  }

  function openActionModal(row: any, column: any, key: string) {
    const currentVal = row.columnsData[key];
    const existingDate =
      typeof currentVal === 'object' && currentVal?.completionDate
        ? formatDateDisplay(String(currentVal.completionDate))
        : typeof currentVal === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(currentVal.trim())
        ? currentVal.trim()
        : getTodayBr();
    setActionModal({ row, column, key });
    setModalMode('MAIN');
    setActionError('');
    setInputDate(existingDate);
    setInputPendencyReason(typeof currentVal === 'object' && currentVal?.pendingReason ? String(currentVal.pendingReason) : '');
    setCustomTextInput(typeof currentVal === 'string' ? currentVal : (currentVal?.label || ''));
  }

  async function handleActionOkData() {
    if (!actionModal) return;
    setActionError('');
    const dateVal = isoDateToBr(inputDate.trim()) || getTodayBr();
    const payload = {
      status: 'CONCLUIDO',
      label: dateVal,
      completionDate: dateVal,
      updatedAt: new Date().toISOString()
    };
    try {
      await saveColumn(actionModal.row, actionModal.key, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar conclusão.');
    }
  }

  async function handleActionSemMov() {
    if (!actionModal) return;
    setActionError('');
    const payload = {
      status: 'OK - SEM MOVIMENTO',
      label: 'OK - S/ MOV',
      updatedAt: new Date().toISOString()
    };
    try {
      await saveColumn(actionModal.row, actionModal.key, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  }

  async function handleActionNA() {
    if (!actionModal) return;
    setActionError('');
    const payload = {
      status: 'N/A',
      label: 'N/A',
      updatedAt: new Date().toISOString()
    };
    try {
      await saveColumn(actionModal.row, actionModal.key, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  }

  async function handleActionLimpar() {
    if (!actionModal) return;
    setActionError('');
    try {
      await saveColumn(actionModal.row, actionModal.key, '');
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao limpar.');
    }
  }

  async function handleActionSavePendency() {
    if (!actionModal) return;
    setActionError('');
    const reason = inputPendencyReason.trim() || 'Pendência informada';
    const payload = {
      status: 'PENDENCIA',
      label: 'PENDÊNCIA',
      pendingReason: reason,
      updatedAt: new Date().toISOString()
    };
    try {
      await saveColumn(actionModal.row, actionModal.key, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao registrar pendência.');
    }
  }

  async function handleActionCustomText() {
    if (!actionModal) return;
    setActionError('');
    const text = customTextInput.trim();
    try {
      await saveColumn(actionModal.row, actionModal.key, text);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar anotação.');
    }
  }

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
        code: formatCompanyCode(r.company.code),
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

        const app = getCushmanStatusAppearance(val);
        rowData[col.id] = app.label === 'Pendente' ? '' : app.label;
      });
      return rowData;
    });

    const mesStr = String(period.getUTCMonth() + 1).padStart(2, '0') + '-' + period.getUTCFullYear();
    exportToCsv(`fechamento_cushman_${mesStr}`, csvColumns, data);
  };

  const scroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || syncing.current) return;
    syncing.current = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  const label = period.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="crm-dashboard">
      <Sidebar currentView={currentView} onNavigate={onNavigate} currentUser={currentUser} onLogout={onLogout} />
      <main className="crm-main">
        <div className="closings-container payroll-closings cushman-closings">
          <div className="closings-header">
            <div className="closings-header-titles">
              <h1><Building2 size={28} color="#818cf8" />Fechamento Cushman</h1>
              <p>Obrigações mensais e dados da empresa organizados em um só lugar</p>
            </div>
            <div className="closings-header-actions">
              <ClosingSectorTabs sector="CUSHMAN" currentUser={currentUser} onNavigate={onNavigate} />
              <div className="month-selector-box">
                <button className="month-nav-btn" aria-label="Competência anterior" disabled={pending > 0} onClick={() => setPeriod(new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() - 1, 1)))}>
                  <ChevronLeft size={20} />
                </button>
                <span className="month-display-text">{label}</span>
                <button className="month-nav-btn" aria-label="Próxima competência" disabled={pending > 0 || period >= latest} title="A próxima competência abre automaticamente na virada do mês" onClick={() => setPeriod(new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1)))}>
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>

          {!canView ? (
            <p className="cushman-error">Você não tem acesso ao fechamento Cushman.</p>
          ) : (
            <>
              <div className="closings-stats-grid">
                {[
                  { label: 'Empresas na competência', value: summary.total, kind: 'total', Icon: Building2 },
                  { label: 'Concluídos', value: summary.completed, kind: 'completed', Icon: CheckCircle2 },
                  { label: 'Em Andamento', value: summary.inProgress, kind: 'in-progress', Icon: Clock },
                  { label: 'Pendentes', value: summary.pending, kind: 'pending', Icon: AlertCircle },
                  { label: 'Progresso (Campos)', value: summary.overallPercent + '%', kind: 'percent', Icon: Sparkles },
                  { label: 'Progresso (Empresas)', value: (summary.total ? Math.round(summary.completed / summary.total * 100) : 0) + '%', kind: 'percent', Icon: Building2 }
                ].map(({ label, value, kind, Icon }) => (
                  <div
                    key={label}
                    className={`closing-stat-card ${kind === 'percent' ? 'progress-clickable' : ''}`}
                    role={kind === 'percent' ? 'button' : undefined}
                    tabIndex={kind === 'percent' ? 0 : undefined}
                    aria-expanded={kind === 'percent' ? progressOpen : undefined}
                    onClick={kind === 'percent' ? () => setProgressOpen(open => !open) : undefined}
                    onKeyDown={kind === 'percent' ? event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setProgressOpen(open => !open); } } : undefined}
                  >
                    <div className={`closing-stat-icon ${kind}`}><Icon size={22} /></div>
                    <div className="closing-stat-info">
                      <span>{label}</span>
                      <strong>{loading ? '—' : value}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <ClosingProgressDetails rows={activeRows} columns={columns} sector="CUSHMAN" period={period} latest={latest} open={progressOpen} onToggle={() => setProgressOpen(open => !open)} loading={loading} />

              <div className="closings-toolbar">
                <div className="closings-search-box">
                  <Search size={18} />
                  <input aria-label="Pesquisar empresas Cushman" placeholder="Pesquisar código, empresa, CNPJ ou município..." value={search} onChange={event => setSearch(event.target.value)} />
                </div>
                <div className="closings-filters">
                  <select className="closings-select" aria-label="Exibir empresas" disabled={pending > 0} value={mode} onChange={event => { setMode(event.target.value); setStatus('ALL'); setCity('ALL'); }}>
                    <option value="CUSHMAN">Empresas do Cushman na competência</option>
                    <option value="ALL">Todas as empresas Cushman</option>
                  </select>
                  <select className="closings-select" aria-label="Filtrar status Cushman" value={status} onChange={event => setStatus(event.target.value)}>
                    <option value="ALL">Todos os status</option>
                    {Object.entries(STATUS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                  </select>
                  <select className="closings-select" aria-label="Filtrar município" value={city} onChange={event => setCity(event.target.value)}>
                    <option value="ALL">Todos os municípios</option>
                    {cities.map(value => <option key={value}>{value}</option>)}
                  </select>
                  <select className="closings-select" aria-label="Filtrar certificado" value={cert} onChange={event => setCert(event.target.value)}>
                    <option value="ALL">Todos os certificados</option>
                    <option value="EXPIRED">Certificado vencido</option>
                    <option value="WARNING">Vence em até 30 dias</option>
                    <option value="OK">Certificado válido</option>
                    <option value="NONE">Sem certificado</option>
                  </select>
                  <button type="button" className="payroll-refresh-btn" aria-label="Atualizar Cushman" disabled={loading || pending > 0} onClick={() => { void load(); }}>
                    <RefreshCw size={17} className={loading ? 'payroll-spin' : ''} />
                  </button>
                  <button className="btn-secondary-light" onClick={handleExport} title="Exportar para Excel (CSV)">
                    <ExternalLink size={16} />
                    Exportar
                  </button>
                </div>
              </div>

              <div className="payroll-table-meta">
                <span>{filtered.length} empresa(s) exibida(s) · {activeRows.length} na competência</span>
                <span>
                  {pending > 0 ? <><ButtonSpinner />Salvando alterações...</> : <><CheckCircle2 size={14} color="#10b981" />{canEdit ? 'Obrigações operacionais padronizadas' : 'Acesso somente de leitura'}</>}
                </span>
              </div>

              {mode === 'ALL' && <p className="cushman-all-note">Todas as empresas liberadas para seu usuário. Empresas fora do Cushman ou do período permitem consultar/editar o cadastro conforme sua permissão; as obrigações do mês ficam bloqueadas.</p>}
              {error && <p className="cushman-error" role="alert">{error}</p>}
              {!loading && !configured && <p className="cushman-error" role="alert">As colunas Cushman ainda não foram preparadas.</p>}

              <div className="closings-table-card">
                {loading ? (
                  <div className="payroll-loading"><TableSkeleton count={6} /></div>
                ) : (
                  <>
                    <div className="payroll-scroll-top" ref={topScroll} onScroll={event => scroll(event.currentTarget, tableScroll.current)}>
                      <div style={{ width: scrollWidth, height: 1 }} />
                    </div>
                    <div className="closings-table-wrapper closings-table-scroll payroll-table-scroll" ref={tableScroll} onScroll={event => scroll(event.currentTarget, topScroll.current)}>
                      <table className="closings-table cushman-table" style={{ minWidth: `${900 + columns.length * 150}px` }}>
                        <thead>
                          <tr>
                            <th className="cushman-sticky-action">Dados</th>
                            <th className="cushman-sticky-code">
                              <button type="button" className="payroll-sort-btn" onClick={() => setSort({ key: 'code', asc: sort.key === 'code' ? !sort.asc : true })}>
                                Código
                                <span>{sort.key === 'code' ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
                              </button>
                            </th>
                            <th className="cushman-sticky-company">
                              <div className="th-header-cell">
                                <button type="button" className="payroll-sort-btn" onClick={() => setSort({ key: 'name', asc: sort.key === 'name' ? !sort.asc : true })}>
                                  Empresa / Certificado
                                  <span>{sort.key === 'name' ? (sort.asc ? '▲' : '▼') : '⇅'}</span>
                                </button>
                                <ColumnHeaderFilter
                                  columnKey="cush-cert"
                                  label="Certificado"
                                  activeFilter={cert}
                                  onFilterChange={setCert}
                                  openHeaderFilter={openHeaderFilter}
                                  setOpenHeaderFilter={setOpenHeaderFilter}
                                  options={[
                                    { value: 'ALL', label: 'Certificados: Todos', count: rows.length },
                                    { value: 'OK', label: 'Válidos (> 30 dias)', count: rows.filter(r => { const c = r.company.hasClientCertificate ? getCertificateStatus(r.company.certificateExpiration) : null; return c?.status === 'OK'; }).length },
                                    { value: 'WARNING', label: 'Vencendo em 30d', count: rows.filter(r => { const c = r.company.hasClientCertificate ? getCertificateStatus(r.company.certificateExpiration) : null; return c?.status === 'WARNING'; }).length },
                                    { value: 'EXPIRED', label: 'Vencidos', count: rows.filter(r => { const c = r.company.hasClientCertificate ? getCertificateStatus(r.company.certificateExpiration) : null; return c?.status === 'EXPIRED'; }).length },
                                    { value: 'NONE', label: 'Sem certificado', count: rows.filter(r => !r.company.hasClientCertificate).length },
                                  ]}
                                />
                              </div>
                            </th>
                            <th>CNPJ</th>
                            <th>
                              <div className="th-header-cell">
                                <span>Status</span>
                                <ColumnHeaderFilter
                                  columnKey="cush-status"
                                  label="Status"
                                  activeFilter={status}
                                  onFilterChange={setStatus}
                                  openHeaderFilter={openHeaderFilter}
                                  setOpenHeaderFilter={setOpenHeaderFilter}
                                  options={computeColumnFilterOptions(rows, r => r.calculatedStatus, {
                                    allLabel: 'Todos os status',
                                    valueLabels: STATUS
                                  })}
                                />
                              </div>
                            </th>
                            {columns.map(column => {
                              const colKey = resolveCushmanKey(column) || column.id;
                              const activeColFilter = columnFilters[colKey] || 'ALL';
                              const options = computeColumnFilterOptions(rows, r => r.columnsData?.[colKey]);
                              return (
                                <th key={column.id}>
                                  <div className="th-header-cell">
                                    <span>{column.name}</span>
                                    <ColumnHeaderFilter
                                      columnKey={`cush-col-${colKey}`}
                                      label={column.name}
                                      activeFilter={activeColFilter}
                                      onFilterChange={val => setColumnFilters(prev => ({ ...prev, [colKey]: val }))}
                                      openHeaderFilter={openHeaderFilter}
                                      setOpenHeaderFilter={setOpenHeaderFilter}
                                      options={options}
                                    />
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(row => {
                            const company = row.company;
                            const certificate = company.hasClientCertificate ? getCertificateStatus(company.certificateExpiration) : null;
                            const rowEditable = isRowEditable(row);
                            return (
                              <tr key={company.id} className={!row.participates ? 'cushman-outside-row' : ''}>
                                <td className="cushman-sticky-action">
                                  <button
                                    type="button"
                                    className="cushman-company-button"
                                    aria-label={`${rowEditable ? 'Editar' : 'Ver'} dados de ${company.name}`}
                                    title={rowEditable ? 'Editar dados da empresa, certificado e procuração' : 'Ver dados da empresa, certificado e procuração (somente leitura)'}
                                    disabled={pending > 0}
                                    onClick={() => setCompanyId(company.id)}
                                  >
                                    {rowEditable ? <Settings2 size={18} /> : <Eye size={18} />}
                                  </button>
                                </td>
                                <td className="cushman-sticky-code"><span style={{ fontWeight: 600, color: '#94a3b8' }}>{formatCompanyCode(company.code) || '—'}</span></td>
                                <td className="cushman-sticky-company">
                                  <div className="cushman-company-cell">
                                    <strong>{company.name}</strong>
                                    {(() => {
                                      const editors = getEditorsForCompany(company.id);
                                      if (!editors.length) return null;
                                      return (
                                        <span
                                          className="presence-user-pill"
                                          title={`${editors.map(e => e.userName).join(', ')} visualizando/editando agora`}
                                          style={{
                                            fontSize: 10,
                                            padding: '1px 6px',
                                            borderRadius: 9999,
                                            background: 'rgba(59, 130, 246, 0.25)',
                                            color: '#93c5fd',
                                            border: '1px solid rgba(59, 130, 246, 0.4)',
                                            fontWeight: 600,
                                            marginLeft: 6,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                          }}
                                        >
                                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
                                          {editors[0].userName.split(' ')[0]}
                                        </span>
                                      );
                                    })()}
                                    <small>{company.city || 'Município não informado'}</small>
                                    {certificate && (
                                      <span className={`cushman-certificate ${certificate.status.toLowerCase()}`}>
                                        {certificate.isUrgent && <AlertCircle size={12} />}
                                        Certificado · {certificate.label}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>{formatCnpj(company.cnpj || '')}</td>
                                <td>
                                  <span className={`status-badge ${row.calculatedStatus === 'COMPLETED' ? 'completed' : row.calculatedStatus === 'IN_PROGRESS' ? 'in-progress' : 'pending'}`}>
                                    {STATUS[row.calculatedStatus] || row.calculatedStatus}
                                  </span>
                                  <small className="cushman-client-status">
                                    {company.exitDate ? `Saída: ${formatDateDisplay(company.exitDate)}` : 'Ativa'}
                                  </small>
                                </td>
                                {columns.map(column => {
                                  const key = resolveCushmanKey(column) || column.id;
                                  const value = row.columnsData[key];

                                  if (key === 'cush_observacao') {
                                    return (
                                      <td key={column.id}>
                                        <button
                                          type="button"
                                          className="copy-badge-btn"
                                          style={{ background: value ? 'rgba(99, 102, 241, 0.15)' : undefined }}
                                          title={value || 'Observação Cushman'}
                                          onClick={() => {
                                            setNotesModal({ row, column });
                                            setNotesDraft(String(value || ''));
                                            setNotesError('');
                                          }}
                                        >
                                          {value ? (String(value).length > 16 ? String(value).slice(0, 16) + '...' : String(value)) : '+ Obs'}
                                        </button>
                                      </td>
                                    );
                                  }

                                  const appearance = getCushmanStatusAppearance(value);
                                  const disabled = !row.participates || !row.closingId || pending > 0 || !rowEditable || column.isEditable === false;

                                  return (
                                    <td key={column.id}>
                                      <button
                                        type="button"
                                        className={`obligation-btn ${row.participates ? appearance.className : 'na'}`}
                                        disabled={disabled}
                                        title={!row.participates ? 'Sem obrigação Cushman nesta competência' : (appearance.tooltip || appearance.label)}
                                        onClick={() => openActionModal(row, column, key)}
                                      >
                                        {row.participates ? appearance.label : 'N/A'}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {!filtered.length && (
                            <tr>
                              <td colSpan={5 + columns.length} className="cushman-empty">
                                Nenhuma empresa encontrada para estes filtros.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              {companyRow && (
                <CushmanCompanyModal
                  row={{ ...companyRow, notesEditable: notesColumn?.isEditable !== false && !!notesColumn && isRowEditable(companyRow) }}
                  canEdit={isRowEditable(companyRow)}
                  onClose={() => setCompanyId('')}
                  onSave={body => saveCompany(companyRow, body)}
                  onSaveNotes={value => saveColumn(companyRow, 'cush_observacao', value)}
                />
              )}

              {/* MODAL DE OBSERVAÇÃO CUSHMAN */}
              {notesModal && (
                <div className="closing-modal-backdrop" onClick={() => { if (!notesSaving) setNotesModal(null); }}>
                  <div className="closing-modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                    <div className="closing-modal-header">
                      <div className="closing-modal-title">
                        <FileText size={20} />
                        Observação Cushman
                      </div>
                      <button type="button" className="closing-modal-close-btn" aria-label="Fechar observação" disabled={notesSaving} onClick={() => setNotesModal(null)}>
                        <X size={20} />
                      </button>
                    </div>
                    <div className="closing-modal-body">
                      <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 10px 0' }}>
                        Empresa: <strong style={{ color: '#fff' }}>{notesModal.row.company.name}</strong> · {label}
                      </p>
                      <textarea
                        className="fiscal-column-text"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '0.9rem',
                          resize: 'vertical',
                          minHeight: '130px',
                        }}
                        rows={6}
                        value={notesDraft}
                        disabled={notesSaving || !isRowEditable(notesModal.row) || notesModal.column.isEditable === false}
                        onChange={e => setNotesDraft(e.target.value)}
                        placeholder="Observações Cushman para esta competência..."
                        autoFocus
                      />
                      {notesError && <p role="alert" className="cushman-error">{notesError}</p>}
                      <div className="sub-modal-actions" style={{ marginTop: 12 }}>
                        <button type="button" className="btn-secondary-light" disabled={notesSaving} onClick={() => setNotesModal(null)}>
                          Fechar
                        </button>
                        {isRowEditable(notesModal.row) && notesModal.column.isEditable !== false && (
                          <button
                            type="button"
                            className="btn-primary-gradient"
                            disabled={notesSaving}
                            onClick={async () => {
                              setNotesSaving(true);
                              setNotesError('');
                              try {
                                await saveColumn(notesModal.row, 'cush_observacao', notesDraft);
                                setNotesModal(null);
                              } catch (err) {
                                setNotesError(err instanceof Error ? err.message : 'Erro ao salvar.');
                              } finally {
                                setNotesSaving(false);
                              }
                            }}
                          >
                            {notesSaving ? 'Salvando...' : 'Salvar observação'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL PADRONIZADO CUSHMAN (IDÊNTICO AO FISCAL E DP) */}
              {actionModal && (
                <div className="closing-modal-backdrop" onClick={() => setActionModal(null)}>
                  <div className="closing-modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                    <div className="closing-modal-header">
                      <div className="closing-modal-title">
                        <FileText size={20} />
                        {actionModal.column.name}
                      </div>
                      <button className="closing-modal-close-btn" onClick={() => setActionModal(null)} aria-label="Fechar modal">
                        <X size={20} />
                      </button>
                    </div>
                    <div className="closing-modal-body">
                      <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 16px 0' }}>
                        <strong style={{ color: '#fff' }}>{actionModal.row.company.name}</strong> · {label}
                      </p>
                      {actionError && <p role="alert" className="cushman-error" style={{ marginBottom: 12 }}>{actionError}</p>}

                      {modalMode === 'MAIN' && (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button
                              type="button"
                              className="btn-action-blue-gradient"
                              onClick={() => setModalMode('DATE')}
                              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff' }}
                            >
                              <Calendar size={16} />
                              OK - DATA ({inputDate || getTodayBr()})
                            </button>

                            <button
                              type="button"
                              className="btn-action-blue-gradient"
                              onClick={handleActionSemMov}
                              style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', color: '#fff' }}
                            >
                              <Check size={16} />
                              OK - SEM MOVIMENTO
                            </button>

                            <button
                              type="button"
                              className="btn-action-blue-gradient"
                              onClick={() => setModalMode('PENDENCY')}
                              style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f43f5e 100%)', color: '#fff' }}
                            >
                              <AlertCircle size={16} />
                              REGISTRAR PENDÊNCIA
                            </button>

                            <button
                              type="button"
                              className="btn-action-purple-gradient"
                              onClick={handleActionNA}
                              style={{ background: '#475569', color: '#fff' }}
                            >
                              <X size={16} />
                              N/A (NÃO SE APLICA)
                            </button>

                            <button
                              type="button"
                              className="btn-secondary-light"
                              onClick={handleActionLimpar}
                              style={{ marginTop: 6 }}
                            >
                              <RefreshCw size={15} />
                              LIMPAR / VOLTAR PARA PENDENTE
                            </button>

                            <button
                              type="button"
                              className="btn-secondary-light"
                              onClick={() => {
                                setAuditTarget({
                                  companyId: actionModal.row.company.id,
                                  companyName: actionModal.row.company.name,
                                  companyCode: actionModal.row.company.code,
                                  columnKey: actionModal.key,
                                  columnLabel: actionModal.column.name,
                                });
                              }}
                              style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}
                            >
                              <History size={15} />
                              HISTÓRICO DA CÉLULA (AUDITORIA)
                            </button>
                          </div>

                          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #334155' }}>
                            <label style={{ fontSize: '0.82rem', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                              Ou digite uma anotação personalizada:
                            </label>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                type="text"
                                className="fiscal-column-text"
                                style={{ flex: 1, width: 'auto' }}
                                placeholder="Ex: Protocolo 9923, Aguardando, etc."
                                value={customTextInput}
                                onChange={e => setCustomTextInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleActionCustomText(); }}
                              />
                              <button
                                type="button"
                                className="btn-primary-gradient"
                                onClick={handleActionCustomText}
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        </>
                      )}

                      {modalMode === 'DATE' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <label style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 500 }}>
                            Informe ou escolha a data de conclusão (aceita datas retroativas):
                          </label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="text"
                              className="fiscal-column-text"
                              style={{ flex: 1, width: 'auto', fontSize: '1rem', padding: '10px 12px' }}
                              placeholder="DD/MM/AAAA"
                              value={inputDate}
                              onChange={e => setInputDate(e.target.value)}
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleActionOkData(); }}
                            />
                            <input
                              type="date"
                              aria-label="Selecionar data no calendário"
                              className="fiscal-column-text"
                              style={{ width: '148px', padding: '9px 10px', fontSize: '0.9rem' }}
                              value={brDateToIso(inputDate)}
                              onChange={e => {
                                if (e.target.value) setInputDate(isoDateToBr(e.target.value));
                              }}
                            />
                            <button
                              type="button"
                              className="btn-secondary-light"
                              onClick={() => setInputDate(getTodayBr())}
                              title="Usar data de hoje"
                            >
                              Hoje
                            </button>
                          </div>
                          <div className="sub-modal-actions" style={{ marginTop: 12 }}>
                            <button type="button" className="btn-secondary-light" onClick={() => setModalMode('MAIN')}>
                              Voltar
                            </button>
                            <button
                              type="button"
                              className="btn-primary-gradient"
                              onClick={handleActionOkData}
                            >
                              Salvar Conclusão
                            </button>
                          </div>
                        </div>
                      )}

                      {modalMode === 'PENDENCY' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <label style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 500 }}>
                            Descreva o motivo da pendência:
                          </label>
                          <textarea
                            rows={4}
                            className="fiscal-column-text"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              fontSize: '0.9rem',
                              resize: 'vertical'
                            }}
                            placeholder="Ex: Aguardando envio das notas pela empresa..."
                            value={inputPendencyReason}
                            onChange={e => setInputPendencyReason(e.target.value)}
                            autoFocus
                          />
                          <div className="sub-modal-actions" style={{ marginTop: 12 }}>
                            <button type="button" className="btn-secondary-light" onClick={() => setModalMode('MAIN')}>
                              Voltar
                            </button>
                            <button
                              type="button"
                              className="btn-primary-gradient"
                              style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}
                              onClick={handleActionSavePendency}
                            >
                              Registrar Pendência
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Trilha de Auditoria na Célula */}
              {auditTarget && (
                <CellAuditModal
                  isOpen={Boolean(auditTarget)}
                  onClose={() => setAuditTarget(null)}
                  companyId={auditTarget.companyId}
                  companyName={auditTarget.companyName}
                  companyCode={auditTarget.companyCode}
                  columnKey={auditTarget.columnKey}
                  columnLabel={auditTarget.columnLabel}
                  sector="CUSHMAN"
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
