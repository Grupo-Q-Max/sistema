import { latestOpenPeriod } from '../config/competenceCalendar';
import { useCompetenceCalendar } from './useCompetenceCalendar';
import { memo, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, RefreshCw, Users, X, ExternalLink, AlertTriangle, Copy, Search, AlertCircle, Filter, Check, Calendar, FileText, Clock, Sparkles, History, BarChart3 } from 'lucide-react';
import { CompanyDetailsModal, getCertificateStatus, formatCnpj, formatRegimeLabel } from './CompanyDetailsModal';
import { Sidebar } from './Sidebar';
import { ClosingSectorTabs, hasSectorAccess } from './ClosingSectorTabs';
import { TableSkeleton, ButtonSpinner } from './LoadingSkeleton';
import { CellAuditModal } from './CellAuditModal';
import { BulkAssignResponsibleModal } from './BulkAssignResponsibleModal';
import { ResponsibleWorkloadModal } from './ResponsibleWorkloadModal';
import type { CurrentUser } from '../types/auth';
import { API } from '../api';
import { PAYROLL_API_VERSION, effectiveFieldConfig, resolveColumnKey } from '../config/payrollColumns';
import { defaultPopup, effectivePopup, type PopupConfig } from '../config/fiscalPopups';
import { visibilitySummary } from '../config/columnVisibility';
import { exportToCsv } from '../utils/exportCsv';
import { compareCodes, formatCompanyCode } from '../utils/codeSort';
import { canUserEditCompany, canUserViewCompany, isUserResponsibleForCompany, companyBelongsToSector } from '../config/companyPermissions';
import { installmentHeaders } from '../config/installments';
import './Closings.css';
import './PayrollClosings.css';

type Props = { currentView: string; onNavigate: (view: string) => void; currentUser?: CurrentUser | null; onLogout?: () => void };
type PayrollRow = { company: any; closingId: string; columnsData: Record<string, any>; calculatedStatus: string; progressPercent: number; fiscalReinf: any };
export const PAYROLL_BASE_HEADERS = ['Código', 'Empresa / Certificado', 'Tributação', 'Status', 'Responsável', 'CNPJ'];
const STATUS_LABELS: Record<string, string> = { COMPLETED: 'Concluído', IN_PROGRESS: 'Em Andamento', PENDING: 'Pendente' };

function getTodayBr(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

export function getPayrollStatusAppearance(value: any): { className: string; label: string; tooltip?: string } {
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
      const lbl = value.completionDate || value.label || 'OK';
      return { className: 'ok-data', label: lbl };
    }
    return { className: 'pendente', label: value.label || 'Pendente' };
  }

  const str = String(value).trim();
  const upper = str.toUpperCase();

  if (upper === 'N/A' || upper === 'NA' || upper === 'NÃO APLICA' || upper === 'NAO SE APLICA') {
    return { className: 'na', label: 'N/A' };
  }
  if (upper === 'SEM MOVIMENTO' || upper === 'OK - SEM MOVIMENTO' || upper === 'OK - S/ MOV' || upper === 'S/ MOV') {
    return { className: 'sem-mov', label: 'OK - S/ MOV' };
  }
  if (upper === 'PENDÊNCIA' || upper === 'PENDENCIA' || upper.startsWith('PEND')) {
    return { className: 'pendencia', label: 'PENDÊNCIA', tooltip: str };
  }
  if (upper === 'OK' || upper === 'SIM' || upper === 'CONCLUÍDO' || upper === 'CONCLUIDO') {
    return { className: 'ok-data', label: 'OK' };
  }
  return { className: 'ok-data', label: str };
}

function isPayrollActionColumn(key: string, column?: any): boolean {
  if (column) {
    if (['SELECT', 'NUMBER', 'TEXTAREA', 'PASSWORD', 'CHECKBOX', 'READONLY'].includes(column.inputType)) {
      return false;
    }
    if (column.inputType === 'ACTION' || column.inputType === 'POPUP' || column.actionType === 'MODAL') {
      return true;
    }
  }
  if (['dp_observacao', 'dp_reinf_fiscal', 'dp_qtde_funcionarios', 'dp_tipo_folha', 'dp_folha_pagto', 'dp_data_pagto', 'dp_sd_login', 'dp_sd_senha'].includes(key)) {
    return false;
  }
  return true;
}

function normalizePayrollDraft(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    return String(value.completionDate || value.label || value.status || '');
  }
  return String(value);
}

function reinfAppearance(value: any) {
  const status = value?.status;
  if (status === 'N/A') return { className: 'na', label: 'N/A' };
  if (status === 'SEM_MOVIMENTO' || status === 'OK - SEM MOVIMENTO') return { className: 'sem-mov', label: value.sentWithApi ? 'S/ MOV (API)' : 'OK - S/ MOV' };
  if (status === 'CONCLUIDO' || status === 'OK - DATA') return { className: 'ok-data', label: (value.completionDate || value.label || 'OK') + (value.sentWithApi ? ' (API)' : '') };
  if (status === 'PENDENCIA') return { className: 'pendencia', label: 'PENDÊNCIA' };
  return { className: 'pendente', label: value?.label || 'Pendente' };
}

function brToIsoDate(val: string): string {
  const m = val.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function isoToBrDate(val: string): string {
  const m = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : val;
}

export const PayrollInput = memo(function PayrollInput({ column, value, disabled, onSave }: { column: any; value: any; disabled: boolean; onSave: (value: any) => Promise<void> }) {
  const [draft, setDraft] = useState(() => normalizePayrollDraft(value));
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setDraft(normalizePayrollDraft(value)); }, [value]);
  async function commit(next = draft) {
    if (disabled || saving || !dirty.current) return;
    const parsed = column.inputType === 'NUMBER' ? (next.trim() === '' ? '' : Number(next)) : next;
    if (column.inputType === 'NUMBER' && parsed !== '' && (!Number.isInteger(parsed) || Number(parsed) < 0)) { setError('Informe um número inteiro, maior ou igual a zero.'); return; }
    setSaving(true); setError('');
    try { await onSave(parsed); dirty.current = false; } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); } finally { setSaving(false); }
  }
  const config = useMemo(() => effectiveFieldConfig(column), [column]);
  const options = useMemo(
    () => Array.from(new Set([...(Array.isArray(config.options) ? config.options : []), ...(Array.isArray(config.pendingOptions) ? config.pendingOptions : [])])),
    [config]
  );
  const pendingSet = useMemo(
    () => new Set(['PENDENTE', 'PENDÊNCIA', 'PENDENCIA', ...((config.pendingOptions || []).map(o => o.trim().toUpperCase()))]),
    [config]
  );
  const inputProps = { value: draft, disabled: disabled || saving, 'aria-label': column.name, placeholder: config.placeholder, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { dirty.current = true; setDraft(e.target.value); }, onBlur: () => { void commit(); }, onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); } };
  if (column.inputType === 'CHECKBOX') return <div className="payroll-input-cell"><input aria-label={column.name} type="checkbox" checked={value === true} disabled={disabled || saving} onChange={async e => { setSaving(true); try { await onSave(e.target.checked); } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar.'); } finally { setSaving(false); } }} />{error && <small role="alert">{error}</small>}</div>;
  const selectClass = column.inputType === 'SELECT'
    ? (!draft || pendingSet.has(draft.trim().toUpperCase()) ? 'payroll-select-pending' : draft.trim().toUpperCase() === 'N/A' ? 'payroll-select-na' : 'payroll-select-filled')
    : '';
  return <div className="payroll-input-cell">
    {column.inputType === 'SELECT' ? <select className={selectClass} aria-label={column.name} value={draft} disabled={disabled || saving} onChange={e => { dirty.current = true; setDraft(e.target.value); void commit(e.target.value); }}><option value="">Selecione...</option>{draft && !options.includes(draft) && <option value={draft}>{draft} (anterior)</option>}{options.map(option => <option key={option} value={option}>{option}</option>)}</select>
      : column.inputType === 'TEXTAREA' ? <textarea {...inputProps} onKeyDown={undefined} rows={1} />
        : <div className="payroll-password-cell"><input {...inputProps} type={column.inputType === 'NUMBER' ? 'number' : column.inputType === 'PASSWORD' && !revealed ? 'password' : 'text'} min={column.inputType === 'NUMBER' ? 0 : undefined} step={column.inputType === 'NUMBER' ? 1 : undefined} autoComplete="off" />{column.inputType === 'PASSWORD' && <button type="button" aria-label={revealed ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setRevealed(!revealed)}>{revealed ? <EyeOff size={14} /> : <Eye size={14} />}</button>}</div>}
    {saving && <small>Salvando...</small>}{error && <small role="alert">{error} <button type="button" onClick={() => { void commit(); }}>Tentar novamente</button></small>}
  </div>;
});

export function PayrollClosings({ currentView, onNavigate, currentUser, onLogout }: Props) {
  const [period, setPeriod] = useState(() => latestOpenPeriod());
  const latestPeriod = useCompetenceCalendar();
  const canGoNext = period.getTime() < latestPeriod.getTime();
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [reinfDefinition, setReinfDefinition] = useState<PopupConfig>(defaultPopup('reinf'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [responsibleFilter, setResponsibleFilter] = useState('ALL');
  const [regimeFilter, setRegimeFilter] = useState('ALL');
  const [certFilter, setCertFilter] = useState('ALL');
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const [sort, setSort] = useState<{ key: 'code' | 'name' | 'regime' | 'status' | 'responsible'; asc: boolean }>({ key: 'code', asc: true });
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkToast, setBulkToast] = useState<string | null>(null);
  const [openHeaderFilter, setOpenHeaderFilter] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [scrollWidth, setScrollWidth] = useState(0);
  const filterContainer = useRef<HTMLDivElement>(null);
  const [companyDetails, setCompanyDetails] = useState<any | null>(null);
  const [notesDialog, setNotesDialog] = useState<{ row: PayrollRow; column: any } | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [reinfRow, setReinfRow] = useState<PayrollRow | null>(null);
  const [pending, setPending] = useState(0);
  const fetchSequence = useRef(0);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const upperScroll = useRef<HTMLDivElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const periodKey = `${period.getUTCFullYear()}-${period.getUTCMonth()}`;
  const currentPeriodKey = useRef(periodKey); currentPeriodKey.current = periodKey;
  const canEdit = hasSectorAccess(currentUser, 'DP', true);

  // Modal de Ação Padronizado (OK - DATA, OK - SEM MOVIMENTO, PENDÊNCIA, N/A, LIMPAR) e POPUP customizável
  const [actionModal, setActionModal] = useState<{ row: PayrollRow; column: any; key: string } | null>(null);
  const [modalMode, setModalMode] = useState<'MAIN' | 'DATE' | 'PENDENCY'>('MAIN');
  const [popupCustomForm, setPopupCustomForm] = useState<Record<string, string>>({});
  const [inputDate, setInputDate] = useState('');
  const [inputPendencyReason, setInputPendencyReason] = useState('');
  const [customTextInput, setCustomTextInput] = useState('');
  const [actionError, setActionError] = useState('');

  const canView = hasSectorAccess(currentUser, 'DP');

  async function load() {
    const sequence = ++fetchSequence.current; setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/closings?sector=DP&year=${period.getUTCFullYear()}&month=${period.getUTCMonth() + 1}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar o fechamento DP.');
      if (sequence !== fetchSequence.current) return;
      if (data.sector !== 'DP' || data.payrollApiVersion !== PAYROLL_API_VERSION || !Array.isArray(data.payrollColumns)) throw new Error('A API do DP está desatualizada. Pare a API antiga na porta 3001 e reinicie com npx.cmd tsx server/index.ts.');
      if (!data.payrollConfigured) throw new Error('As colunas do DP ainda não foram preparadas. Execute npx.cmd tsx scripts/configurar-dp.ts e atualize a tela.');
      setRows(data.rows || []);
      setColumns(data.payrollColumns);
      setUsers(data.fiscalUsers || []);
      setReinfDefinition(data.reinfDefinition || defaultPopup('reinf'));
    }
    catch (err) { if (sequence === fetchSequence.current) { setRows([]); setColumns([]); setError(err instanceof Error ? err.message : 'Erro ao carregar.'); } }
    finally { if (sequence === fetchSequence.current) setLoading(false); }
  }

  useEffect(() => {
    if (latestPeriod && Number.isFinite(latestPeriod.getTime())) {
      setPeriod(prev => prev.getTime() < latestPeriod.getTime() ? latestPeriod : prev);
    }
  }, [latestPeriod]);

  useEffect(() => {
    if (canView) void load();
    else setLoading(false);
    return () => { fetchSequence.current++; };
  }, [periodKey, canView]);
  useEffect(() => { setReinfRow(null); setCompanyDetails(null); setNotesDialog(null); setOpenHeaderFilter(null); setActionModal(null); }, [periodKey]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReinfRow(null);
        setCompanyDetails(null);
        if (!notesSaving) setNotesDialog(null);
        setOpenHeaderFilter(null);
        setActionModal(null);
      }
    };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, [notesSaving]);

  useEffect(() => {
    if (!openHeaderFilter) return;
    const close = (event: PointerEvent) => { if (!filterContainer.current?.contains(event.target as Node)) setOpenHeaderFilter(null); };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, [openHeaderFilter]);

  useEffect(() => { if (!copyMessage) return; const timer = window.setTimeout(() => setCopyMessage(''), 2500); return () => window.clearTimeout(timer); }, [copyMessage]);
  useEffect(() => {
    const table = tableScroll.current?.querySelector('table'); if (!table) return;
    const measure = () => setScrollWidth(table.scrollWidth); measure();
    const observer = new ResizeObserver(measure); observer.observe(table); return () => observer.disconnect();
  }, [loading, columns]);

  const [onlyMyCompanies, setOnlyMyCompanies] = useState(false);
  const [tableDensity, setTableDensity] = useState<'standard' | 'compact'>(() => {
    try {
      return (localStorage.getItem('fechamento_density') as 'standard' | 'compact') || 'standard';
    } catch {
      return 'standard';
    }
  });

  const toggleDensity = () => {
    setTableDensity(prev => {
      const next = prev === 'standard' ? 'compact' : 'standard';
      try { localStorage.setItem('fechamento_density', next); } catch {}
      return next;
    });
  };

  const [auditTarget, setAuditTarget] = useState<{
    companyId: string;
    companyName: string;
    companyCode?: string | null;
    columnKey: string;
    columnLabel: string;
  } | null>(null);
  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'SOCIO';

  const getResponsible = (company: any) => company.responsibles?.find((r: any) => r.sector === 'DP') || null;

  const isRowEditable = (row: PayrollRow) => {
    if (!canEdit) return false;
    if (isPrivileged) return true;
    return canUserEditCompany(currentUser, row.company, 'DP');
  };

  const scopedRows = useMemo(() => rows.filter(row => {
    if (!companyBelongsToSector(row.company, 'DP')) return false;
    if (onlyMyCompanies) return isUserResponsibleForCompany(currentUser, row.company, 'DP');
    if (!currentUser || isPrivileged) return true;
    return canUserViewCompany(currentUser, row.company, 'DP');
  }), [rows, currentUser, onlyMyCompanies, isPrivileged]);

  function sortValue(row: PayrollRow) {
    if (sort.key === 'status') return STATUS_LABELS[row.calculatedStatus] || '';
    if (sort.key === 'regime') return formatRegimeLabel(row.company.taxRegime || '');
    if (sort.key === 'responsible') return users.find(user => user.id === getResponsible(row.company)?.userId)?.name || users.find(user => user.id === getResponsible(row.company)?.userId)?.email || '';
    return String(row.company[sort.key] || '');
  }

  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => scopedRows.filter(row => {
    const c = row.company; const haystack = [c.code, c.name, c.tradeName, c.cnpj, c.groupName, c.city].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
    const matchSearch = haystack.includes(deferredSearch.toLocaleLowerCase('pt-BR')) || (/\d/.test(deferredSearch) && (c.cnpj || '').replace(/\D/g, '').includes(deferredSearch.replace(/\D/g, '')));
    let matchCert = true;
    if (certFilter !== 'ALL') {
      const cert = c.hasClientCertificate ? getCertificateStatus(c.certificateExpiration) : null;
      if (certFilter === 'EXPIRING') matchCert = cert?.status === 'EXPIRED' || cert?.status === 'WARNING';
      else if (certFilter === 'EXPIRED') matchCert = cert?.status === 'EXPIRED';
      else if (certFilter === 'WARNING') matchCert = cert?.status === 'WARNING';
      else if (certFilter === 'OK') matchCert = cert?.status === 'OK';
      else if (certFilter === 'HAS_CERT') matchCert = Boolean(c.hasClientCertificate);
      else if (certFilter === 'NO_CERT') matchCert = !c.hasClientCertificate;
    }
    return matchSearch && matchCert && (statusFilter === 'ALL' || row.calculatedStatus === statusFilter) && (responsibleFilter === 'ALL' || getResponsible(c)?.userId === responsibleFilter) && (regimeFilter === 'ALL' || c.taxRegime === regimeFilter);
  }).sort((a, b) => {
    if (sort.key === 'code') return compareCodes(a.company.code, b.company.code, sort.asc);
    return sortValue(a).localeCompare(sortValue(b), 'pt-BR', { numeric: true }) * (sort.asc ? 1 : -1);
  }), [scopedRows, deferredSearch, statusFilter, responsibleFilter, regimeFilter, certFilter, sort, users]);

  const totalEmployees = scopedRows.reduce((total, row) => total + (Number(row.columnsData?.dp_qtde_funcionarios) || 0), 0);

  const summary = useMemo(() => {
    const total = scopedRows.length;
    const completed = scopedRows.filter(r => r.calculatedStatus === 'COMPLETED').length;
    const inProgress = scopedRows.filter(r => r.calculatedStatus === 'IN_PROGRESS').length;
    const pendingCount = scopedRows.filter(r => r.calculatedStatus === 'PENDING').length;
    const overallPercent = total ? Math.round(scopedRows.reduce((acc, r) => acc + (r.progressPercent || 0), 0) / total) : 0;
    return { total, completed, inProgress, pending: pendingCount, overallPercent };
  }, [scopedRows]);

  function enqueueSave(row: PayrollRow, column: any, value: any): Promise<void> {
    if (!isRowEditable(row)) return Promise.reject(new Error('Você só pode editar empresas sob sua responsabilidade.'));
    const key = resolveColumnKey(column) || column.id;
    const capturedPeriod = currentPeriodKey.current;
    setPending(p => p + 1);
    const save = saveQueue.current.catch(() => { }).then(async () => {
      const res = await fetch(`${API}/api/closings/${row.closingId}/column`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({ columnKey: key, columnValue: value, userId: currentUser?.id, userName: currentUser?.name, userEmail: currentUser?.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar campo.');
      if (currentPeriodKey.current === capturedPeriod) {
        setRows(prev => prev.map(item => item.closingId === row.closingId ? {
          ...item,
          columnsData: { ...item.columnsData, [key]: value },
          calculatedStatus: data.closing?.status || item.calculatedStatus,
          progressPercent: data.closing?.progressPercent ?? item.progressPercent
        } : item));
      }
    });
    saveQueue.current = save;
    return save.finally(() => setPending(p => p - 1));
  }

  async function changeResponsible(row: PayrollRow, userId: string) {
    if (!isRowEditable(row)) return;
    const capturedPeriod = currentPeriodKey.current; setPending(p => p + 1);
    try {
      const res = await fetch(`${API}/api/companies/${row.company.id}/responsible`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({ userId, sector: 'DP', actorId: currentUser?.id, actorEmail: currentUser?.email, actorName: currentUser?.name || currentUser?.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar responsável.');
      if (currentPeriodKey.current === capturedPeriod) {
        setRows(prev => prev.map(item => item.company.id === row.company.id ? {
          ...item,
          company: {
            ...item.company,
            responsibles: [
              ...(item.company.responsibles || []).filter((r: any) => r.sector !== 'DP'),
              ...(userId ? [{ userId, sector: 'DP', user: users.find(u => u.id === userId) }] : [])
            ]
          }
        } : item));
      }
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Erro ao salvar responsável.'); }
    finally { setPending(p => p - 1); }
  }

  const handleExport = () => {
    const csvColumns = [
      { header: 'Código', key: 'code' },
      { header: 'Empresa', key: 'name' },
      { header: 'CNPJ', key: 'cnpj' },
      { header: 'Tributação', key: 'taxRegime' },
      { header: 'Status Geral', key: 'status' },
      { header: 'Responsável', key: 'responsible' },
      ...columns.map(c => ({ header: c.name, key: c.id }))
    ];

    const data = filtered.map(r => {
      const resp = getResponsible(r.company);
      const respUser = users.find(u => u.id === resp?.userId) || resp?.user;
      const respName = (respUser?.name || respUser?.email || 'Não atribuído').replace(/\s*\(Inativo\)$/i, '');
      const rowData: any = {
        code: formatCompanyCode(r.company.code),
        name: r.company.name || '',
        cnpj: formatCnpj(r.company.cnpj) || '',
        taxRegime: formatRegimeLabel(r.company.taxRegime),
        status: STATUS_LABELS[r.calculatedStatus] || 'Pendente',
        responsible: respName,
      };

      columns.forEach(col => {
        const key = resolveColumnKey(col) || col.id;
        if (key === 'dp_reinf_fiscal') {
          rowData[col.id] = reinfAppearance(r.fiscalReinf).label;
          return;
        }
        const val = r.columnsData?.[key];
        if (typeof val === 'object' && val !== null) {
          rowData[col.id] = val.completionDate || val.label || val.status || '';
        } else if (col.inputType === 'CHECKBOX') {
          rowData[col.id] = val ? 'Sim' : 'Não';
        } else {
          rowData[col.id] = val ?? '';
        }
      });
      return rowData;
    });

    const mesStr = String(period.getUTCMonth() + 1).padStart(2, '0') + '-' + period.getUTCFullYear();
    exportToCsv(`fechamento_dp_${mesStr}`, csvColumns, data);
  };

  const handleCopyAllCnpjs = async () => {
    const cnpjs = filtered.map(r => r.company.cnpj).filter(Boolean);
    if (!cnpjs.length) {
      setCopyMessage('Nenhum CNPJ encontrado.');
      return;
    }
    const cleanList = cnpjs.map((c: string) => c.replace(/\D/g, '')).join('\n');
    try {
      await navigator.clipboard.writeText(cleanList);
      setCopyMessage(`${cnpjs.length} CNPJs copiados!`);
    } catch {
      setError('Não foi possível copiar os CNPJs.');
    }
  };

  const regimes = Array.from(new Set(scopedRows.map(row => row.company.taxRegime).filter(Boolean))).sort((a, b) => formatRegimeLabel(a).localeCompare(formatRegimeLabel(b), 'pt-BR'));

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedCompanyIds.includes(r.company.id));
  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedCompanyIds([]);
    } else {
      setSelectedCompanyIds(filtered.map(r => r.company.id));
    }
  };

  function renderHeader(label: string, index: number) {
    if (index === 0) {
      return (
        <th key={label} className="sticky-col-code" aria-sort={sort.key === 'code' ? (sort.asc ? 'ascending' : 'descending') : undefined}>
          <div className="th-header-cell" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={handleToggleSelectAll}
              title={allFilteredSelected ? "Desmarcar todas" : "Selecionar todas as empresas filtradas"}
              style={{ accentColor: '#3b82f6', cursor: 'pointer', width: 14, height: 14 }}
            />
            <button type="button" className="payroll-sort-btn" title={`Ordenar por ${label}`} onClick={() => setSort({ key: 'code', asc: sort.key === 'code' ? !sort.asc : true })}>
              {label}<span>{sort.key === 'code' ? (sort.asc ? ' ▲' : ' ▼') : ' ↕'}</span>
            </button>
          </div>
        </th>
      );
    }
    const key = (["code", "name", "regime", "status", "responsible"] as const)[index];
    const filter = index === 2 ? { value: regimeFilter, set: setRegimeFilter, options: [{ value: 'ALL', label: 'Todas as tributações' }, ...regimes.map(value => ({ value, label: formatRegimeLabel(value) }))] } : index === 3 ? { value: statusFilter, set: setStatusFilter, options: [{ value: 'ALL', label: 'Todos os status' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))] } : index === 4 ? { value: responsibleFilter, set: setResponsibleFilter, options: [{ value: 'ALL', label: 'Todos os responsáveis' }, ...users.map(user => ({ value: user.id, label: user.name || user.email }))] } : null;
    return <th key={label} className={index === 1 ? 'sticky-col-company' : ''} aria-sort={key && sort.key === key ? (sort.asc ? 'ascending' : 'descending') : undefined}><div className="th-header-cell">
      {key ? <button type="button" className="payroll-sort-btn" title={`Ordenar por ${label}`} onClick={() => setSort({ key, asc: sort.key === key ? !sort.asc : true })}>{label}<span>{sort.key === key ? (sort.asc ? ' ▲' : ' ▼') : ' ↕'}</span></button> : label}
      {filter && <div className="th-filter-wrapper"><button type="button" className={`th-filter-icon-btn ${filter.value !== 'ALL' ? 'has-filter' : ''}`} aria-label={`Filtrar ${label}`} aria-expanded={openHeaderFilter === key} onClick={() => setOpenHeaderFilter(openHeaderFilter === key ? null : key)}><Filter size={12} /></button>{openHeaderFilter === key && <div className="th-filter-popover"><div className="payroll-filter-heading">Filtrar {label}</div>{filter.options.map(option => <button type="button" key={option.value} className={`th-filter-popover-item ${filter.value === option.value ? 'active' : ''}`} onClick={() => { filter.set(option.value); setOpenHeaderFilter(null); }}><span>{option.label}</span>{filter.value === option.value && <Check size={12} />}</button>)}</div>}</div>}
    </div></th>;
  }

  const monthLabel = `${String(period.getUTCMonth() + 1).padStart(2, '0')}/${period.getUTCFullYear()}`;

  function openActionModal(row: PayrollRow, column: any, key: string) {
    if (!isRowEditable(row)) return;
    const currentVal = row.columnsData[key];
    const existingDate = typeof currentVal === 'object' && currentVal?.completionDate
      ? String(currentVal.completionDate)
      : typeof currentVal === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(currentVal.trim())
      ? currentVal.trim()
      : getTodayBr();
    const config = effectivePopup(column, key);
    const existingData = (typeof currentVal === 'object' && currentVal !== null ? currentVal.data : null) || {};
    setPopupCustomForm(Object.fromEntries(config.fields.map(f => [f.key, String(existingData[f.key] ?? '')])));
    setActionModal({ row, column, key });
    setModalMode('MAIN');
    setActionError('');
    setInputDate(existingDate);
    setInputPendencyReason(typeof currentVal === 'object' && currentVal?.pendingReason ? String(currentVal.pendingReason) : '');
    setCustomTextInput(typeof currentVal === 'string' ? currentVal : (currentVal?.label || ''));
  }

  async function handleActionOkData() {
    if (!actionModal) return;
    const raw = inputDate.trim() || getTodayBr();
    const dateVal = isoToBrDate(raw);
    const payload = {
      status: 'CONCLUIDO',
      label: dateVal,
      completionDate: dateVal,
      updatedAt: new Date().toISOString()
    };
    setActionError('');
    try {
      await enqueueSave(actionModal.row, actionModal.column, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar a data.');
    }
  }

  async function handleActionSemMov() {
    if (!actionModal) return;
    const payload = {
      status: 'OK - SEM MOVIMENTO',
      label: 'OK - S/ MOV',
      updatedAt: new Date().toISOString()
    };
    setActionError('');
    try {
      await enqueueSave(actionModal.row, actionModal.column, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  }

  async function handleActionNA() {
    if (!actionModal) return;
    const payload = {
      status: 'N/A',
      label: 'N/A',
      updatedAt: new Date().toISOString()
    };
    setActionError('');
    try {
      await enqueueSave(actionModal.row, actionModal.column, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar N/A.');
    }
  }

  async function handleActionLimpar() {
    if (!actionModal) return;
    setActionError('');
    try {
      await enqueueSave(actionModal.row, actionModal.column, '');
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao limpar.');
    }
  }

  async function handleActionSavePendency() {
    if (!actionModal) return;
    const reason = inputPendencyReason.trim() || 'Pendência informada';
    const payload = {
      status: 'PENDENCIA',
      label: 'PENDÊNCIA',
      pendingReason: reason,
      updatedAt: new Date().toISOString()
    };
    setActionError('');
    try {
      await enqueueSave(actionModal.row, actionModal.column, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar pendência.');
    }
  }

  async function handleActionSaveCustom() {
    if (!actionModal) return;
    const text = customTextInput.trim();
    if (!text) {
      await handleActionLimpar();
      return;
    }
    setActionError('');
    try {
      await enqueueSave(actionModal.row, actionModal.column, text);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar anotação.');
    }
  }

  async function handleActionSavePopupFields() {
    if (!actionModal) return;
    const config = effectivePopup(actionModal.column, actionModal.key);
    const missing = config.fields.find(f => f.required && !(popupCustomForm[f.key] || '').trim());
    if (missing) {
      setActionError(`Preencha o campo obrigatório: ${missing.label}`);
      return;
    }
    const todayBr = getTodayBr();
    const payload = {
      status: 'CONCLUIDO',
      label: todayBr,
      completionDate: todayBr,
      data: popupCustomForm,
      updatedAt: new Date().toISOString()
    };
    setActionError('');
    try {
      await enqueueSave(actionModal.row, actionModal.column, payload);
      setActionModal(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar dados do popup.');
    }
  }

  return (
    <div className="crm-dashboard">
      <Sidebar currentView={currentView} onNavigate={onNavigate} currentUser={currentUser} onLogout={onLogout} />
      <main className="crm-main">
        <div className="closings-container payroll-closings">
          <div className="closings-header">
            <div className="closings-header-titles">
              <h1>
                <Users size={28} color="#818cf8" />
                Fechamento Departamento Pessoal
              </h1>
              <p>Acompanhamento operacional mensal por empresa</p>
            </div>
            <div className="closings-header-actions">
              <ClosingSectorTabs sector="DP" currentUser={currentUser} onNavigate={onNavigate} />
              <div className="month-selector-box">
                <button
                  type="button"
                  className="month-nav-btn"
                  title="Mês anterior"
                  aria-label="Mês anterior"
                  disabled={pending > 0}
                  onClick={() => setPeriod(new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() - 1, 1)))}
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="month-display-text">{monthLabel}</span>
                <button
                  type="button"
                  className="month-nav-btn"
                  title="Próximo mês"
                  aria-label="Próximo mês"
                  disabled={!canGoNext || pending > 0}
                  onClick={() => setPeriod(new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1)))}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>

          {!canView ? (
            <p className="payroll-error" style={{ marginTop: 24, fontSize: '1rem' }}>Você não tem acesso ao Departamento Pessoal.</p>
          ) : (
            <>
              <div className="closings-stats-grid">
                {[
                  { label: 'Total Empresas', value: summary.total, kind: 'total', Icon: Building2, status: 'ALL' },
                  { label: 'Concluídos', value: summary.completed, kind: 'completed', Icon: CheckCircle2, status: 'COMPLETED' },
                  { label: 'Em Andamento', value: summary.inProgress, kind: 'in-progress', Icon: Clock, status: 'IN_PROGRESS' },
                  { label: 'Pendentes', value: summary.pending, kind: 'pending', Icon: AlertCircle, status: 'PENDING' },
                  { label: 'Progresso (Campos)', value: summary.overallPercent + '%', kind: 'percent', Icon: Sparkles },
                  { label: 'Total Funcionários', value: totalEmployees, kind: 'percent', Icon: Users },
                ].map(({ label, value, kind, Icon, status }) => {
                  const isClickable = Boolean(status);
                  const isActive = status && status !== 'ALL' && statusFilter === status;
                  return (
                    <div
                      key={label}
                      className={`closing-stat-card ${isClickable ? 'stat-clickable' : ''} ${isActive ? `stat-active ${kind}` : ''}`}
                      role={isClickable ? 'button' : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      title={status ? (status === 'ALL' ? 'Clique para mostrar todas' : `Clique para filtrar apenas empresas ${label.toLowerCase()}`) : undefined}
                      onClick={status ? () => setStatusFilter(prev => prev === status ? 'ALL' : status) : undefined}
                      onKeyDown={status ? e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); setStatusFilter(prev => prev === status ? 'ALL' : status); } } : undefined}
                    >
                      <div className={`closing-stat-icon ${kind}`}><Icon size={22} /></div>
                      <div className="closing-stat-info">
                        <span>{label}</span>
                        <strong>{loading ? '—' : value}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="closings-toolbar">
                <div className="closings-search-box">
                  <Search size={18} color="#94a3b8" />
                  <input
                    aria-label="Buscar empresa"
                    placeholder="Buscar por código, empresa, CNPJ, grupo ou cidade..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button type="button" className="payroll-search-clear" aria-label="Limpar busca" onClick={() => setSearch('')}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="closings-filters">
                  <select className="closings-select" aria-label="Filtrar status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="ALL">Status: Todos</option>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <select className="closings-select" aria-label="Filtrar tributação" value={regimeFilter} onChange={e => setRegimeFilter(e.target.value)}>
                    <option value="ALL">Tributação: Todas</option>
                    {regimes.map(regime => <option key={regime} value={regime}>{formatRegimeLabel(regime)}</option>)}
                  </select>
                  <select className="closings-select" aria-label="Filtrar responsável" value={responsibleFilter} onChange={e => setResponsibleFilter(e.target.value)}>
                    <option value="ALL">Responsável: Todos</option>
                    {users.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
                  </select>
                  <select className="closings-select" aria-label="Filtrar certificado" value={certFilter} onChange={e => setCertFilter(e.target.value)}>
                    <option value="ALL">Certificados: Todos</option>
                    <option value="EXPIRING">Vencendo ou Vencidos</option>
                    <option value="EXPIRED">Apenas Vencidos</option>
                    <option value="WARNING">Vencendo em até 30 dias</option>
                    <option value="OK">Válidos (&gt; 30 dias)</option>
                    <option value="HAS_CERT">Com certificado</option>
                    <option value="NO_CERT">Sem certificado</option>
                  </select>
                  <label className="only-mine-toggle" title="Filtrar apenas empresas sob minha responsabilidade">
                    <input
                      type="checkbox"
                      checked={onlyMyCompanies}
                      onChange={e => setOnlyMyCompanies(e.target.checked)}
                    />
                    <span>Minhas empresas</span>
                  </label>
                  <button type="button" className="btn-secondary-light" onClick={handleCopyAllCnpjs} title="Copiar CNPJs limpos das empresas filtradas">
                    <Copy size={15} />
                    Copiar CNPJs
                  </button>
                  <button type="button" className="btn-secondary-light" onClick={() => setWorkloadOpen(true)} title="Ver ranking e distribuição de empresas por responsável">
                    <BarChart3 size={15} />
                    Carga da Equipe
                  </button>
                  <button className="payroll-refresh-btn" type="button" title="Atualizar fechamento DP" aria-label="Atualizar fechamento DP" disabled={pending > 0 || loading} onClick={() => { void load(); }}>
                    <RefreshCw size={16} className={loading ? 'payroll-spin' : ''} />
                  </button>
                  <button
                    type="button"
                    className={`btn-density-toggle ${tableDensity === 'compact' ? 'active' : ''}`}
                    onClick={toggleDensity}
                    title={tableDensity === 'compact' ? 'Mudar para modo Espaçoso' : 'Mudar para modo Compacto'}
                  >
                    <span>{tableDensity === 'compact' ? 'Modo Compacto' : 'Modo Padrão'}</span>
                  </button>
                  <button className="btn-secondary-light" onClick={handleExport} title="Exportar para Excel (CSV)">
                    <ExternalLink size={16} />
                    Exportar
                  </button>
                </div>
              </div>

              {/* Chips de Filtro Rápido com Contadores em Tempo Real */}
              <div className="quick-filter-chips">
                <button
                  type="button"
                  className={`quick-chip ${statusFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ALL')}
                >
                  <span>🌐 Todas</span>
                  <span className="chip-count">{summary.total}</span>
                </button>

                <button
                  type="button"
                  className={`quick-chip chip-pending ${statusFilter === 'PENDING' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('PENDING')}
                >
                  <span>🔥 Só Pendentes</span>
                  <span className="chip-count">{summary.pending}</span>
                </button>

                <button
                  type="button"
                  className={`quick-chip chip-progress ${statusFilter === 'IN_PROGRESS' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('IN_PROGRESS')}
                >
                  <span>⏳ Em Andamento</span>
                  <span className="chip-count">{summary.inProgress}</span>
                </button>

                <button
                  type="button"
                  className={`quick-chip chip-completed ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('COMPLETED')}
                >
                  <span>✅ Concluídas</span>
                  <span className="chip-count">{summary.completed}</span>
                </button>
              </div>

              <div className="payroll-table-meta">
                <span>{loading ? 'Carregando empresas...' : `${filtered.length} de ${scopedRows.length} empresas`}<span className="payroll-meta-separator">·</span><Users size={14} />{loading ? '-' : totalEmployees} funcionários</span>
                <span className="payroll-save-status" aria-live="polite">{pending > 0 ? <><ButtonSpinner />Salvando alterações...</> : <><CheckCircle2 size={14} />Salvamento automático</>}</span>
              </div>
              {error && <div className="payroll-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Fechar</button></div>}
              {!loading && !error && columns.length === 0 && <p className="payroll-error">Nenhuma coluna operacional DP está ativa nesta competência. Confira meses, anos e atividade em Configurações → DP.</p>}
              <div className="closings-table-card" ref={filterContainer}>
                {loading ? (
                  <div className="payroll-loading"><TableSkeleton count={6} /></div>
                ) : (
                  <>
                    <div
                      className="payroll-scroll-top"
                      ref={upperScroll}
                      onScroll={e => {
                        if (syncingScroll.current || !tableScroll.current) return;
                        syncingScroll.current = true;
                        tableScroll.current.scrollLeft = e.currentTarget.scrollLeft;
                        requestAnimationFrame(() => { syncingScroll.current = false; });
                      }}
                    >
                      <div style={{ width: scrollWidth || 1080 + columns.length * 170, height: 1 }} />
                    </div>
                    <div
                      className={`closings-table-wrapper payroll-table-scroll ${tableDensity === 'compact' ? 'table-compact' : ''}`}
                      ref={tableScroll}
                      onScroll={e => {
                        if (syncingScroll.current || !upperScroll.current) return;
                        syncingScroll.current = true;
                        upperScroll.current.scrollLeft = e.currentTarget.scrollLeft;
                        requestAnimationFrame(() => { syncingScroll.current = false; });
                      }}
                    >
                      <table className="closings-table payroll-table" style={{ minWidth: `${1080 + columns.length * 170}px` }}>
                        <thead>
                          <tr>
                            {PAYROLL_BASE_HEADERS.map(renderHeader)}
                            {columns.map(column => <th key={column.id} title={visibilitySummary(column)}>{column.name}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.length === 0 ? (
                            <tr><td colSpan={PAYROLL_BASE_HEADERS.length + columns.length} className="payroll-empty">Nenhuma empresa encontrada nesta competência.</td></tr>
                          ) : (
                            filtered.map(row => {
                              const c = row.company;
                              const certInfo = c.hasClientCertificate ? getCertificateStatus(c.certificateExpiration) : null;
                              return (
                                <tr key={row.closingId || c.id}>
                                  <td className="sticky-col-code">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <input
                                        type="checkbox"
                                        checked={selectedCompanyIds.includes(c.id)}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          setSelectedCompanyIds(prev =>
                                            prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id]
                                          );
                                        }}
                                        title="Selecionar empresa"
                                        style={{ accentColor: '#3b82f6', cursor: 'pointer', width: 14, height: 14 }}
                                      />
                                      <span style={{ fontWeight: 600, color: '#94a3b8' }}>{formatCompanyCode(c.code) || '—'}</span>
                                    </div>
                                  </td>
                                  <td className="sticky-col-company">
                                    <div className="company-cell-wrapper">
                                      <button type="button" className="company-interactive-link" title="Ver dados da empresa e certificado" onClick={() => setCompanyDetails(c)}>
                                        <div className="company-link-left"><Building2 size={16} color="#818cf8" style={{ flexShrink: 0 }} /><span>{c.name}</span></div>
                                        <div className="company-link-icon-chip"><span>Ver Dados</span><ExternalLink size={10} /></div>
                                      </button>
                                      {c.tradeName && <div className="company-cell-trade">{c.tradeName}</div>}
                                      {certInfo && (
                                        <button className={`cert-warning-tag ${certInfo.status === 'EXPIRED' ? 'expired' : ''}`} type="button" onClick={() => setCompanyDetails(c)} title={`Vencimento: ${c.certificateExpiration}`}>
                                          <AlertTriangle size={11} />{certInfo.label}
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                  <td><span className={`tax-regime-pill ${c.taxRegime === 'SIMPLES_NACIONAL' ? 'simples' : c.taxRegime?.includes('PRESUMIDO') ? 'presumido' : c.taxRegime?.includes('REAL') ? 'real' : c.taxRegime === 'MEI' ? 'mei' : ''}`}>{formatRegimeLabel(c.taxRegime || '')}</span></td>
                                  <td title={`Progresso: ${row.progressPercent}%`}><span className={`status-badge ${row.calculatedStatus === 'COMPLETED' ? 'completed' : row.calculatedStatus === 'IN_PROGRESS' ? 'in-progress' : 'pending'}`}>{STATUS_LABELS[row.calculatedStatus] || row.calculatedStatus}</span></td>
                                  <td><select className="table-user-select" aria-label={`Responsável DP de ${c.name}`} disabled={!isRowEditable(row) || pending > 0} value={getResponsible(c)?.userId || ''} onChange={e => { void changeResponsible(row, e.target.value); }}><option value="">Não atribuído</option>{users.map(user => <option key={user.id} value={user.id} disabled={user.active === false}>{user.name || user.email}</option>)}</select></td>
                                  <td><button type="button" className="copy-badge-btn" title="Copiar CNPJ" onClick={() => { void navigator.clipboard.writeText(c.cnpj || '').then(() => setCopyMessage('CNPJ copiado!')).catch(() => setError('Não foi possível copiar o CNPJ.')); }}>{formatCnpj(c.cnpj || '')}<Copy size={12} /></button></td>
                                  {columns.map(column => {
                                    const key = resolveColumnKey(column) || column.id;
                                    const handleCellContextMenu = (e: React.MouseEvent) => {
                                      e.preventDefault();
                                      setAuditTarget({
                                        companyId: c.id,
                                        companyName: c.name,
                                        companyCode: c.code,
                                        columnKey: key,
                                        columnLabel: column.name || key,
                                      });
                                    };

                                    if (key === 'dp_reinf_fiscal') {
                                      return (
                                        <td key={column.id} onContextMenu={handleCellContextMenu}>
                                          <button className={`obligation-btn ${reinfAppearance(row.fiscalReinf).className}`} title="Consultar REINF do Fiscal desta competência" onClick={() => setReinfRow(row)}>
                                            <Eye size={14} />{reinfAppearance(row.fiscalReinf).label}
                                          </button>
                                        </td>
                                      );
                                    }
                                    if (key === 'dp_observacao') {
                                      return (
                                        <td key={column.id} onContextMenu={handleCellContextMenu}>
                                          <button type="button" className="copy-badge-btn" style={{ background: row.columnsData[key] ? 'rgba(99, 102, 241, 0.15)' : undefined }} title={row.columnsData[key] || 'Observação do DP'} onClick={() => { setNotesDialog({ row, column }); setNotesDraft(String(row.columnsData[key] ?? '')); setNotesError(''); }}>
                                            {row.columnsData[key] ? String(row.columnsData[key]).slice(0, 16) + (String(row.columnsData[key]).length > 16 ? '...' : '') : '+ Obs'}
                                          </button>
                                        </td>
                                      );
                                    }
                                    if (isPayrollActionColumn(key, column)) {
                                      const appearance = getPayrollStatusAppearance(row.columnsData[key]);
                                      return (
                                        <td key={column.id} onContextMenu={handleCellContextMenu}>
                                          <button
                                            type="button"
                                            className={`obligation-btn ${appearance.className}`}
                                            title={appearance.tooltip || appearance.label}
                                            disabled={!isRowEditable(row) || column.isEditable === false}
                                            onClick={() => openActionModal(row, column, key)}
                                          >
                                            {appearance.label}
                                          </button>
                                        </td>
                                      );
                                    }
                                    return (
                                      <td key={column.id} onContextMenu={handleCellContextMenu}>
                                        <PayrollInput column={column} value={row.columnsData[key]} disabled={!isRowEditable(row) || column.isEditable === false || column.inputType === 'READONLY'} onSave={value => enqueueSave(row, column, value)} />
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
    {copyMessage && <div className="payroll-copy-toast" role="status"><CheckCircle2 size={16} />{copyMessage}</div>}
    {companyDetails && (
      <CompanyDetailsModal
        company={companyDetails}
        currentUser={currentUser}
        notesLabel="Observações do cadastro"
        onClose={() => setCompanyDetails(null)}
      />
    )}
    <ResponsibleWorkloadModal
      isOpen={workloadOpen}
      onClose={() => setWorkloadOpen(false)}
      rows={scopedRows}
      users={users}
      sector="DP"
      onSelectResponsible={userId => setResponsibleFilter(userId || 'ALL')}
    />
    {notesDialog && <div className="closing-modal-backdrop" onClick={() => { if (!notesSaving) setNotesDialog(null); }}><div className="closing-modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}><div className="closing-modal-header"><div className="closing-modal-title">Observação do DP</div><button type="button" className="closing-modal-close-btn" aria-label="Fechar observação do DP" disabled={notesSaving} onClick={() => setNotesDialog(null)}><X size={20} /></button></div><div className="closing-modal-body"><p>{notesDialog.row.company.name} · {monthLabel}</p><textarea className="payroll-note-textarea" rows={6} value={notesDraft} disabled={notesSaving || !isRowEditable(notesDialog.row) || notesDialog.column.isEditable === false} onChange={e => setNotesDraft(e.target.value)} placeholder="Observações do DP para esta competência" />{notesError && <p role="alert">{notesError}</p>}<div className="sub-modal-actions"><button type="button" className="btn-secondary-light" disabled={notesSaving} onClick={() => setNotesDialog(null)}>Fechar</button>{isRowEditable(notesDialog.row) && notesDialog.column.isEditable !== false && <button type="button" className="btn-primary-gradient" disabled={notesSaving} onClick={async () => { setNotesSaving(true); setNotesError(''); try { await enqueueSave(notesDialog.row, notesDialog.column, notesDraft); setNotesDialog(null); } catch (err) { setNotesError(err instanceof Error ? err.message : 'Erro ao salvar.'); } finally { setNotesSaving(false); } }}>{notesSaving ? 'Salvando...' : 'Salvar observação'}</button>}</div></div></div></div>}
    {reinfRow && <PayrollReinfPreview row={reinfRow} definition={reinfDefinition} monthLabel={monthLabel} onClose={() => setReinfRow(null)} />}

    {/* MODAL PADRONIZADO DO DP (IDÊNTICO AO FISCAL: OK - DATA, OK - SEM MOVIMENTO, PENDÊNCIA, N/A, LIMPAR E CAMPOS CONFIGURADOS) */}
    {actionModal && (() => {
      const popupConf = effectivePopup(actionModal.column, actionModal.key);
      const hasFields = Array.isArray(popupConf.fields) && popupConf.fields.length > 0;
      return (
      <div className="closing-modal-backdrop" onClick={() => setActionModal(null)}>
        <div className="closing-modal-content" style={{ maxWidth: hasFields ? 620 : 500 }} onClick={e => e.stopPropagation()}>
          <div className="closing-modal-header">
            <div className="closing-modal-title">
              <FileText size={20} />
              {popupConf.title || actionModal.column.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="closing-modal-history-btn"
                title="Ver histórico desta obrigação"
                onClick={() => {
                  setAuditTarget({
                    companyId: actionModal.row.company.id,
                    companyName: actionModal.row.company.name,
                    companyCode: actionModal.row.company.code,
                    columnKey: actionModal.key,
                    columnLabel: popupConf.title || actionModal.column.name,
                  });
                }}
              >
                <History size={15} />
                <span>Histórico</span>
              </button>
              <button className="closing-modal-close-btn" onClick={() => setActionModal(null)} aria-label="Fechar modal">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="closing-modal-body">
            <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: 14 }}>
              <strong>{actionModal.row.company.name}</strong> · {monthLabel}
            </p>
            {popupConf.description && <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 12 }}>{popupConf.description}</p>}
            {actionError && <p className="payroll-error" role="alert" style={{ marginBottom: 12 }}>{actionError}</p>}

            {modalMode === 'MAIN' && (
              <>
                {hasFields && (
                  <div className="modal-fields-grid" style={{ marginBottom: 16 }}>
                    {popupConf.fields.map(f => (
                      <div className={`modal-input-group ${f.fullWidth || f.type === 'TEXTAREA' ? 'full-width' : ''}`} key={f.key}>
                        <label>{f.label}{f.required ? ' *' : ''}</label>
                        {f.type === 'TEXTAREA' ? (
                          <textarea
                            rows={3}
                            value={popupCustomForm[f.key] || ''}
                            placeholder={f.placeholder}
                            onChange={e => setPopupCustomForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          />
                        ) : f.type === 'SELECT' ? (
                          <select
                            value={popupCustomForm[f.key] || ''}
                            onChange={e => setPopupCustomForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          >
                            <option value="">Selecione...</option>
                            {f.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input
                            type={f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date' : 'text'}
                            step={f.type === 'NUMBER' ? 'any' : undefined}
                            value={popupCustomForm[f.key] || ''}
                            placeholder={f.placeholder}
                            onChange={e => setPopupCustomForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {hasFields && (
                    <button
                      type="button"
                      className="btn-action-blue-gradient"
                      onClick={handleActionSavePopupFields}
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff' }}
                    >
                      <Check size={16} />
                      SALVAR CAMPOS
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn-action-blue-gradient"
                    onClick={() => setModalMode('DATE')}
                    style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff' }}
                  >
                    <Calendar size={16} />
                    OK - DATA
                  </button>

                  <button
                    type="button"
                    className="btn-action-blue-gradient"
                    onClick={handleActionSemMov}
                    style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', color: '#fff' }}
                  >
                    OK - SEM MOVIMENTO
                  </button>

                  <button
                    type="button"
                    className="btn-action-blue-gradient"
                    onClick={() => setModalMode('PENDENCY')}
                    style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f43f5e 100%)', color: '#fff' }}
                  >
                    <AlertCircle size={16} />
                    PENDÊNCIA
                  </button>

                  <button
                    type="button"
                    className="btn-action-purple-gradient"
                    onClick={handleActionNA}
                    style={{ background: '#475569', color: '#fff' }}
                  >
                    N/A (Não se aplica)
                  </button>

                  <button
                    type="button"
                    className="btn-secondary-light"
                    onClick={handleActionLimpar}
                    style={{ marginTop: 8 }}
                  >
                    LIMPAR / VOLTAR PARA PENDENTE
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
                      placeholder="Ex: Guia nº 1234, Aguardando, etc."
                      value={customTextInput}
                      onChange={e => setCustomTextInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleActionSaveCustom(); }}
                    />
                    <button type="button" className="btn-primary-gradient" onClick={handleActionSaveCustom}>
                      Salvar
                    </button>
                  </div>
                </div>
              </>
            )}

            {modalMode === 'DATE' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 500 }}>
                  Informe a data de conclusão (qualquer data atual ou retroativa):
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
                    aria-label="Selecionar no calendário"
                    className="fiscal-column-text"
                    style={{ width: 42, padding: '8px 6px', cursor: 'pointer' }}
                    value={brToIsoDate(inputDate)}
                    onChange={e => { if (e.target.value) setInputDate(isoToBrDate(e.target.value)); }}
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
                  <button type="button" className="btn-primary-gradient" onClick={handleActionOkData}>
                    Confirmar Conclusão
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
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #475569',
                    background: '#171720',
                    color: '#f1f5f9',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                  placeholder="Ex: Aguardando envio das horas extras pelo cliente..."
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
    );
    })()}
        </div>
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
            sector="DP"
          />
        )}

        {/* Barra Flutuante de Ações em Massa */}
        {selectedCompanyIds.length > 0 && (
          <div className="companies-bulk-bar">
            <div className="bulk-bar-info">
              <CheckCircle2 size={18} color="#60a5fa" />
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
          defaultSector="DP"
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
      </main>
    </div>
  );
}

export function PayrollReinfPreview({ row, definition, monthLabel, onClose }: { row: PayrollRow; definition: PopupConfig; monthLabel: string; onClose: () => void }) {
  return <div className="closing-modal-backdrop" onClick={onClose}><div className="closing-modal-content" onClick={e => e.stopPropagation()}><div className="closing-modal-header"><div className="closing-modal-title purple"><Eye size={20} />{definition.title}</div><button className="closing-modal-close-btn" aria-label="Fechar REINF" onClick={onClose}><X size={20} /></button></div><div className="closing-modal-body"><p className="payroll-reinf-note">Fiscal · somente leitura · {monthLabel}</p><p>{row.company.name}</p>{definition.description && <p>{definition.description}</p>}<div className="modal-fields-grid">{definition.fields.map(field => <div className={`modal-input-group ${field.fullWidth ? 'full-width' : ''}`} key={field.key}><label>{field.label}</label><input readOnly value={String(row.fiscalReinf?.data?.[field.key] ?? '')} placeholder="Sem preenchimento" /></div>)}</div><div className="payroll-reinf-details"><p>Status: <strong>{row.fiscalReinf?.status || 'Pendente'}</strong></p>{row.fiscalReinf?.completionDate && <p>Conclusão: {row.fiscalReinf.completionDate}</p>}{typeof row.fiscalReinf?.sentWithApi === 'boolean' && <p>Envio via API: {row.fiscalReinf.sentWithApi ? 'Sim' : 'Não'}</p>}{row.fiscalReinf?.pendingReason && <p>Pendência: {row.fiscalReinf.pendingReason}</p>}</div><button type="button" className="btn-primary-gradient" onClick={onClose}>Fechar consulta</button></div></div></div>;
}
