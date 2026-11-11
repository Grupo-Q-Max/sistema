import { AllInstallmentsModal } from './AllInstallmentsModal';
import { ClosingProgressDetails } from './ClosingProgressDetails';
import { InstallmentCompanyPicker } from './InstallmentCompanyPicker';
import { InstallmentsModal } from './InstallmentsModal';
import { installmentAccess, canCreateInstallment, installmentHeaders } from '../config/installments';
import { latestOpenPeriod } from '../config/competenceCalendar';
import { useCompetenceCalendar } from './useCompetenceCalendar';
import { useState, useEffect, useMemo, useRef, useDeferredValue } from 'react';
import { Sidebar } from './Sidebar';
import {
  FileCheck,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Copy,
  ExternalLink,
  Building2,
  FileSpreadsheet,
  Calendar,
  CalendarPlus,
  CheckSquare,
  Sparkles,
  Info,
  Send,
  History,
  Zap,
  Users,
  BarChart3,
} from 'lucide-react';
import type { CurrentUser } from '../types/auth';
import { API } from '../api';
import { TableSkeleton, ButtonSpinner } from './LoadingSkeleton';
import './Closings.css';
import './PayrollClosings.css';
import { CompanyDetailsModal, getCertificateStatus, formatCnpj, formatRegimeLabel, formatDateBr } from './CompanyDetailsModal';
import { ResponsibleWorkloadModal } from './ResponsibleWorkloadModal';
import { FiscalFocusDrawer } from './FiscalFocusDrawer';
import { ManualCompetenceModal } from './ManualCompetenceModal';
import { ClosingSectorTabs, hasSectorAccess } from './ClosingSectorTabs';
import { CellAuditModal } from './CellAuditModal';
import { BulkActionModal } from './BulkActionModal';
import { BulkAssignResponsibleModal } from './BulkAssignResponsibleModal';
import { DeadlineTimelineWidget } from './DeadlineTimelineWidget';
import { getColumnDeadlineDay, getDeadlineDate, getDeadlineUrgency } from '../config/legalDeadlines';
import './FiscalPopup.css';
import { visibilitySummary, isColumnComplete } from '../config/columnVisibility';
import { FISCAL_POPUPS, effectivePopup, type PopupAction } from '../config/fiscalPopups';
import { exportToCsv } from '../utils/exportCsv';
import { compareCodes, formatCompanyCode } from '../utils/codeSort';
import { applyFiscalRegimeRules, isFiscalObligationNA, setActiveFiscalRegimeRules } from '../config/fiscalRegimeRules';
import { canUserEditCompany, canUserViewCompany, isUserResponsibleForCompany, companyBelongsToSector } from '../config/companyPermissions';
import { ColumnHeaderFilter, computeColumnFilterOptions, matchColumnFilterValue } from './ColumnHeaderFilter';

function brDateToIso(val: string): string {
  const m = String(val || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function isoDateToBr(val: string): string {
  const m = String(val || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : val;
}

export function getFiscalResponsible(company: any) {
  if (!company || !Array.isArray(company.responsibles)) return null;
  return company.responsibles.find((r: any) => r.sector === 'FISCAL') || null;
}

export function companyBelongsToFiscal(company: any): boolean {
  return companyBelongsToSector(company, 'FISCAL');
}

interface ClosingsProps {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser?: CurrentUser | null;
  onLogout?: () => void;
}

// Utilitário para formatar classe de cor do regime tributário
function getRegimeClass(regime?: string | null) {
  if (!regime) return '';
  if (regime === 'SIMPLES_NACIONAL') return 'simples';
  if (regime.includes('PRESUMIDO')) return 'presumido';
  if (regime.includes('REAL')) return 'real';
  if (regime === 'MEI') return 'mei';
  return '';
}

// Utilitário para calcular status e dias restantes de vencimento do certificado digital

export function Closings({ currentView, onNavigate, currentUser, onLogout }: ClosingsProps) {
  const [progressOpen, setProgressOpen] = useState(false);
  // Popover de filtro do cabeçalho aberto
  const [openHeaderFilter, setOpenHeaderFilter] = useState<string | null>(null);

  // Competência (mês/ano)
  const latestPeriod = useCompetenceCalendar();
  const [selectedYear, setSelectedYear] = useState(() => latestOpenPeriod().getUTCFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => latestOpenPeriod().getUTCMonth() + 1);
  const canGoNext = Date.UTC(selectedYear, selectedMonth - 1, 1) < latestPeriod.getTime();
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [calendarError, setCalendarError] = useState('');
  const [installmentCompany, setInstallmentCompany] = useState<any | null>(null);
  const [installmentCreate, setInstallmentCreate] = useState(false);
  const [allInstallmentsOpen, setAllInstallmentsOpen] = useState(false);
  const [installmentFocus, setInstallmentFocus] = useState<{ id: string; action: 'VIEW' | 'EDIT' } | null>(null);
  const [chooseInstallmentCompany, setChooseInstallmentCompany] = useState(false);
  const [installmentFilter, setInstallmentFilter] = useState('ALL');
  const [installmentSummaries, setInstallmentSummaries] = useState<Record<string, any>>({});
  const [installmentError, setInstallmentError] = useState('');
  const viewInstallments = installmentAccess(currentUser);
  const canViewFiscal = hasSectorAccess(currentUser, 'FISCAL', false);
  const canEditFiscal = hasSectorAccess(currentUser, 'FISCAL', true);
  const isPrivileged = currentUser?.role === 'ADMIN' || currentUser?.role === 'SOCIO';
  const [onlyMyCompanies, setOnlyMyCompanies] = useState(false);

  const isRowEditable = (row: any) => {
    if (!canEditFiscal) return false;
    if (isPrivileged) return true;
    return canUserEditCompany(currentUser, row?.company, 'FISCAL');
  };
  async function loadInstallmentSummaries(companies: any[], requestId = fetchSequence.current) {
    if (!viewInstallments) return;
    setInstallmentError('');
    try { const response = await fetch(`${API}/api/installments/summary?year=${selectedYear}&month=${selectedMonth}`, { method: 'POST', headers: installmentHeaders(currentUser), body: JSON.stringify({ companyIds: companies.map(row => row.company.id) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível consultar parcelamentos.'); if (requestId === fetchSequence.current) setInstallmentSummaries(data.summaries || {}); }
    catch (cause) { if (requestId === fetchSequence.current) setInstallmentError(cause instanceof Error ? cause.message : 'Erro nos parcelamentos.'); }
  }


  const fetchSequence = useRef(0);
  const tableScroll = useRef<HTMLDivElement>(null);
  const upperScroll = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [fiscalUsers, setFiscalUsers] = useState<any[]>([]);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [regimeFilter, setRegimeFilter] = useState('ALL');
  const [responsibleFilter, setResponsibleFilter] = useState('ALL');
  const [certFilter, setCertFilter] = useState('ALL');
  const [cityFilter, setCityFilter] = useState('ALL');
  const [workloadOpen, setWorkloadOpen] = useState(false);
  const [focusModeIndex, setFocusModeIndex] = useState<number | null>(null);

  // Senhas reveladas

  // Modais
  const [activeModal, setActiveModal] = useState<{
    type: 'POPUP' | 'COMPANY_INFO' | 'CARNE_LEAO' | 'REINF' | 'IMPOSTOS' | 'ISS' | 'MIT' | 'SPED_FISCAL' | 'SPED_CONTRIBUICAO' | 'DESTDA' | 'NOTES';
    row: any;
    colKey?: string;
  } | null>(null);

  // Trilha de Auditoria na Célula
  const [auditTarget, setAuditTarget] = useState<{
    companyId: string;
    companyName: string;
    companyCode?: string | null;
    columnKey: string;
    columnLabel: string;
  } | null>(null);

  // Sub-modais (Perguntas de API, Data e Motivo de Pendência)
  const [apiPrompt, setApiPrompt] = useState<{
    show: boolean;
    colKey: string;
    actionType: 'SEM_MOV' | 'OK_DATA' | 'SALVAR';
    pendingData?: any;
  } | null>(null);

  const [datePrompt, setDatePrompt] = useState<{
    show: boolean;
    colKey: string;
    sentWithApi?: boolean;
    formData?: any;
  } | null>(null);

  const [pendencyPrompt, setPendencyPrompt] = useState<{
    show: boolean;
    colKey: string;
    reason: string;
  } | null>(null);

  const [inputDateValue, setInputDateValue] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  // Densidade da tabela (Padrão vs Compacto)
  const [tableDensity, setTableDensity] = useState<'standard' | 'compact'>(() => {
    try {
      return (localStorage.getItem('fechamento_density') as 'standard' | 'compact') || 'standard';
    } catch {
      return 'standard';
    }
  });

  const toggleDensity = () => {
    setTableDensity((prev) => {
      const next = prev === 'standard' ? 'compact' : 'standard';
      try {
        localStorage.setItem('fechamento_density', next);
      } catch {}
      return next;
    });
  };
  const [multiSelectModal, setMultiSelectModal] = useState<{
    row: any;
    colKey: string;
    definition: any;
    selected: string[];
  } | null>(null);

  const handleOpenMultiSelectModal = (row: any, colKey: string, definition: any) => {
    const rawVal = row.columnsData?.[colKey];
    const initialSelected: string[] = Array.isArray(rawVal)
      ? [...rawVal]
      : typeof rawVal === 'string' && rawVal
      ? rawVal.split(',').map((s: string) => s.trim())
      : [];
    setMultiSelectModal({
      row,
      colKey,
      definition,
      selected: initialSelected,
    });
  };

  const toggleMultiSelectOption = (option: string) => {
    if (!multiSelectModal) return;
    const current = multiSelectModal.selected;
    const updated = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    setMultiSelectModal({ ...multiSelectModal, selected: updated });
  };

  const [popupColumns, setPopupColumns] = useState<any[]>(Object.entries(FISCAL_POPUPS).map(([columnKey, config]) => ({ columnKey, name: config.title.replace('Detalhes ', ''), isEditable: true, countsProgress: true })));
  const [popupForm, setPopupForm] = useState<Record<string, string>>({});
  const activePopupColumn = popupColumns.find(col => col.columnKey === activeModal?.colKey);
  const activePopupConfig = effectivePopup(activePopupColumn, activeModal?.colKey || '');
  const canEditPopup = Boolean(activeModal?.row && isRowEditable(activeModal.row) && activePopupColumn?.isEditable !== false);

  const [notesText, setNotesText] = useState('');

  // Busca dados de fechamento
  const fetchClosings = async () => {
    const requestId = ++fetchSequence.current;
    setLoading(true);
    setCalendarError('');
    try {
      const res = await fetch(`${API}/api/closings?sector=FISCAL&year=${selectedYear}&month=${selectedMonth}`);
      if (res.ok) {
        const data = await res.json();
        if (requestId !== fetchSequence.current) return;
        if (data.fiscalRegimeRules) setActiveFiscalRegimeRules(data.fiscalRegimeRules);
        const normalizedRows = (data.rows || []).map((r: any) => ({
          ...r,
          columnsData: applyFiscalRegimeRules(r.company?.taxRegime, r.columnsData || {}),
        }));
        setRows(normalizedRows);
        setSelectedClosingIds(new Set());
        if (viewInstallments) void loadInstallmentSummaries(normalizedRows, requestId);
        if (Array.isArray(data.popupColumns)) setPopupColumns(data.popupColumns);
        setFiscalUsers(data.fiscalUsers || []);
      } else {
        const data = await res.json();
        if (requestId !== fetchSequence.current) return;
        setRows([]); setCalendarError(data.error || 'Não foi possível carregar esta competência.');
      }
    } catch (err) {
      setCalendarError('Não foi possível conectar à API.');
      console.error('Erro ao buscar fechamentos:', err);
    } finally {
      if (requestId === fetchSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    closeAllModals(); setProgressOpen(false);
    setInstallmentCompany(null); setInstallmentSummaries({}); setAllInstallmentsOpen(false); setInstallmentFocus(null);
    fetchClosings();
    return () => { fetchSequence.current++; };
  }, [selectedYear, selectedMonth]);

  // Atualização em tempo real via SSE (Server-Sent Events)
  useEffect(() => {
    const handleRealtime = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (detail.type === 'CLOSING_UPDATED' && detail.payload?.sector === 'FISCAL') {
        const p = detail.payload;
        setRows((prev) =>
          prev.map((r) => {
            if (r.closingId === p.closingId) {
              return {
                ...r,
                columnsData: applyFiscalRegimeRules(r.company?.taxRegime, p.columnsData || {}),
                calculatedStatus: p.calculatedStatus ?? r.calculatedStatus,
                progressPercent: p.progress?.progressPercent ?? r.progressPercent,
              };
            }
            return r;
          })
        );
      } else if (detail.type === 'CLOSINGS_BULK_UPDATED') {
        const items = detail.payload?.items || [];
        const itemMap = new Map(items.map((it: any) => [it.id, it]));
        setRows((prev) =>
          prev.map((r) => {
            const it = itemMap.get(r.closingId) as any;
            if (it) {
              return {
                ...r,
                columnsData: applyFiscalRegimeRules(r.company?.taxRegime, it.columnsData || {}),
                calculatedStatus: it.calculatedStatus ?? r.calculatedStatus,
                progressPercent: it.progressPercent ?? r.progressPercent,
              };
            }
            return r;
          })
        );
      } else if (detail.type === 'COMPANY_UPDATED' || detail.type === 'COMPANY_DELETED' || detail.type === 'COMPANY_RESTORED' || detail.type === 'COLUMNS_CHANGED') {
        fetchClosings();
      }
    };
    window.addEventListener('app-realtime-update', handleRealtime);
    return () => window.removeEventListener('app-realtime-update', handleRealtime);
  }, []);

  useEffect(() => {
    if (!viewInstallments || !rows.length || installmentCompany) return;
    const timer = window.setInterval(() => { void loadInstallmentSummaries(rows); }, 60_000);
    return () => window.clearInterval(timer);
  }, [viewInstallments, rows, selectedYear, selectedMonth, installmentCompany]);

  useEffect(() => {
    const table = tableScroll.current?.querySelector('table');
    if (!table) return;
    const update = () => setScrollWidth(table.scrollWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(table);
    return () => observer.disconnect();
  }, [loading, popupColumns.length, viewInstallments]);

  const syncScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || syncingScroll.current) return;
    syncingScroll.current = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  };

  // Fecha popover de filtro ao clicar fora ou pressionar ESC
  useEffect(() => {
    const handleGlobalClick = () => {
      setOpenHeaderFilter(null);
    };
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenHeaderFilter(null);
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Manipulação de Mês
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const monthLabel = useMemo(() => {
    const d = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1));
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }, [selectedYear, selectedMonth]);

  // Alterar responsável direto na linha
  const handleResponsibleChange = async (companyId: string, userId: string) => {
    if (!canEditFiscal) return;
    try {
      const res = await fetch(`${API}/api/companies/${companyId}/responsible`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({
          userId,
          sector: 'FISCAL',
          actorId: currentUser?.id,
          actorEmail: currentUser?.email,
          actorName: currentUser?.name || currentUser?.email,
        }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => {
            if (r.company.id === companyId) {
              const selectedUser = fiscalUsers.find((u) => u.id === userId);
              const otherResponsibles = (r.company.responsibles || []).filter((resp: any) => resp.sector !== 'FISCAL' && resp.sector !== null);
              const updatedResp = [
                ...otherResponsibles,
                ...(userId ? [{ id: 'temp', companyId, userId, sector: 'FISCAL', user: selectedUser }] : []),
              ];
              return {
                ...r,
                company: {
                  ...r.company,
                  responsibles: updatedResp,
                },
              };
            }
            return r;
          })
        );
      }
    } catch (err) {
      console.error('Erro ao atualizar responsável:', err);
    }
  };

  // Copiar para clipboard com feedback
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    const alertBox = document.createElement('div');
    alertBox.innerText = `${label} copiado!`;
    alertBox.style.position = 'fixed';
    alertBox.style.bottom = '24px';
    alertBox.style.right = '24px';
    alertBox.style.background = '#4f46e5';
    alertBox.style.color = '#fff';
    alertBox.style.padding = '8px 16px';
    alertBox.style.borderRadius = '8px';
    alertBox.style.zIndex = '9999';
    alertBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    alertBox.style.fontSize = '13px';
    document.body.appendChild(alertBox);
    setTimeout(() => alertBox.remove(), 2000);
  };

  const handleCopyAllCnpjs = async () => {
    const cnpjs = filteredRows.map((r: any) => r.company?.cnpj).filter(Boolean);
    if (!cnpjs.length) {
      handleCopy('', 'Nenhum CNPJ encontrado');
      return;
    }
    const cleanList = cnpjs.map((c: string) => c.replace(/\D/g, '')).join('\n');
    try {
      await navigator.clipboard.writeText(cleanList);
      handleCopy(cleanList, `${cnpjs.length} CNPJs`);
    } catch {
      window.alert('Não foi possível copiar os CNPJs.');
    }
  };


  // Abertura de Modais de Obrigações
  const handleOpenObligationModal = (row: any, colKey: string) => {
    const column = popupColumns.find(col => col.columnKey === colKey);
    const config = effectivePopup(column, colKey);
    const existingData = row.columnsData?.[colKey]?.data || {};
    setPopupForm(Object.fromEntries(config.fields.map(f => [f.key, String(existingData[f.key] ?? '')])));
    setActiveModal({ type: 'POPUP', row, colKey });
  };

  // Salva coluna via API
  const saveColumnValue = async (closingId: string, colKey: string, payload: any) => {
    if (!canEditFiscal) return;
    setSavingAction(true);
    try {
      const res = await fetch(`${API}/api/closings/${closingId}/column`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({
          columnKey: colKey,
          columnValue: payload,
          userId: currentUser?.id,
          userName: currentUser?.name,
          userEmail: currentUser?.email
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRows((prev) =>
          prev.map((r) => {
            if (r.closingId === closingId) {
              return {
                ...r,
                columnsData: applyFiscalRegimeRules(r.company?.taxRegime, data.closing.columnsData || {}),
                calculatedStatus: data.calculatedStatus,
                progressPercent: data.progressPercent,
              };
            }
            return r;
          })
        );
        closeAllModals();
      } else {
        const error = await res.json();
        window.alert(error.error || 'Erro ao salvar a obrigação.');
      }
    } catch (err) {
      console.error('Erro ao salvar coluna:', err);
    } finally {
      setSavingAction(false);
    }
  };

  const closeAllModals = () => {
    setActiveModal(null);
    setApiPrompt(null);
    setDatePrompt(null);
    setPendencyPrompt(null);
    setInputDateValue('');
  };

  // Botões de Ações

  const handleActionNA = () => {
    if (!activeModal || !activeModal.colKey) return;
    saveColumnValue(activeModal.row.closingId, activeModal.colKey, {
      status: 'N/A',
      label: 'N/A',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleActionSemMovimento = () => {
    if (!activeModal?.colKey || !canEditPopup) return;
    const colKey = activeModal.colKey;
    if (activePopupConfig.askApiOnNoMovement) {
      setApiPrompt({ show: true, colKey, actionType: 'SEM_MOV' }); return;
    }
    saveColumnValue(activeModal.row.closingId, colKey, { status: 'OK - SEM MOVIMENTO', label: 'OK - S/ MOV', updatedAt: new Date().toISOString() });
  };

  const finishPopup = (colKey: string, formData?: any, sentWithApi?: boolean) => {
    const todayBr = new Date().toLocaleDateString('pt-BR');
    const existingRaw = activeModal?.row?.columnsData?.[colKey]?.completionDate;
    const prefillDate = existingRaw && formatDateBr(existingRaw) !== '-' ? formatDateBr(existingRaw) : todayBr;
    if (activePopupConfig.askDate) {
      setInputDateValue(prefillDate); setDatePrompt({ show: true, colKey, formData, sentWithApi }); return;
    }
    if (!activeModal) return;
    saveColumnValue(activeModal.row.closingId, colKey, { status: 'CONCLUIDO', label: todayBr, completionDate: todayBr, data: formData, sentWithApi, updatedAt: new Date().toISOString() });
  };

  const handleActionOkData = () => {
    if (!activeModal?.colKey || !canEditPopup) return;
    const colKey = activeModal.colKey;
    if (activePopupConfig.askApiOnSave) {
      setApiPrompt({ show: true, colKey, actionType: 'OK_DATA' }); return;
    }
    finishPopup(colKey);
  };

  const handleActionPendencia = () => {
    if (!activeModal || !activeModal.colKey) return;
    const existingReason = activeModal.row.columnsData?.[activeModal.colKey]?.pendingReason || '';
    setPendencyPrompt({
      show: true,
      colKey: activeModal.colKey,
      reason: existingReason,
    });
  };

  const handleConfirmPendency = () => {
    if (!activeModal || !pendencyPrompt) return;
    saveColumnValue(activeModal.row.closingId, pendencyPrompt.colKey, {
      status: 'PENDENCIA',
      label: 'PENDÊNCIA',
      pendingReason: pendencyPrompt.reason,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleActionLimpar = () => {
    if (!activeModal || !activeModal.colKey) return;
    saveColumnValue(activeModal.row.closingId, activeModal.colKey, null);
  };

  const handleActionSalvar = () => {
    if (!activeModal?.colKey || !canEditPopup) return;
    const colKey = activeModal.colKey;
    const formData = { ...(activeModal.row.columnsData?.[colKey]?.data || {}), ...popupForm };
    if (activePopupConfig.askApiOnSave) {
      setApiPrompt({ show: true, colKey, actionType: 'SALVAR', pendingData: formData }); return;
    }
    finishPopup(colKey, formData);
  };

  const handleConfirmApi = (sentWithApi: boolean) => {
    if (!activeModal || !apiPrompt) return;
    const { colKey, actionType, pendingData } = apiPrompt;

    if (actionType === 'SEM_MOV') {
      saveColumnValue(activeModal.row.closingId, colKey, {
        status: 'OK - SEM MOVIMENTO',
        label: 'OK - S/ MOV',
        sentWithApi,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    if (actionType === 'OK_DATA' || actionType === 'SALVAR') {
      setApiPrompt(null);
      finishPopup(colKey, pendingData, sentWithApi);
    }
  };

  const handleConfirmDate = () => {
    if (!activeModal || !datePrompt) return;
    const { colKey, sentWithApi, formData } = datePrompt;
    const normalizedDate = isoDateToBr(inputDateValue.trim()) || new Date().toLocaleDateString('pt-BR');

    saveColumnValue(activeModal.row.closingId, colKey, {
      status: 'CONCLUIDO',
      label: normalizedDate,
      completionDate: normalizedDate,
      sentWithApi: sentWithApi !== undefined ? sentWithApi : undefined,
      data: formData || undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSaveNotes = async () => {
    if (!activeModal || !isRowEditable(activeModal.row)) return;
    try {
      const res = await fetch(`${API}/api/companies/${activeModal.row.company.id}/notes`, {
        method: 'PUT',
        headers: installmentHeaders(currentUser),
        body: JSON.stringify({ notes: notesText, notesScope: 'FISCAL' }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) => {
            if (r.company.id === activeModal.row.company.id) {
              return {
                ...r,
                company: {
                  ...r.company,
                  notes: notesText,
                },
              };
            }
            return r;
          })
        );
        closeAllModals();
      }
    } catch (err) {
      console.error('Erro ao salvar notas:', err);
    }
  };

  // Ordenação e Filtros de Coluna
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'code', direction: 'asc' });
  const [obligationFilters, setObligationFilters] = useState<Record<string, string>>({});

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleObligationFilterChange = (colKey: string, statusVal: string) => {
    setObligationFilters((prev) => ({
      ...prev,
      [colKey]: statusVal,
    }));
  };

  // Filtros e Ordenação aplicados na lista
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const scopedRows = useMemo(() => rows.filter(row => {
    if (!companyBelongsToFiscal(row.company)) return false;
    if (onlyMyCompanies) return isUserResponsibleForCompany(currentUser, row.company, 'FISCAL');
    if (!currentUser || isPrivileged) return true;
    return canUserViewCompany(currentUser, row.company, 'FISCAL');
  }), [rows, currentUser, onlyMyCompanies, isPrivileged]);

  const summary = useMemo(() => {
    const total = scopedRows.length;
    let completed = 0;
    let inProgress = 0;
    let pending = 0;
    let percentSum = 0;
    for (const r of scopedRows) {
      if (r.calculatedStatus === 'COMPLETED') completed++;
      else if (r.calculatedStatus === 'IN_PROGRESS') inProgress++;
      else pending++;
      percentSum += r.progressPercent || 0;
    }
    return {
      total,
      completed,
      inProgress,
      pending,
      overallPercent: total > 0 ? Math.round(percentSum / total) : 0
    };
  }, [scopedRows]);

  const distinctCities = useMemo(() => {
    const set = new Set<string>();
    for (const r of scopedRows) {
      const city = r.company?.city?.trim();
      if (city) set.add(city);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [scopedRows]);

  const filteredRows = useMemo(() => {
    const list = scopedRows.filter((r) => {
      const c = r.company;
      const search = deferredSearchTerm.toLowerCase();

      const formattedCode = formatCompanyCode(c.code);
      const matchSearch =
        !deferredSearchTerm ||
        (c.code && c.code.toLowerCase().includes(search)) ||
        (formattedCode && formattedCode.toLowerCase().includes(search)) ||
        c.name.toLowerCase().includes(search) ||
        (c.tradeName && c.tradeName.toLowerCase().includes(search)) ||
        c.cnpj.includes(search) ||
        (c.groupName && c.groupName.toLowerCase().includes(search)) ||
        (c.city && c.city.toLowerCase().includes(search));

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'COMPLETED' && r.calculatedStatus === 'COMPLETED') ||
        (statusFilter === 'IN_PROGRESS' && r.calculatedStatus === 'IN_PROGRESS') ||
        (statusFilter === 'PENDING' && r.calculatedStatus === 'PENDING');

      const matchRegime = regimeFilter === 'ALL' || c.taxRegime === regimeFilter;

      const fiscalResp = getFiscalResponsible(c);
      const respId = fiscalResp?.userId || fiscalResp?.user?.id || '';
      const matchResponsible = responsibleFilter === 'ALL' || respId === responsibleFilter;

      // Filtros individuais por obrigação do cabeçalho
      for (const [obCol, obStatus] of Object.entries(obligationFilters)) {
        if (!obStatus || obStatus === 'ALL') continue;
        const definition = popupColumns.find(col => col.columnKey === obCol);
        if (!definition) continue;
        const value = r.columnsData?.[obCol];
        let valStr = '';
        if (!value) {
          valStr = isFiscalObligationNA(r.company?.taxRegime, obCol) ? 'N/A' : '';
        } else if (['TEXT', 'CHECKBOX', 'NUMBER', 'TEXTAREA', 'PASSWORD', 'SELECT', 'MULTISELECT'].includes(definition.inputType)) {
          valStr = isColumnComplete(definition, value) ? 'Concluído' : 'Pendente';
        } else if (typeof value === 'object') {
          valStr = value.label || value.status || '';
        } else {
          valStr = String(value);
        }
        if (!matchColumnFilterValue(valStr, obStatus)) return false;
      }

      const situation = installmentSummaries[c.id];
      const matchInstallment = !viewInstallments || installmentFilter === 'ALL' || (installmentFilter === 'HAS_PLAN' ? situation && situation.status !== 'NA' : situation?.status === installmentFilter);

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

      const matchCity =
        cityFilter === 'ALL'
          ? true
          : cityFilter === 'NONE'
            ? !c.city?.trim()
            : c.city?.trim() === cityFilter;

      return matchSearch && matchStatus && matchRegime && matchResponsible && matchInstallment && matchCert && matchCity;
    });

    // Ordenação
    list.sort((a, b) => {
      if (sortConfig.key === 'code') {
        return compareCodes(a.company.code, b.company.code, sortConfig.direction === 'asc');
      }

      let valA: any = '';
      let valB: any = '';

      if (sortConfig.key === 'name') {
        valA = a.company.name || '';
        valB = b.company.name || '';
      } else if (sortConfig.key === 'regime') {
        valA = a.company.taxRegime || '';
        valB = b.company.taxRegime || '';
      } else if (sortConfig.key === 'status') {
        valA = a.calculatedStatus || '';
        valB = b.calculatedStatus || '';
      } else if (sortConfig.key === 'responsible') {
        const respA = getFiscalResponsible(a.company);
        const respB = getFiscalResponsible(b.company);
        valA = respA?.user?.name || respA?.user?.email || '';
        valB = respB?.user?.name || respB?.user?.email || '';
      }

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [scopedRows, deferredSearchTerm, statusFilter, regimeFilter, responsibleFilter, certFilter, cityFilter, obligationFilters, sortConfig, popupColumns, installmentFilter, installmentSummaries, viewInstallments]);

  // Ações em Massa (Bulk Actions)
  const [selectedClosingIds, setSelectedClosingIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  const editableFilteredRows = useMemo(() => {
    return filteredRows.filter(r => isRowEditable(r));
  }, [filteredRows]);

  const allFilteredSelected = editableFilteredRows.length > 0 && editableFilteredRows.every(r => selectedClosingIds.has(r.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedClosingIds(new Set());
    } else {
      setSelectedClosingIds(new Set(editableFilteredRows.map(r => r.id)));
    }
  };

  const handleToggleSelectRow = (closingId: string) => {
    setSelectedClosingIds(prev => {
      const next = new Set(prev);
      if (next.has(closingId)) next.delete(closingId);
      else next.add(closingId);
      return next;
    });
  };

  const selectedRowsList = useMemo(() => {
    return rows.filter(r => selectedClosingIds.has(r.id));
  }, [rows, selectedClosingIds]);

  const handleBulkSuccess = (updatedResults: any[], message: string) => {
    if (Array.isArray(updatedResults) && updatedResults.length > 0) {
      const byId = new Map(updatedResults.map(u => [u.id, u]));
      setRows(prevRows => prevRows.map(row => {
        const upd = byId.get(row.id);
        if (!upd) return row;
        return {
          ...row,
          columnsData: applyFiscalRegimeRules(row.company?.taxRegime, upd.columnsData || {}),
          calculatedStatus: upd.calculatedStatus,
          progressPercent: upd.progressPercent,
          completedCount: upd.completedCount,
          totalProgressCount: upd.totalProgressCount,
        };
      }));
    }
    setSelectedClosingIds(new Set());
    setBulkFeedback(message);
    setTimeout(() => setBulkFeedback(null), 5000);
  };

  const handleFilterColumnPending = (columnKey: string) => {
    handleObligationFilterChange(columnKey, 'PENDENTE');
  };

  const renderObligationCell = (row: any, colKey: string) => {
    const val = row.columnsData?.[colKey];
    const definition = popupColumns.find(col => col.columnKey === colKey);
    const rowEditable = isRowEditable(row);
    const readOnly = !rowEditable || definition?.isEditable === false;
    if (definition?.inputType === 'TEXT' || definition?.inputType === 'NUMBER' || definition?.inputType === 'PASSWORD' || definition?.inputType === 'TEXTAREA') {
      const text = typeof val === 'string' || typeof val === 'number' ? String(val) : '';
      const htmlType = definition.inputType === 'NUMBER' ? 'number' : definition.inputType === 'PASSWORD' ? 'password' : 'text';
      return <input className="fiscal-column-text" aria-label={definition.name} key={`${row.closingId}_${colKey}_${text}`} type={htmlType} placeholder={definition.fieldConfig?.placeholder || ''} title={definition.inputType === 'TEXTAREA' ? text : undefined} defaultValue={text} disabled={readOnly || savingAction} onBlur={e => { if (e.target.value !== text) saveColumnValue(row.closingId, colKey, definition.inputType === 'NUMBER' && e.target.value !== '' ? Number(e.target.value) : e.target.value); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
    }
    if (definition?.inputType === 'SELECT') {
      const current = typeof val === 'string' ? val : '';
      const options: string[] = Array.isArray(definition.fieldConfig?.options) ? definition.fieldConfig.options : [];
      const pendingOpts: string[] = Array.isArray(definition.fieldConfig?.pendingOptions) ? definition.fieldConfig.pendingOptions : [];
      const isPending = !current || pendingOpts.includes(current);
      return (
        <select
          className={`table-user-select ${isPending ? 'select-pending' : 'select-done'}`}
          aria-label={definition.name}
          value={current}
          disabled={readOnly || savingAction}
          onChange={e => saveColumnValue(row.closingId, colKey, e.target.value || null)}
          style={{ minWidth: 110, borderColor: isPending ? 'rgba(245,158,11,0.5)' : 'rgba(16,185,129,0.5)' }}
        >
          <option value="">{definition.fieldConfig?.placeholder || 'Selecione...'}</option>
          {(current && !options.includes(current) ? [current, ...options] : options).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    }
    if (definition?.inputType === 'CHECKBOX') {
      return <input type="checkbox" aria-label={definition.name} checked={val === true} disabled={readOnly || savingAction} onChange={e => saveColumnValue(row.closingId, colKey, e.target.checked)} />;
    }
    if (definition?.inputType === 'MULTISELECT') {
      const selected: string[] = Array.isArray(val)
        ? val
        : typeof val === 'string' && val
        ? val.split(',').map((s: string) => s.trim())
        : [];
      const count = selected.length;
      return (
        <button
          type="button"
          className={`obligation-btn ${count > 0 ? 'ok-data' : 'pendente'}`}
          style={{
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 8px',
          }}
          disabled={readOnly || savingAction}
          onClick={() => handleOpenMultiSelectModal(row, colKey, definition)}
          title={!rowEditable ? 'Você só pode editar empresas sob sua responsabilidade' : (count > 0 ? selected.join(', ') : 'Clique para selecionar os tipos de NF')}
        >
          {count === 0 ? '+ Tipos NF' : (count <= 2 ? selected.join(', ') : `${selected.slice(0, 2).join(', ')} (+${count - 2})`)}
        </button>
      );
    }

    if (!val) {
      if (isFiscalObligationNA(row.company?.taxRegime, colKey)) {
        return (
          <button
            className="obligation-btn na"
            disabled={readOnly || savingAction}
            onClick={() => handleOpenObligationModal(row, colKey)}
            title={!rowEditable ? 'Você só pode editar empresas sob sua responsabilidade' : 'Isento / Dispensado por regra do regime tributário (N/A)'}
          >
            N/A
          </button>
        );
      }
      return (
        <button
          className="obligation-btn pendente"
          disabled={readOnly || savingAction}
          onClick={() => handleOpenObligationModal(row, colKey)}
          title={!rowEditable ? 'Você só pode editar empresas sob sua responsabilidade' : 'Clique para preencher ou alterar status'}
        >
          Pendente
        </button>
      );
    }

    const st = val.status;
    let cls = 'pendente';
    let text = val.label || 'Pendente';

    if (st === 'N/A') {
      cls = 'na';
      text = 'N/A';
    } else if (st === 'SEM_MOVIMENTO' || st === 'OK - SEM MOVIMENTO') {
      cls = 'sem-mov';
      text = val.sentWithApi ? 'S/ MOV (API)' : 'OK - S/ MOV';
    } else if (st === 'CONCLUIDO' || st === 'OK - DATA') {
      cls = 'ok-data';
      text = (val.completionDate ? formatDateBr(val.completionDate) : null) || val.label || 'OK';
      if (val.sentWithApi) text += ' (API)';
    } else if (st === 'PENDENCIA') {
      cls = 'pendencia';
      text = 'PENDÊNCIA';
    }

    return (
      <button
        className={`obligation-btn ${cls}`}
        disabled={readOnly || savingAction}
        onClick={() => handleOpenObligationModal(row, colKey)}
        title={!rowEditable ? 'Você só pode editar empresas sob sua responsabilidade' : (val.pendingReason ? `Motivo: ${val.pendingReason}` : text)}
      >
        {text}
      </button>
    );
  };

  const handleExport = () => {
    const columns = [
      { header: 'Código', key: 'code' },
      { header: 'Empresa', key: 'name' },
      { header: 'CNPJ', key: 'cnpj' },
      { header: 'Tributação', key: 'taxRegime' },
      { header: 'Status Geral', key: 'status' },
      { header: 'Responsável', key: 'responsible' },
      ...popupColumns.map(c => ({ header: c.name, key: c.columnKey }))
    ];

    const data = filteredRows.map(c => {
      const fiscalResp = getFiscalResponsible(c.company);
      const currentRespId = fiscalResp?.userId || fiscalResp?.user?.id || '';
      const respUser = fiscalResp?.user || fiscalUsers.find((u) => u.id === currentRespId);
      const respName = (respUser?.name || respUser?.email || 'Não atribuído').replace(/\s*\(Inativo\)$/i, '');

      const row: any = {
        code: formatCompanyCode(c.company.code),
        name: c.company.name || '',
        cnpj: formatCnpj(c.company.cnpj) || '',
        taxRegime: formatRegimeLabel(c.company.taxRegime),
        status: c.calculatedStatus === 'COMPLETED' ? 'Concluído' : c.calculatedStatus === 'IN_PROGRESS' ? 'Em Andamento' : 'Pendente',
        responsible: respName
      };

      popupColumns.forEach(col => {
        const val = c.columnsData?.[col.columnKey];
        if (col.inputType === 'TEXT' || col.inputType === 'NUMBER' || col.inputType === 'TEXTAREA' || col.inputType === 'SELECT') {
          row[col.columnKey] = val ?? '';
        } else if (col.inputType === 'PASSWORD') {
          row[col.columnKey] = val ? '••••' : '';
        } else if (col.inputType === 'CHECKBOX') {
          row[col.columnKey] = val ? 'Sim' : 'Não';
        } else if (col.inputType === 'MULTISELECT') {
          row[col.columnKey] = Array.isArray(val) ? val.join(', ') : (val || '');
        } else if (!val && isFiscalObligationNA(c.company?.taxRegime, col.columnKey)) {
          row[col.columnKey] = 'N/A';
        } else if (val?.status === 'CONCLUIDO' || val?.status === 'OK - DATA') {
          const dt = (val.completionDate ? formatDateBr(val.completionDate) : null) || val.label || 'OK';
          row[col.columnKey] = val.sentWithApi ? `${dt} (API)` : dt;
        } else if (val?.status === 'N/A') {
          row[col.columnKey] = 'N/A';
        } else if (val?.status === 'SEM_MOVIMENTO' || val?.status === 'OK - SEM MOVIMENTO') {
          row[col.columnKey] = val.sentWithApi ? 'S/ MOV (API)' : 'OK - S/ MOV';
        } else if (val?.status === 'PENDENCIA') {
          row[col.columnKey] = val.pendingReason ? `PENDÊNCIA (${val.pendingReason})` : 'PENDÊNCIA';
        } else {
          row[col.columnKey] = val?.label || val?.status || 'Pendente';
        }
      });

      return row;
    });

    const mesStr = String(selectedMonth).padStart(2, '0') + '-' + selectedYear;
    exportToCsv(`fechamento_fiscal_${mesStr}`, columns, data);
  };


  return (
    <div className="crm-dashboard">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <main className="crm-main">
        <div className="closings-container">
          {/* Top Bar Header */}
          <div className="closings-header">
            <div className="closings-header-titles">
              <h1>
                <FileCheck size={28} color="#818cf8" />
                Fechamento Fiscal
              </h1>
              <p>Gerenciamento e automação das obrigações fiscais da competência</p>
            </div>

            <div className="closings-header-actions">
              <ClosingSectorTabs sector="FISCAL" currentUser={currentUser} onNavigate={onNavigate} />
              {/* Seletor de Mês / Competência */}
              <div className="month-selector-box">
                <button className="month-nav-btn" onClick={handlePrevMonth} title="Mês Anterior">
                  <ChevronLeft size={20} />
                </button>
                <div className="month-display-text">{monthLabel}</div>
                <button className="month-nav-btn" onClick={handleNextMonth} disabled={!canGoNext} title={canGoNext ? "Próximo Mês" : "A próxima competência abre automaticamente na virada do mês"}>
                  <ChevronRight size={20} />
                </button>
              </div>

              <button
                type="button"
                className="btn-secondary-light manual-comp-btn"
                onClick={() => setIsManualModalOpen(true)}
                title="Abrir uma nova competência manualmente"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px', fontWeight: 600, fontSize: '13px' }}
              >
                <CalendarPlus size={16} color="var(--accent, #6366f1)" />
                <span>Nova Competência</span>
              </button>
            </div>
          </div>

          <p style={{ color: '#94a3b8', fontSize: '0.78rem' }}>A competência do mês anterior abre automaticamente na virada do mês, no horário de Brasília.</p>
          {installmentError && <p role="alert" style={{ color: '#fda4af', fontSize: '.8rem' }}>Parcelamentos: {installmentError}</p>}
          {calendarError && <p role="alert" style={{ color: '#fda4af' }}>{calendarError}</p>}
          {!canViewFiscal ? (
            <div style={{ marginTop: 24, padding: '20px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
              Você não tem permissão para acessar o fechamento Fiscal.
            </div>
          ) : (
            <>
          {/* Cards de Métricas */}
          <div className="closings-stats-grid">
            <div
              className="closing-stat-card stat-clickable"
              role="button"
              tabIndex={0}
              title="Clique para mostrar todas as empresas"
              onClick={() => setStatusFilter('ALL')}
              onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); setStatusFilter('ALL'); } }}
            >
              <div className="closing-stat-icon total">
                <Building2 size={22} />
              </div>
              <div className="closing-stat-info">
                <span>Total Empresas</span>
                <strong>{summary.total}</strong>
              </div>
            </div>

            <div
              className={`closing-stat-card stat-clickable ${statusFilter === 'COMPLETED' ? 'stat-active completed' : ''}`}
              role="button"
              tabIndex={0}
              title="Clique para filtrar apenas empresas concluídas"
              onClick={() => setStatusFilter(prev => prev === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
              onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); setStatusFilter(prev => prev === 'COMPLETED' ? 'ALL' : 'COMPLETED'); } }}
            >
              <div className="closing-stat-icon completed">
                <CheckCircle2 size={22} />
              </div>
              <div className="closing-stat-info">
                <span>Concluídos</span>
                <strong>{summary.completed}</strong>
              </div>
            </div>

            <div
              className={`closing-stat-card stat-clickable ${statusFilter === 'IN_PROGRESS' ? 'stat-active in-progress' : ''}`}
              role="button"
              tabIndex={0}
              title="Clique para filtrar apenas empresas em andamento"
              onClick={() => setStatusFilter(prev => prev === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
              onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); setStatusFilter(prev => prev === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS'); } }}
            >
              <div className="closing-stat-icon in-progress">
                <Clock size={22} />
              </div>
              <div className="closing-stat-info">
                <span>Em Andamento</span>
                <strong>{summary.inProgress}</strong>
              </div>
            </div>

            <div
              className={`closing-stat-card stat-clickable ${statusFilter === 'PENDING' ? 'stat-active pending' : ''}`}
              role="button"
              tabIndex={0}
              title="Clique para filtrar apenas empresas pendentes"
              onClick={() => setStatusFilter(prev => prev === 'PENDING' ? 'ALL' : 'PENDING')}
              onKeyDown={e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); setStatusFilter(prev => prev === 'PENDING' ? 'ALL' : 'PENDING'); } }}
            >
              <div className="closing-stat-icon pending">
                <AlertCircle size={22} />
              </div>
              <div className="closing-stat-info">
                <span>Pendentes</span>
                <strong>{summary.pending}</strong>
              </div>
            </div>

            <div className="closing-stat-card progress-clickable" role="button" tabIndex={0} aria-expanded={progressOpen} onClick={() => setProgressOpen(value => !value)} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setProgressOpen(value => !value); } }}>
              <div className="closing-stat-icon percent">
                <Sparkles size={22} />
              </div>
              <div className="closing-stat-info">
                <span>Progresso (Campos)</span>
                <strong>{summary.overallPercent}%</strong>
              </div>
            </div>

            <div className="closing-stat-card progress-clickable" role="button" tabIndex={0} aria-expanded={progressOpen} onClick={() => setProgressOpen(value => !value)} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setProgressOpen(value => !value); } }}>
              <div className="closing-stat-icon percent">
                <Building2 size={22} />
              </div>
              <div className="closing-stat-info">
                <span>Progresso (Empresas)</span>
                <strong>{summary.total ? Math.round(summary.completed / summary.total * 100) : 0}%</strong>
              </div>
            </div>
          </div>

          <ClosingProgressDetails rows={rows} columns={popupColumns} sector="FISCAL" period={new Date(Date.UTC(selectedYear, selectedMonth - 1, 1))} latest={latestPeriod} open={progressOpen} onToggle={() => setProgressOpen(value => !value)} loading={loading} />

          {/* Cronograma de Prazos Legais das Obrigações */}
          <DeadlineTimelineWidget
            columns={popupColumns}
            rows={scopedRows}
            period={new Date(Date.UTC(selectedYear, selectedMonth - 1, 1))}
            onFilterPending={handleFilterColumnPending}
          />

          {/* Barra de Filtros e Busca */}
          <div className="closings-toolbar">
            <div className="closings-search-box">
              <Search size={18} color="#94a3b8" />
              <input
                type="text"
                placeholder="Buscar por código, empresa, CNPJ, grupo ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="closings-filters">
              <select
                className="closings-select"
                aria-label="Filtrar município"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              >
                <option value="ALL">Município: Todos</option>
                <option value="NONE">Sem Município</option>
                {distinctCities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>

              {viewInstallments && <select className="closings-select" aria-label="Filtrar parcelamentos" value={installmentFilter} onChange={event => setInstallmentFilter(event.target.value)}>{[{ value: 'ALL', label: 'Parcelamentos: Todos' }, { value: 'HAS_PLAN', label: 'Com parcelamento' }, { value: 'PENDING', label: 'Pendente' }, { value: 'OVERDUE', label: 'Atrasado / atrasos anteriores' }, { value: 'PAID', label: 'Pago no mês' }, { value: 'NO_INSTALLMENT', label: 'Sem parcela no mês' }, { value: 'NA', label: 'N/A — sem parcelamento' }].map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>}
              {viewInstallments && <button className="btn-secondary-light fiscal-create-installment" onClick={() => { setInstallmentCreate(false); setInstallmentFocus(null); setAllInstallmentsOpen(true); }}>Consultar parcelamentos</button>}
              {canCreateInstallment(currentUser) && <button className="btn-primary-gradient fiscal-create-installment" onClick={() => { setInstallmentCreate(true); setInstallmentFocus(null); setChooseInstallmentCompany(true); }}><Plus size={17} />Criar parcelamento</button>}

              <button className="btn-secondary-light" onClick={handleExport} title="Exportar para Excel (CSV)">
                <FileSpreadsheet size={16} />
                Exportar
              </button>

              <button
                type="button"
                className="btn-secondary-light"
                onClick={handleCopyAllCnpjs}
                title="Copiar CNPJs limpos das empresas filtradas"
              >
                <Copy size={15} />
                Copiar CNPJs
              </button>

              {isPrivileged && (
                <button
                  type="button"
                  className="btn-secondary-light"
                  onClick={() => setWorkloadOpen(true)}
                  title="Ver ranking e distribuição de empresas por responsável"
                >
                  <BarChart3 size={15} />
                  Carga da Equipe
                </button>
              )}

              <button
                type="button"
                className={`btn-secondary-light ${focusModeIndex !== null ? 'active' : ''}`}
                onClick={() => setFocusModeIndex(focusModeIndex !== null ? null : (filteredRows.length > 0 ? 0 : null))}
                title="Ativar Modo Foco: preenchimento vertical empresa por empresa"
                style={{
                  background: focusModeIndex !== null ? 'linear-gradient(135deg, rgba(217, 15, 129, 0.25), rgba(129, 140, 248, 0.25))' : undefined,
                  borderColor: focusModeIndex !== null ? '#d90f81' : undefined,
                  color: focusModeIndex !== null ? '#fff' : undefined,
                }}
              >
                <Zap size={15} color={focusModeIndex !== null ? '#f472b6' : undefined} />
                Modo Foco
              </button>

              <button
                type="button"
                className={`btn-density-toggle ${tableDensity === 'compact' ? 'active' : ''}`}
                onClick={toggleDensity}
                title={tableDensity === 'compact' ? 'Mudar para modo Espaçoso' : 'Mudar para modo Compacto'}
              >
                <span>{tableDensity === 'compact' ? 'Modo Compacto' : 'Modo Padrão'}</span>
              </button>

              <select
                className="closings-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Status: Todos</option>
                <option value="COMPLETED">Concluído</option>
                <option value="IN_PROGRESS">Em Andamento</option>
                <option value="PENDING">Pendente</option>
              </select>

              <select
                className="closings-select"
                value={regimeFilter}
                onChange={(e) => setRegimeFilter(e.target.value)}
              >
                <option value="ALL">Tributação: Todas</option>
                <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                <option value="LUCRO_REAL_TRIMESTRAL">Lucro Real Trimestral</option>
                <option value="LUCRO_REAL_ESTIMATIVA">Lucro Real Estimativa</option>
                <option value="MEI">MEI</option>
              </select>

              {isPrivileged && (
                <select
                  className="closings-select"
                  value={responsibleFilter}
                  onChange={(e) => setResponsibleFilter(e.target.value)}
                >
                  <option value="ALL">Responsável: Todos</option>
                  {fiscalUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              )}

              <select
                className="closings-select"
                aria-label="Filtrar certificado"
                value={certFilter}
                onChange={(e) => setCertFilter(e.target.value)}
              >
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
                  onChange={(e) => setOnlyMyCompanies(e.target.checked)}
                />
                <span>Minhas empresas</span>
              </label>
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

          {/* Tabela Limpa e Operacional do Fechamento Fiscal */}
          <div className="closings-table-card">
            {loading ? (
              <div style={{ padding: '24px' }}>
                <TableSkeleton count={6} />
              </div>
            ) : (
              <>
                <div
                  className="payroll-scroll-top"
                  ref={upperScroll}
                  onScroll={(e) => syncScroll(e.currentTarget, tableScroll.current)}
                >
                  <div style={{ width: scrollWidth || 2200, height: 1 }} />
                </div>
                <div
                  className={`closings-table-wrapper ${tableDensity === 'compact' ? 'table-compact' : ''}`}
                  ref={tableScroll}
                  onScroll={(e) => syncScroll(e.currentTarget, upperScroll.current)}
                >
                  <table className="closings-table">
                  <thead>
                    <tr>
                      {/* 1. Código com Ordenação e Checkbox de Ações em Massa */}
                      <th className="sticky-col-code">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={handleToggleSelectAll}
                            title={allFilteredSelected ? "Desmarcar todas" : "Selecionar todas as empresas filtradas"}
                            className="bulk-header-checkbox"
                          />
                          <button type="button" className="payroll-sort-btn" onClick={() => handleSort('code')} title="Clique para ordenar por código">
                            Código
                            <span>{sortConfig.key === 'code' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                          </button>
                        </div>
                      </th>

                      {/* 2. Empresa com Ordenação e Filtro de Certificado */}
                      <th className="sticky-col-company">
                        <div className="th-header-cell">
                          <button type="button" className="payroll-sort-btn" onClick={() => handleSort('name')} title="Clique para ordenar por nome">
                            Empresa / Certificado
                            <span>{sortConfig.key === 'name' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}</span>
                          </button>
                          <ColumnHeaderFilter
                            columnKey="fiscal-cert"
                            label="Certificado"
                            activeFilter={certFilter}
                            onFilterChange={setCertFilter}
                            openHeaderFilter={openHeaderFilter}
                            setOpenHeaderFilter={setOpenHeaderFilter}
                            options={[
                              { value: 'ALL', label: 'Certificados: Todos', count: scopedRows.length },
                              { value: 'HAS_CERT', label: 'Com certificado', count: scopedRows.filter(r => r.company.hasClientCertificate).length },
                              { value: 'NO_CERT', label: 'Sem certificado', count: scopedRows.filter(r => !r.company.hasClientCertificate).length },
                              { value: 'EXPIRING', label: 'Vencendo ou Vencidos', count: scopedRows.filter(r => { const c = r.company.hasClientCertificate ? getCertificateStatus(r.company.certificateExpiration) : null; return c?.status === 'EXPIRED' || c?.status === 'WARNING'; }).length },
                              { value: 'EXPIRED', label: 'Apenas Vencidos', count: scopedRows.filter(r => { const c = r.company.hasClientCertificate ? getCertificateStatus(r.company.certificateExpiration) : null; return c?.status === 'EXPIRED'; }).length },
                              { value: 'OK', label: 'Válidos (> 30 dias)', count: scopedRows.filter(r => { const c = r.company.hasClientCertificate ? getCertificateStatus(r.company.certificateExpiration) : null; return c?.status === 'OK'; }).length },
                            ]}
                          />
                        </div>
                      </th>

                      {/* 3. Tributação com Ícone de Filtro */}
                      <th style={{ minWidth: '130px' }}>
                        <div className="th-header-cell">
                          <span onClick={() => handleSort('regime')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Tributação
                            {sortConfig.key === 'regime' && (
                              <span style={{ fontSize: '10px', color: '#818cf8' }}>
                                {sortConfig.direction === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>
                          <ColumnHeaderFilter
                            columnKey="regime"
                            label="Tributação"
                            activeFilter={regimeFilter}
                            onFilterChange={setRegimeFilter}
                            openHeaderFilter={openHeaderFilter}
                            setOpenHeaderFilter={setOpenHeaderFilter}
                            options={computeColumnFilterOptions(scopedRows, r => r.company.taxRegime, {
                              allLabel: 'Todas as Tributações',
                              valueLabels: {
                                SIMPLES_NACIONAL: 'Simples Nacional',
                                LUCRO_PRESUMIDO: 'Lucro Presumido',
                                LUCRO_REAL_TRIMESTRAL: 'Lucro Real Trim.',
                                LUCRO_REAL_ESTIMATIVA: 'Lucro Real Est.',
                                LUCRO_REAL_ANUAL: 'Lucro Real Anual',
                                MEI: 'MEI',
                                IMUNE_IRPJ: 'Imune IRPJ',
                                CONDOMINIOS: 'Condomínios',
                                DOMESTICA: 'Doméstica',
                                ASSOCIACOES: 'Associações',
                                PESSOA_FISICA: 'Pessoa Física',
                              }
                            })}
                          />
                        </div>
                      </th>

                      {/* 4. Status com Ícone de Filtro */}
                      <th style={{ minWidth: '120px' }}>
                        <div className="th-header-cell">
                          <span onClick={() => handleSort('status')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Status
                            {sortConfig.key === 'status' && (
                              <span style={{ fontSize: '10px', color: '#818cf8' }}>
                                {sortConfig.direction === 'asc' ? '▲' : '▼'}
                              </span>
                            )}
                          </span>
                          <ColumnHeaderFilter
                            columnKey="status"
                            label="Status"
                            activeFilter={statusFilter}
                            onFilterChange={setStatusFilter}
                            openHeaderFilter={openHeaderFilter}
                            setOpenHeaderFilter={setOpenHeaderFilter}
                            options={computeColumnFilterOptions(scopedRows, r => r.calculatedStatus, {
                              allLabel: 'Todos os Status',
                              valueLabels: { COMPLETED: 'Concluído', IN_PROGRESS: 'Em Andamento', PENDING: 'Pendente' }
                            })}
                          />
                        </div>
                      </th>

                      {/* 5. Responsável com Ícone de Filtro */}
                      {isPrivileged && (
                        <th style={{ minWidth: '130px' }}>
                          <div className="th-header-cell">
                            <span>Responsável</span>
                            <ColumnHeaderFilter
                              columnKey="responsible"
                              label="Responsável"
                              activeFilter={responsibleFilter}
                              onFilterChange={setResponsibleFilter}
                              openHeaderFilter={openHeaderFilter}
                              setOpenHeaderFilter={setOpenHeaderFilter}
                              options={computeColumnFilterOptions(scopedRows, r => {
                                const resp = getFiscalResponsible(r.company);
                                return resp?.userId || resp?.user?.id || null;
                              }, {
                                allLabel: 'Todos os Responsáveis',
                                noneLabel: 'Não atribuído',
                                valueLabels: Object.fromEntries(fiscalUsers.map(u => [u.id, u.name || u.email]))
                              })}
                            />
                          </div>
                        </th>
                      )}

                      <th>CNPJ</th>
                      <th>Observações</th>
                      {viewInstallments && (
                        <th style={{ minWidth: '155px' }}>
                          <div className="th-header-cell">
                            <span>Parcelamentos</span>
                            <ColumnHeaderFilter
                              columnKey="installment-status"
                              label="Parcelamentos"
                              activeFilter={installmentFilter}
                              onFilterChange={setInstallmentFilter}
                              openHeaderFilter={openHeaderFilter}
                              setOpenHeaderFilter={setOpenHeaderFilter}
                              options={[
                                { value: 'ALL', label: 'Parcelamentos: Todos', count: scopedRows.length },
                                { value: 'HAS_PLAN', label: 'Com parcelamento', count: scopedRows.filter(r => installmentSummaries[r.company.id] && installmentSummaries[r.company.id].status !== 'NA').length },
                                { value: 'PENDING', label: 'Pendente', count: scopedRows.filter(r => installmentSummaries[r.company.id]?.status === 'PENDING').length },
                                { value: 'OVERDUE', label: 'Atrasado / atrasos anteriores', count: scopedRows.filter(r => installmentSummaries[r.company.id]?.status === 'OVERDUE').length },
                                { value: 'PAID', label: 'Pago no mês', count: scopedRows.filter(r => installmentSummaries[r.company.id]?.status === 'PAID').length },
                                { value: 'NO_INSTALLMENT', label: 'Sem parcela no mês', count: scopedRows.filter(r => installmentSummaries[r.company.id]?.status === 'NO_INSTALLMENT').length },
                                { value: 'NA', label: 'N/A — sem parcelamento', count: scopedRows.filter(r => !installmentSummaries[r.company.id] || installmentSummaries[r.company.id]?.status === 'NA').length },
                              ]}
                            />
                          </div>
                        </th>
                      )}

                      {/* As 8 Obrigações Fiscais com Ícone de Filtro no Header */}
                      {popupColumns.map((column) => {
                        const ob = { key: column.columnKey, label: column.name, color: '#818cf8' };
                        const currentObFilter = obligationFilters[ob.key] || 'ALL';
                        const obOptions = computeColumnFilterOptions(scopedRows, r => {
                          const val = r.columnsData?.[column.columnKey];
                          if (!val) {
                            if (isFiscalObligationNA(r.company?.taxRegime, column.columnKey)) return 'N/A';
                            return null;
                          }
                          if (['TEXT', 'CHECKBOX', 'NUMBER', 'TEXTAREA', 'PASSWORD', 'SELECT', 'MULTISELECT'].includes(column.inputType)) {
                            return isColumnComplete(column, val) ? 'Concluído' : 'Pendente';
                          }
                          if (typeof val === 'object') {
                            return val.label || val.status || null;
                          }
                          return String(val);
                        }, { allLabel: 'Todos os Status', noneLabel: 'Nenhum' });

                        return (
                          <th key={ob.key} style={{ color: ob.color, borderBottomColor: ob.color, minWidth: '120px' }}>
                            <div className="th-header-cell">
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                <span title={visibilitySummary(column)}>{ob.label}</span>
                                {(() => {
                                  const day = getColumnDeadlineDay(column);
                                  if (!day) return null;
                                  const dDate = getDeadlineDate(day, new Date(Date.UTC(selectedYear, selectedMonth - 1, 1)));
                                  const hasPending = scopedRows.some(r => {
                                    const v = r.columnsData?.[column.columnKey];
                                    const st = typeof v === 'object' && v ? v.status : (v ? 'CONCLUIDO' : 'PENDENTE');
                                    return st === 'PENDENTE';
                                  });
                                  const urg = getDeadlineUrgency(dDate, !hasPending);
                                  const cls = urg.type === 'OVERDUE' ? 'overdue' : (urg.type === 'DUE_TODAY' || urg.type === 'DUE_SOON') ? 'urgent' : 'normal';
                                  return (
                                    <span className={`th-deadline-badge ${cls}`} title={`Prazo legal: Dia ${day} (${urg.formattedDate}) • ${urg.label}`}>
                                      Dia {day}
                                    </span>
                                  );
                                })()}
                              </div>
                              <ColumnHeaderFilter
                                columnKey={`ob-${ob.key}`}
                                label={ob.label}
                                activeFilter={currentObFilter}
                                onFilterChange={val => handleObligationFilterChange(ob.key, val)}
                                openHeaderFilter={openHeaderFilter}
                                setOpenHeaderFilter={setOpenHeaderFilter}
                                options={obOptions}
                              />
                            </div>
                          </th>
                        );
                      })}

                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={(isPrivileged ? 7 : 6) + popupColumns.length + (viewInstallments ? 1 : 0)} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                          Nenhuma empresa encontrada com os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r) => {
                        const c = r.company;
                        const fiscalResp = getFiscalResponsible(c);
                        const currentRespId = fiscalResp?.userId || fiscalResp?.user?.id || '';
                        const certInfo = c.hasClientCertificate
                          ? getCertificateStatus(c.certificateExpiration)
                          : null;

                        return (
                          <tr key={c.id}>
                            {/* 1. Código com Checkbox de Seleção */}
                            <td className="sticky-col-code">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedClosingIds.has(r.id)}
                                  onChange={() => handleToggleSelectRow(r.id)}
                                  disabled={!isRowEditable(r)}
                                  title={isRowEditable(r) ? 'Selecionar para ação em massa' : 'Empresa somente leitura'}
                                  className="bulk-row-checkbox"
                                />
                                <span style={{ fontWeight: 600, color: '#94a3b8' }}>{formatCompanyCode(c.code) || '—'}</span>
                              </div>
                            </td>

                            {/* 2. Empresa Interativa com ícone, link explícito e alerta de certificado */}
                            <td className="sticky-col-company">
                              <div className="company-cell-wrapper">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <button
                                    className="company-interactive-link"
                                    onClick={() => setActiveModal({ type: 'COMPANY_INFO', row: r })}
                                    title="Clique para ver dados cadastrais, senhas descriptografadas e certificados"
                                  >
                                    <div className="company-link-left">
                                      <Building2 size={16} color="#818cf8" style={{ flexShrink: 0 }} />
                                      <span>{c.name}</span>
                                    </div>
                                    <div className="company-link-icon-chip">
                                      <span>Ver Dados</span>
                                      <ExternalLink size={10} />
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    className="focus-trigger-row-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const idx = filteredRows.findIndex(item => item.id === r.id);
                                      if (idx !== -1) setFocusModeIndex(idx);
                                    }}
                                    title="Abrir no Modo Foco (Preenchimento Rápido Vertical)"
                                    style={{
                                      background: 'rgba(217, 15, 129, 0.1)',
                                      border: '1px solid rgba(217, 15, 129, 0.25)',
                                      color: '#f472b6',
                                      borderRadius: '6px',
                                      padding: '4px 6px',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      flexShrink: 0,
                                    }}
                                  >
                                    <Zap size={11} />
                                    <span>Foco</span>
                                  </button>
                                </div>
                                {c.tradeName && <div className="company-cell-trade">{c.tradeName}</div>}

                                {/* Alerta Visual de Vencimento de Certificado Digital */}
                                {certInfo && (
                                  <div
                                    className={`cert-warning-tag ${certInfo.status === 'EXPIRED' ? 'expired' : ''}`}
                                    onClick={() => setActiveModal({ type: 'COMPANY_INFO', row: r })}
                                    style={{ cursor: 'pointer' }}
                                    title={`Vencimento: ${c.certificateExpiration || '-'} (${certInfo.label})`}
                                  >
                                    <AlertTriangle size={12} />
                                    <span>{certInfo.label}</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 3. Tributação (Fora do Popup) */}
                            <td>
                              <span className={`tax-regime-pill ${getRegimeClass(c.taxRegime)}`}>
                                {formatRegimeLabel(c.taxRegime)}
                              </span>
                            </td>

                            {/* 4. Status Automatizado */}
                            <td>
                              <span
                                className={`status-badge ${r.calculatedStatus === 'COMPLETED'
                                    ? 'completed'
                                    : r.calculatedStatus === 'IN_PROGRESS'
                                      ? 'in-progress'
                                      : 'pending'
                                  }`}
                              >
                                {r.calculatedStatus === 'COMPLETED'
                                  ? 'Concluído'
                                  : r.calculatedStatus === 'IN_PROGRESS'
                                    ? 'Em Andamento'
                                    : 'Pendente'}
                              </span>
                            </td>

                            {/* 5. Responsável (Select editável) */}
                            {isPrivileged && (
                              <td>
                                <select
                                  className="table-user-select"
                                  disabled={!isRowEditable(r)}
                                  value={currentRespId}
                                  onChange={(e) => handleResponsibleChange(c.id, e.target.value)}
                                >
                                  <option value="">Não atribuído</option>
                                  {fiscalUsers.map((u) => (
                                    <option key={u.id} value={u.id} disabled={u.active === false}>
                                      {u.name || u.email}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )}

                            {/* 6. CNPJ com Copiar */}
                            <td>
                              <button
                                className="copy-badge-btn"
                                onClick={() => handleCopy(c.cnpj, 'CNPJ')}
                                title="Copiar CNPJ"
                              >
                                {formatCnpj(c.cnpj)}
                                <Copy size={12} />
                              </button>
                            </td>

                            {/* 7. Observações do Fiscal */}
                            <td>
                              <button
                                className="copy-badge-btn"
                                style={{ background: c.notes ? 'rgba(99, 102, 241, 0.15)' : undefined }}
                                onClick={() => {
                                  setNotesText(c.notes || '');
                                  setActiveModal({ type: 'NOTES', row: r });
                                }}
                                title={c.notes || 'Adicionar observação'}
                              >
                                {c.notes ? `${c.notes.slice(0, 16)}...` : '+ Obs'}
                              </button>
                            </td>

                            {viewInstallments && <td><div className="fiscal-installment-cell">{(() => { const summary = installmentSummaries[c.id]; const disabled = summary?.status === 'NA' || !summary; return <button className={`obligation-btn ${summary?.status === 'OVERDUE' ? 'pendencia' : summary?.status === 'PAID' ? 'ok-data' : summary?.status === 'NA' ? 'na' : 'pendente'}`} disabled={disabled} title={summary?.status === 'NA' ? 'Empresa sem parcelamentos cadastrados' : 'Consultar todos os parcelamentos desta empresa'} onClick={() => { setInstallmentCreate(false); setInstallmentFocus(null); setInstallmentCompany(c); }}>{summary?.label || (installmentError ? 'Indisponível' : 'Carregando...')}</button>; })()}</div></td>}

                            {/* 8 Colunas de Obrigações Fiscais */}
                            {popupColumns.map(col => (
                              <td
                                key={col.columnKey}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setAuditTarget({
                                    companyId: r.company.id,
                                    companyName: r.company.name,
                                    companyCode: r.company.code,
                                    columnKey: col.columnKey,
                                    columnLabel: col.name || col.columnKey,
                                  });
                                }}
                              >
                                {renderObligationCell(r, col.columnKey)}
                              </td>
                            ))}

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
        </div>

        {/* ==========================================================================
            MODAIS INTERATIVOS (REINF, IMPOSTOS, ISS, MIT, CARNÊ LEÃO, SPED, INFO)
            ========================================================================== */}

        {allInstallmentsOpen && <AllInstallmentsModal active={!installmentCompany} year={selectedYear} month={selectedMonth} currentUser={currentUser} onClose={() => setAllInstallmentsOpen(false)} onSelect={(company, id, action) => { setInstallmentCreate(false); setInstallmentFocus({ id, action }); setInstallmentCompany(company); }} />}
        {chooseInstallmentCompany && <InstallmentCompanyPicker mode={installmentCreate ? 'create' : 'view'} currentUser={currentUser} onClose={() => setChooseInstallmentCompany(false)} onSelect={company => { setChooseInstallmentCompany(false); setInstallmentCompany(company); }} />}
        {installmentCompany && <InstallmentsModal company={installmentCompany} year={selectedYear} month={selectedMonth} currentUser={currentUser} createInitially={installmentCreate} initialPlanId={installmentFocus?.id} initialAction={installmentFocus?.action} onClose={() => { setInstallmentCompany(null); setInstallmentFocus(null); }} onChanged={() => { void loadInstallmentSummaries(rows); }} />}
        {activeModal?.type === 'POPUP' && (
          <div className="closing-modal-backdrop" onClick={closeAllModals}>
            <div className="closing-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: activePopupConfig.fields.length ? '650px' : '440px' }}>
              <div className="closing-modal-header">
                <div className="closing-modal-title purple"><FileSpreadsheet size={22} />{activePopupConfig.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="closing-modal-history-btn"
                    title="Ver trilha de auditoria desta obrigação"
                    onClick={() => {
                      setAuditTarget({
                        companyId: activeModal.row.company.id,
                        companyName: activeModal.row.company.name,
                        companyCode: activeModal.row.company.code,
                        columnKey: activeModal.colKey!,
                        columnLabel: activePopupConfig.title || activePopupColumn?.name || activeModal.colKey!,
                      });
                    }}
                  >
                    <History size={15} />
                    <span>Histórico</span>
                  </button>
                  <button className="closing-modal-close-btn" onClick={closeAllModals}>&times;</button>
                </div>
              </div>
              <div className="closing-modal-body">
                {activePopupConfig.description && <p>{activePopupConfig.description}</p>}
                {!canEditPopup && <p>Esta coluna está configurada como somente leitura.</p>}
                <div className="modal-fields-grid">
                  {activePopupConfig.fields.map(field => <div className={`modal-input-group ${field.fullWidth || field.type === 'TEXTAREA' ? 'full-width' : ''}`} key={field.key}>
                    <label>{field.label}{field.required ? ' *' : ''}</label>
                    {field.type === 'TEXTAREA' ? <textarea rows={3} disabled={!canEditPopup || savingAction} value={popupForm[field.key] || ''} placeholder={field.placeholder} onChange={e => setPopupForm(prev => ({ ...prev, [field.key]: e.target.value }))} />
                      : field.type === 'SELECT' ? <select disabled={!canEditPopup || savingAction} value={popupForm[field.key] || ''} onChange={e => setPopupForm(prev => ({ ...prev, [field.key]: e.target.value }))}><option value="">Selecione...</option>{popupForm[field.key] && !field.options.includes(popupForm[field.key]) && <option value={popupForm[field.key]}>{popupForm[field.key]} (valor anterior)</option>}{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
                        : <input disabled={!canEditPopup || savingAction} type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'} step={field.type === 'NUMBER' ? 'any' : undefined} value={popupForm[field.key] || ''} placeholder={field.placeholder} onChange={e => setPopupForm(prev => ({ ...prev, [field.key]: e.target.value }))} />}
                  </div>)}
                </div>
                <div className={activePopupConfig.fields.length ? 'modal-actions-grid' : 'modal-actions-stack'}>
                  {activePopupConfig.actions.filter(a => a.enabled).map(action => <button key={action.id} className={action.id === 'NA' ? 'btn-action-purple-gradient' : 'btn-action-blue-gradient'} disabled={!canEditPopup || savingAction} onClick={() => {
                    if (action.id === 'SALVAR' || action.id === 'OK_DATA') {
                      const missing = activePopupConfig.fields.find(field => field.required && !(popupForm[field.key] || '').trim());
                      if (missing) { window.alert(`Preencha o campo: ${missing.label}`); return; }
                    }
                    const handlers: Record<PopupAction, () => void> = { NA: handleActionNA, PENDENCIA: handleActionPendencia, SEM_MOV: handleActionSemMovimento, SALVAR: handleActionSalvar, OK_DATA: activePopupConfig.fields.length ? handleActionSalvar : handleActionOkData, LIMPAR: handleActionLimpar };
                    handlers[action.id]();
                  }}>{action.label}</button>)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================================================
            SUB-MODAIS DE PERGUNTA (API, DATA, MOTIVO PENDÊNCIA)
            ========================================================================== */}

        {/* Sub-modal: Pergunta API */}
        {apiPrompt?.show && (
          <div className="closing-modal-backdrop" style={{ zIndex: 1100 }}>
            <div className="closing-modal-content" style={{ maxWidth: '420px' }}>
              <div className="closing-modal-header">
                <div className="closing-modal-title">
                  <Send size={20} />
                  Envio via API
                </div>
              </div>
              <div className="closing-modal-body">
                <p style={{ color: '#334155', fontSize: '0.95rem', margin: '8px 0' }}>
                  A obrigação foi transmitida diretamente via <strong>API</strong>?
                </p>
                <div className="sub-modal-actions" style={{ marginTop: '12px' }}>
                  <button className="btn-secondary-light" onClick={() => handleConfirmApi(false)}>
                    Não
                  </button>
                  <button className="btn-primary-gradient" onClick={() => handleConfirmApi(true)}>
                    Sim, Enviado com API
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-modal: Data de Conclusão */}
        {datePrompt?.show && (
          <div className="closing-modal-backdrop" style={{ zIndex: 1100 }}>
            <div className="closing-modal-content" style={{ maxWidth: '460px' }}>
              <div className="closing-modal-header">
                <div className="closing-modal-title">
                  <Calendar size={20} />
                  Data de Conclusão
                </div>
              </div>
              <div className="closing-modal-body">
                <label style={{ fontSize: '0.88rem', color: '#cbd5e1', fontWeight: 500 }}>
                  Informe ou escolha a data em que foi concluído (aceita datas retroativas):
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="fiscal-column-text"
                    placeholder="DD/MM/AAAA"
                    value={inputDateValue}
                    onChange={(e) => setInputDateValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmDate(); }}
                    style={{
                      flex: 1,
                      width: 'auto',
                      padding: '10px 12px',
                      fontSize: '0.95rem',
                    }}
                    autoFocus
                  />
                  <input
                    type="date"
                    aria-label="Selecionar data no calendário"
                    className="fiscal-column-text"
                    style={{ width: '148px', padding: '9px 10px', fontSize: '0.9rem' }}
                    value={brDateToIso(inputDateValue)}
                    onChange={(e) => {
                      if (e.target.value) setInputDateValue(isoDateToBr(e.target.value));
                    }}
                  />
                  <button
                    type="button"
                    className="btn-secondary-light"
                    onClick={() => setInputDateValue(new Date().toLocaleDateString('pt-BR'))}
                    title="Usar data de hoje"
                  >
                    Hoje
                  </button>
                </div>
                <div className="sub-modal-actions" style={{ marginTop: '12px' }}>
                  <button className="btn-secondary-light" onClick={() => setDatePrompt(null)}>
                    Cancelar
                  </button>
                  <button className="btn-primary-gradient" onClick={handleConfirmDate} disabled={savingAction}>
                    {savingAction ? <ButtonSpinner /> : 'Salvar Conclusão'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-modal: Motivo da Pendência */}
        {pendencyPrompt?.show && (
          <div className="closing-modal-backdrop" style={{ zIndex: 1100 }}>
            <div className="closing-modal-content" style={{ maxWidth: '460px' }}>
              <div className="closing-modal-header">
                <div className="closing-modal-title" style={{ color: '#ef4444' }}>
                  <AlertCircle size={20} />
                  Motivo da Pendência
                </div>
              </div>
              <div className="closing-modal-body">
                <label style={{ fontSize: '0.88rem', color: '#475569', fontWeight: 500 }}>
                  Descreva detalhadamente a pendência:
                </label>
                <textarea
                  rows={4}
                  placeholder="Ex: Aguardando extrato fiscal do cliente..."
                  value={pendencyPrompt.reason}
                  onChange={(e) => setPendencyPrompt({ ...pendencyPrompt, reason: e.target.value })}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                  autoFocus
                />
                <div className="sub-modal-actions" style={{ marginTop: '12px' }}>
                  <button className="btn-secondary-light" onClick={() => setPendencyPrompt(null)}>
                    Cancelar
                  </button>
                  <button className="btn-primary-gradient" onClick={handleConfirmPendency} disabled={savingAction}>
                    {savingAction ? <ButtonSpinner /> : 'Registrar Pendência'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-modal: Observações do Fiscal */}
        {activeModal?.type === 'NOTES' && (
          <div className="closing-modal-backdrop" onClick={closeAllModals}>
            <div className="closing-modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
              <div className="closing-modal-header">
                <div className="closing-modal-title">
                  <Info size={20} />
                  Observações do Fiscal
                </div>
                <button className="closing-modal-close-btn" onClick={closeAllModals}>
                  &times;
                </button>
              </div>
              <div className="closing-modal-body">
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Empresa: <strong>{activeModal.row.company.name}</strong>
                </p>
                <textarea
                  rows={5}
                  placeholder="Digite as observações específicas deste cliente para o setor Fiscal..."
                  value={notesText}
                  disabled={!isRowEditable(activeModal.row)}
                  onChange={(e) => setNotesText(e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
                <div className="sub-modal-actions" style={{ marginTop: '12px' }}>
                  <button className="btn-secondary-light" onClick={closeAllModals}>
                    Cancelar
                  </button>
                  <button className="btn-primary-gradient" disabled={!isRowEditable(activeModal.row)} onClick={handleSaveNotes}>
                    Salvar Observação
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================================================
            POPUP COMPLETO COM TODAS AS INFORMAÇÕES DA EMPRESA E CERTIFICADO
            ========================================================================== */}
        {activeModal?.type === 'COMPANY_INFO' && (
          <CompanyDetailsModal
            company={activeModal.row.company}
            currentUser={currentUser}
            onClose={closeAllModals}
          />
        )}

        <ResponsibleWorkloadModal
          isOpen={workloadOpen}
          onClose={() => setWorkloadOpen(false)}
          rows={scopedRows}
          users={fiscalUsers}
          sector="FISCAL"
          onSelectResponsible={(userId) => setResponsibleFilter(userId || 'ALL')}
          onReload={() => { void fetchClosings(); }}
          currentUser={currentUser}
        />

        {focusModeIndex !== null && (
          <FiscalFocusDrawer
            isOpen={focusModeIndex !== null}
            onClose={() => setFocusModeIndex(null)}
            rows={filteredRows}
            currentIndex={focusModeIndex}
            onSelectIndex={setFocusModeIndex}
            popupColumns={popupColumns}
            onSaveColumn={saveColumnValue}
            onOpenObligationModal={handleOpenObligationModal}
            onOpenCompanyInfo={(row) => setActiveModal({ type: 'COMPANY_INFO', row })}
            fiscalUsers={fiscalUsers}
            onResponsibleChange={handleResponsibleChange}
            isRowEditable={isRowEditable}
            currentUser={currentUser}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            monthLabel={monthLabel}
          />
        )}

        <ManualCompetenceModal
          isOpen={isManualModalOpen}
          onClose={() => setIsManualModalOpen(false)}
          initialYear={selectedYear}
          initialMonth={selectedMonth}
          onSuccess={(newYear, newMonth) => {
            setSelectedYear(newYear);
            setSelectedMonth(newMonth);
          }}
        />

        {multiSelectModal && (
          <div className="closing-modal-backdrop" onClick={() => setMultiSelectModal(null)}>
            <div className="closing-modal-content" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
              <div className="closing-modal-header">
                <div className="closing-modal-title">
                  <CheckSquare size={20} />
                  {multiSelectModal.definition?.name || 'Tipos de Nota Fiscal'}
                </div>
                <button className="closing-modal-close-btn" onClick={() => setMultiSelectModal(null)}>
                  &times;
                </button>
              </div>
              <div className="closing-modal-body">
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '14px' }}>
                  Empresa: <strong>{multiSelectModal.row.company.name}</strong>
                  <br />
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Selecione quais tipos de nota fiscal este cliente possui. As opções selecionadas replicam automaticamente para os próximos meses.
                  </span>
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px', marginBottom: '16px' }}>
                  {(multiSelectModal.definition?.fieldConfig?.options || [
                    'NFS Emitidas',
                    'NFS Recebidas',
                    'Entrada',
                    'Saída',
                    'CTE Saída',
                    'CTE Entrada',
                    'NFC-e'
                  ]).map((opt: string) => {
                    const isSelected = multiSelectModal.selected.includes(opt);
                    return (
                      <label
                        key={opt}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: isSelected ? '1.5px solid #d90f81' : '1px solid #cbd5e1',
                          background: isSelected ? 'rgba(217, 15, 129, 0.06)' : '#ffffff',
                          cursor: 'pointer',
                          userSelect: 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMultiSelectOption(opt)}
                          style={{ width: '16px', height: '16px', accentColor: '#d90f81', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: '0.88rem', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#d90f81' : '#334155' }}>
                          {opt}
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      style={{ fontSize: '0.8rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => {
                        const all = multiSelectModal.definition?.fieldConfig?.options || [
                          'NFS Emitidas', 'NFS Recebidas', 'Entrada', 'Saída', 'CTE Saída', 'CTE Entrada', 'NFC-e'
                        ];
                        setMultiSelectModal({ ...multiSelectModal, selected: all });
                      }}
                    >
                      Marcar Todos
                    </button>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <button
                      type="button"
                      style={{ fontSize: '0.8rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => setMultiSelectModal({ ...multiSelectModal, selected: [] })}
                    >
                      Limpar
                    </button>
                  </div>

                  <div className="sub-modal-actions" style={{ marginTop: 0 }}>
                    <button className="btn-secondary-light" onClick={() => setMultiSelectModal(null)}>
                      Cancelar
                    </button>
                    <button
                      className="btn-primary-gradient"
                      disabled={!isRowEditable(multiSelectModal.row) || savingAction}
                      onClick={async () => {
                        await saveColumnValue(
                          multiSelectModal.row.closingId,
                          multiSelectModal.colKey,
                          multiSelectModal.selected
                        );
                        setMultiSelectModal(null);
                      }}
                    >
                      {savingAction ? 'Salvando...' : 'Salvar Tipos de NF'}
                    </button>
                  </div>
                </div>
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
            sector="FISCAL"
          />
        )}

        {/* Barra Flutuante de Ações em Massa */}
        {selectedClosingIds.size > 0 && (
          <div className="bulk-floating-bar">
            <div className="bulk-bar-info">
              <span className="bulk-bar-badge">{selectedClosingIds.size}</span>
              <span>empresa(s) selecionada(s)</span>
            </div>
            <div className="bulk-bar-actions">
              <button
                type="button"
                className="bulk-btn-clear"
                onClick={() => setSelectedClosingIds(new Set())}
              >
                Desmarcar
              </button>
              {isPrivileged && (
                <button
                  type="button"
                  className="bulk-btn-assign"
                  onClick={() => setBulkAssignOpen(true)}
                >
                  <Users size={15} />
                  Atribuir Responsável
                </button>
              )}
              <button
                type="button"
                className="bulk-btn-trigger"
                onClick={() => setBulkModalOpen(true)}
              >
                <Zap size={15} />
                Ações em Massa
              </button>
            </div>
          </div>
        )}

        {/* Toast de Feedback de Ações em Massa */}
        {bulkFeedback && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '10px',
            boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 600,
            fontSize: '0.88rem',
            animation: 'bulkSlideUp 0.3s ease'
          }}>
            <CheckCircle2 size={18} />
            {bulkFeedback}
          </div>
        )}

        {/* Modal de Ações em Massa */}
        <BulkActionModal
          open={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          selectedRows={selectedRowsList}
          columns={popupColumns}
          sector="FISCAL"
          period={new Date(Date.UTC(selectedYear, selectedMonth - 1, 1))}
          currentUser={currentUser}
          onSuccess={handleBulkSuccess}
        />

        <BulkAssignResponsibleModal
          isOpen={bulkAssignOpen}
          onClose={() => setBulkAssignOpen(false)}
          selectedCompanyIds={selectedRowsList.map(r => r.company?.id).filter(Boolean)}
          companies={scopedRows.map(r => r.company)}
          users={fiscalUsers}
          currentUser={currentUser}
          defaultSector="FISCAL"
          onSuccess={(count, sectorLabel, respName) => {
            setSelectedClosingIds(new Set());
            setBulkFeedback(`${count} empresa(s) atribuída(s) para ${respName} no ${sectorLabel}!`);
            setTimeout(() => setBulkFeedback(null), 5000);
            void fetchClosings();
          }}
        />
      </main>
    </div>
  );
}
