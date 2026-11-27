import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  Search,
  ChevronLeft,
  ChevronRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  PauseCircle,
  ExternalLink,
  Users,
  Plus,
  Trash2,
  X,
  Eye,
  EyeOff,
  Copy,
  Check,
  Landmark,
  FileSpreadsheet,
} from 'lucide-react';
import { API } from '../api';
import { installmentHeaders } from '../config/installments';
import { ClosingSectorTabs, hasSectorAccess } from './ClosingSectorTabs';
import { BulkAssignResponsibleModal } from './BulkAssignResponsibleModal';
import { CompanyDetailsModal } from './CompanyDetailsModal';
import { Sidebar } from './Sidebar';
import type { CurrentUser } from '../types/auth';
import './BpoClosings.css';

interface Props {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser?: CurrentUser | null;
  onLogout?: () => void;
}

interface BankAccount {
  id: string;
  bank: string;
  agency: string;
  account: string;
  user: string;
  pass: string;
}

interface ReconciliationTask {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  done: boolean;
  doneAt?: string;
  doneBy?: string;
}

interface FinalizationData {
  gerencial?: string;
  fluxoCaixa?: string;
  analiseCategoria?: string;
}

interface BpoRow {
  id: string;
  closingId?: string;
  companyId: string;
  company: any;
  responsible: any;
  status: string;
  columnsData: {
    system?: { name: string; user: string; pass: string };
    bankPhone?: string;
    banks?: BankAccount[];
    implementation?: string;
    implementationNotes?: string;
    costCenter?: string;
    reconciliationTasks?: ReconciliationTask[];
    finalization?: FinalizationData;
  };
  isSuspended?: boolean;
  suspendedReason?: string | null;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function BpoClosings({ currentView, onNavigate, currentUser, onLogout }: Props) {
  // BPO Financeiro é sempre por padrão o MÊS ATUAL
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getUTCFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getUTCMonth() + 1);

  const isCurrentMonth = selectedYear === today.getUTCFullYear() && selectedMonth === (today.getUTCMonth() + 1);

  const [rows, setRows] = useState<BpoRow[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [isBulkResponsibleOpen, setIsBulkResponsibleOpen] = useState(false);
  const [viewCompanyDetails, setViewCompanyDetails] = useState<any | null>(null);

  // Modais de Ação e Edição
  const [editingSystemRow, setEditingSystemRow] = useState<BpoRow | null>(null);
  const [systemForm, setSystemForm] = useState({ name: '', user: '', pass: '' });
  const [showSystemPass, setShowSystemPass] = useState(false);

  const [editingBanksRow, setEditingBanksRow] = useState<BpoRow | null>(null);
  const [banksList, setBanksList] = useState<BankAccount[]>([]);

  const [editingCalendarRow, setEditingCalendarRow] = useState<BpoRow | null>(null);
  const [calendarTasks, setCalendarTasks] = useState<ReconciliationTask[]>([]);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number>(today.getUTCDate());
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const [editingFinalizationRow, setEditingFinalizationRow] = useState<BpoRow | null>(null);
  const [finalizationForm, setFinalizationForm] = useState<FinalizationData>({
    gerencial: '',
    fluxoCaixa: '',
    analiseCategoria: '',
  });

  const [, setSavingKey] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const canEdit = useMemo(() => {
    return hasSectorAccess(currentUser, 'BPO', true);
  }, [currentUser]);

  const fetchClosings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/bpo-closings?year=${selectedYear}&month=${selectedMonth}`, {
        headers: installmentHeaders(currentUser),
      });
      if (!res.ok) {
        throw new Error('Falha ao carregar fechamento BPO.');
      }
      const data = await res.json();
      setRows(data.rows || []);
      setUsers(data.users || []);
    } catch (err) {
      console.error('Erro ao buscar fechamentos BPO:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClosings();
  }, [selectedYear, selectedMonth]);

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handleGoToCurrentMonth = () => {
    setSelectedYear(today.getUTCFullYear());
    setSelectedMonth(today.getUTCMonth() + 1);
  };

  // Atualização de Coluna no Servidor
  const updateColumn = async (closingId: string, columnKey: string, value: any) => {
    setSavingKey(`${closingId}-${columnKey}`);
    try {
      const res = await fetch(`${API}/api/bpo-closings/${closingId}/column`, {
        method: 'PUT',
        headers: {
          ...installmentHeaders(currentUser),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ columnKey, value }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Falha ao salvar dados.');
      }
      const data = await res.json();
      setRows((prev) =>
        prev.map((r) => {
          if (r.closingId === closingId || r.id === closingId) {
            return {
              ...r,
              status: data.closing?.status || r.status,
              columnsData: data.closing?.columnsData || {
                ...r.columnsData,
                [columnKey]: value,
              },
            };
          }
          return r;
        })
      );
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar alteração.');
    } finally {
      setSavingKey(null);
    }
  };

  // Alteração de Responsável Individual
  const handleResponsibleChange = async (companyId: string, userId: string) => {
    try {
      const res = await fetch(`${API}/api/companies/${companyId}/responsible`, {
        method: 'PUT',
        headers: {
          ...installmentHeaders(currentUser),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          sector: 'BPO',
          actorId: currentUser?.id,
          actorEmail: currentUser?.email,
          actorName: currentUser?.name || currentUser?.email,
        }),
      });
      if (res.ok) {
        const targetUser = users.find((u) => u.id === userId);
        setRows((prev) =>
          prev.map((r) => {
            if (r.companyId === companyId) {
              return { ...r, responsible: targetUser || null };
            }
            return r;
          })
        );
      }
    } catch (err) {
      console.error('Erro ao atualizar responsável:', err);
    }
  };

  // Filtro de Linhas
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((r) => {
      const name = (r.company?.name || '').toLowerCase();
      const trade = (r.company?.tradeName || '').toLowerCase();
      const code = (r.company?.code || '').toLowerCase();
      const cnpj = (r.company?.cnpj || '').replace(/\D/g, '');
      const resp = (r.responsible?.name || '').toLowerCase();
      return name.includes(term) || trade.includes(term) || code.includes(term) || cnpj.includes(term) || resp.includes(term);
    });
  }, [rows, searchTerm]);

  // KPIs
  const kpis = useMemo(() => {
    const total = rows.length;
    const completed = rows.filter((r) => r.status === 'COMPLETED').length;
    const inProgress = rows.filter((r) => r.status === 'IN_PROGRESS').length;
    const pending = total - completed - inProgress;
    const suspended = rows.filter((r) => r.isSuspended).length;
    return { total, completed, inProgress, pending, suspended };
  }, [rows]);

  // Checkbox de Seleção Múltipla
  const toggleSelectRow = (companyId: string) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(companyId) ? prev.filter((id) => id !== companyId) : [...prev, companyId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCompanyIds.length === filteredRows.length) {
      setSelectedCompanyIds([]);
    } else {
      setSelectedCompanyIds(filteredRows.map((r) => r.companyId));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Calendário - Dias do Mês
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(selectedYear, selectedMonth - 1, 1).getDay();
  }, [selectedYear, selectedMonth]);

  return (
    <div className="bpo-closings-page">
      <Sidebar currentView={currentView} onNavigate={onNavigate} currentUser={currentUser} onLogout={onLogout} />

      <main className="bpo-closings-container">
        {/* Header Superior */}
        <header className="bpo-header">
          <div className="bpo-header-top">
            <div className="bpo-title-group">
              <div className="bpo-title-icon">
                <DollarSign size={24} />
              </div>
              <div>
                <h1>Fechamento BPO Financeiro</h1>
                <p>Gestão mensal de contas, conciliações diárias e fechamentos gerenciais</p>
              </div>
            </div>

            {/* Seletor de Competência */}
            <div className="bpo-competence-selector">
              <button
                type="button"
                className="bpo-competence-btn"
                onClick={handlePrevMonth}
                title="Mês Anterior"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="bpo-competence-text">
                {MONTH_NAMES[selectedMonth - 1]} / {selectedYear}
                {isCurrentMonth && <span className="bpo-current-month-badge">Mês Atual</span>}
              </div>

              <button
                type="button"
                className="bpo-competence-btn"
                onClick={handleNextMonth}
                title="Próximo Mês"
              >
                <ChevronRight size={18} />
              </button>

              {!isCurrentMonth && (
                <button
                  type="button"
                  className="bpo-btn-icon"
                  style={{ marginLeft: '6px' }}
                  onClick={handleGoToCurrentMonth}
                  title="Ir para o mês atual"
                >
                  <Calendar size={13} />
                  <span>Hoje</span>
                </button>
              )}
            </div>
          </div>

          {/* Abas dos Setores */}
          <div style={{ marginBottom: '14px' }}>
            <ClosingSectorTabs sector="BPO" currentUser={currentUser} onNavigate={onNavigate} />
          </div>

          {/* KPI Cards */}
          <div className="bpo-kpi-grid">
            <div className="bpo-kpi-card">
              <div className="bpo-kpi-icon" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                <Building2 size={20} />
              </div>
              <div className="bpo-kpi-info">
                <strong>{kpis.total}</strong>
                <span>Empresas BPO</span>
              </div>
            </div>

            <div className="bpo-kpi-card">
              <div className="bpo-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                <CheckCircle2 size={20} />
              </div>
              <div className="bpo-kpi-info">
                <strong>{kpis.completed}</strong>
                <span>Concluídos</span>
              </div>
            </div>

            <div className="bpo-kpi-card">
              <div className="bpo-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                <Clock size={20} />
              </div>
              <div className="bpo-kpi-info">
                <strong>{kpis.inProgress + kpis.pending}</strong>
                <span>Pendentes / Em Progresso</span>
              </div>
            </div>

            {kpis.suspended > 0 && (
              <div className="bpo-kpi-card">
                <div className="bpo-kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
                  <PauseCircle size={20} />
                </div>
                <div className="bpo-kpi-info">
                  <strong>{kpis.suspended}</strong>
                  <span>Serviços Suspensos</span>
                </div>
              </div>
            )}
          </div>

          {/* Toolbar de Pesquisa */}
          <div className="bpo-toolbar">
            <div className="bpo-search-box">
              <Search size={16} color="#64748b" />
              <input
                type="text"
                placeholder="Buscar por código, razão social, CNPJ ou responsável..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Barra Flutuante de Seleção em Massa */}
        {selectedCompanyIds.length > 0 && (
          <div className="bpo-selection-bar">
            <span className="bpo-badge-count">{selectedCompanyIds.length}</span>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>empresa(s) selecionada(s)</span>
            <button
              type="button"
              className="bpo-btn-icon"
              onClick={() => setSelectedCompanyIds([])}
            >
              Desmarcar
            </button>
            <button
              type="button"
              className="bpo-btn-icon"
              style={{ background: '#3b82f6', color: '#fff', borderColor: '#2563eb' }}
              onClick={() => setIsBulkResponsibleOpen(true)}
            >
              <Users size={14} />
              <span>Transferir Responsável</span>
            </button>
          </div>
        )}

        {/* Tabela de Fechamentos BPO */}
        <div className="bpo-table-wrapper">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
              <Clock size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <p>Carregando fechamento do BPO Financeiro...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
              <Building2 size={36} style={{ opacity: 0.4, marginBottom: '12px' }} />
              <p>Nenhuma empresa com BPO Financeiro encontrada.</p>
              <p style={{ fontSize: '12px', color: '#64748b' }}>
                Ative o BPO Financeiro no cadastro da empresa na aba Empresas.
              </p>
            </div>
          ) : (
            <table className="bpo-table">
              <thead>
                <tr>
                  <th style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedCompanyIds.length === filteredRows.length && filteredRows.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ width: '80px' }}>Código</th>
                  <th>Empresa / Certificado</th>
                  <th style={{ width: '130px' }}>Tributação</th>
                  <th style={{ width: '180px' }}>Responsável</th>
                  <th style={{ width: '190px' }}>Sistema Financeiro</th>
                  <th style={{ width: '150px' }}>Cel Banco</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Qtde Bancos</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>Implantação</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Centro Custo</th>
                  <th style={{ width: '170px', textAlign: 'center' }}>Fechamento Conciliação</th>
                  <th style={{ width: '160px', textAlign: 'center' }}>Finalização</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const comp = r.company;
                  const isSusp = Boolean(r.isSuspended);
                  const isEditable = canEdit && !isSusp;
                  const cols = r.columnsData || {};
                  const isSelected = selectedCompanyIds.includes(comp.id);

                  // Quantidade de bancos
                  const banks = cols.banks || [];
                  const banksCount = banks.length;

                  // Conciliações
                  const tasks = cols.reconciliationTasks || [];
                  const tasksDone = tasks.filter((t) => t.done).length;

                  // Finalização
                  const fin = cols.finalization || {};
                  const finCount = [fin.gerencial, fin.fluxoCaixa, fin.analiseCategoria].filter(Boolean).length;

                  return (
                    <tr
                      key={r.id}
                      className={isSusp ? 'bpo-row-suspended' : isSelected ? 'bpo-row-selected' : ''}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(comp.id)}
                        />
                      </td>

                      {/* Código */}
                      <td style={{ fontWeight: 700, color: '#38bdf8' }}>
                        {comp.code || '—'}
                      </td>

                      {/* Empresa / Certificado */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ color: '#f8fafc' }}>{comp.name}</strong>
                            {isSusp && (
                              <span className="badge-suspended" title={r.suspendedReason || 'Serviços suspensos'}>
                                <PauseCircle size={10} /> SUSPENSO
                              </span>
                            )}
                          </div>
                          {comp.tradeName && comp.tradeName !== comp.name && (
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{comp.tradeName}</span>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                            <button
                              type="button"
                              className="btn-link"
                              style={{ fontSize: '11px', color: '#38bdf8', padding: 0, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                              onClick={() => setViewCompanyDetails(comp)}
                            >
                              Ver Dados <ExternalLink size={10} />
                            </button>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>{comp.cnpj}</span>
                          </div>
                        </div>
                      </td>

                      {/* Tributação */}
                      <td>
                        <span className="bpo-tag-na" style={{ fontSize: '11px' }}>
                          {comp.taxRegime?.replace(/_/g, ' ') || '—'}
                        </span>
                      </td>

                      {/* Responsável */}
                      <td>
                        <select
                          value={r.responsible?.id || ''}
                          onChange={(e) => handleResponsibleChange(comp.id, e.target.value)}
                          disabled={!isEditable}
                          style={{
                            background: 'rgba(30, 41, 59, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            color: '#fff',
                            padding: '6px 8px',
                            fontSize: '12px',
                            width: '100%',
                            cursor: isEditable ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <option value="">Sem Responsável</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name || u.email}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Sistema Financeiro */}
                      <td>
                        <div
                          style={{
                            background: 'rgba(30, 41, 59, 0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            cursor: isEditable ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                          onClick={() => {
                            if (!isEditable) return;
                            setEditingSystemRow(r);
                            setSystemForm({
                              name: cols.system?.name || '',
                              user: cols.system?.user || '',
                              pass: cols.system?.pass || '',
                            });
                          }}
                          title="Clique para editar Sistema Financeiro, Usuário e Senha"
                        >
                          <div>
                            <strong style={{ fontSize: '12px', color: cols.system?.name ? '#22d3ee' : '#64748b', display: 'block' }}>
                              {cols.system?.name || 'Não informado'}
                            </strong>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              {cols.system?.user ? `Usuário: ${cols.system.user}` : 'Clique para configurar'}
                            </span>
                          </div>
                          {isEditable && <ExternalLink size={12} color="#64748b" />}
                        </div>
                      </td>

                      {/* Cel Banco */}
                      <td>
                        <input
                          type="text"
                          placeholder="Cel/Aparelho..."
                          value={cols.bankPhone || ''}
                          disabled={!isEditable}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRows((prev) =>
                              prev.map((rowItem) =>
                                rowItem.id === r.id
                                  ? {
                                      ...rowItem,
                                      columnsData: { ...rowItem.columnsData, bankPhone: val },
                                    }
                                  : rowItem
                              )
                            );
                          }}
                          onBlur={(e) => {
                            if (!isEditable) return;
                            updateColumn(r.closingId || r.id, 'bankPhone', e.target.value);
                          }}
                          style={{
                            background: 'rgba(30, 41, 59, 0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            color: '#fff',
                            padding: '6px 8px',
                            fontSize: '12px',
                            width: '100%',
                          }}
                        />
                      </td>

                      {/* Qtde Bancos */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="bpo-btn-icon"
                          onClick={() => {
                            setEditingBanksRow(r);
                            setBanksList(Array.isArray(cols.banks) ? [...cols.banks] : []);
                          }}
                          style={{
                            background: banksCount > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            borderColor: banksCount > 0 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                            color: banksCount > 0 ? '#60a5fa' : '#94a3b8',
                          }}
                        >
                          <Landmark size={13} />
                          <span>{banksCount} {banksCount === 1 ? 'Banco' : 'Bancos'}</span>
                        </button>
                      </td>

                      {/* Implantação */}
                      <td style={{ textAlign: 'center' }}>
                        <select
                          value={cols.implementation || 'SIM'}
                          disabled={!isEditable}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateColumn(r.closingId || r.id, 'implementation', val);
                          }}
                          style={{
                            background: cols.implementation === 'NÃO' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: cols.implementation === 'NÃO' ? '#fca5a5' : '#86efac',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '4px 6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: isEditable ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <option value="SIM">SIM</option>
                          <option value="NÃO">NÃO</option>
                          <option value="OBSERVAÇÃO">OBSERVAÇÃO</option>
                        </select>
                      </td>

                      {/* Centro de Custo */}
                      <td style={{ textAlign: 'center' }}>
                        <select
                          value={cols.costCenter || 'SIM'}
                          disabled={!isEditable}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateColumn(r.closingId || r.id, 'costCenter', val);
                          }}
                          style={{
                            background: cols.costCenter === 'N/A' ? 'rgba(148, 163, 184, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                            color: cols.costCenter === 'N/A' ? '#cbd5e1' : '#22d3ee',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '4px 6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: isEditable ? 'pointer' : 'not-allowed',
                          }}
                        >
                          <option value="SIM">SIM</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </td>

                      {/* Fechamento Conciliação */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="bpo-btn-icon"
                          onClick={() => {
                            setEditingCalendarRow(r);
                            setCalendarTasks(Array.isArray(cols.reconciliationTasks) ? [...cols.reconciliationTasks] : []);
                          }}
                          style={{
                            background: tasks.length > 0 && tasksDone === tasks.length
                              ? 'rgba(16, 185, 129, 0.15)'
                              : tasks.length > 0
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(255, 255, 255, 0.05)',
                            borderColor: tasks.length > 0 && tasksDone === tasks.length
                              ? 'rgba(16, 185, 129, 0.3)'
                              : tasks.length > 0
                              ? 'rgba(245, 158, 11, 0.3)'
                              : 'rgba(255, 255, 255, 0.1)',
                            color: tasks.length > 0 && tasksDone === tasks.length
                              ? '#34d399'
                              : tasks.length > 0
                              ? '#fbbf24'
                              : '#cbd5e1',
                          }}
                        >
                          <Calendar size={13} />
                          <span>
                            {tasks.length > 0 ? `${tasksDone}/${tasks.length} Conciliações` : 'Abrir Calendário'}
                          </span>
                        </button>
                      </td>

                      {/* Finalização */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="bpo-btn-icon"
                          onClick={() => {
                            setEditingFinalizationRow(r);
                            setFinalizationForm(cols.finalization || { gerencial: '', fluxoCaixa: '', analiseCategoria: '' });
                          }}
                          style={{
                            background: finCount === 3
                              ? 'rgba(16, 185, 129, 0.15)'
                              : finCount > 0
                              ? 'rgba(6, 182, 212, 0.15)'
                              : 'rgba(255, 255, 255, 0.05)',
                            borderColor: finCount === 3
                              ? 'rgba(16, 185, 129, 0.3)'
                              : finCount > 0
                              ? 'rgba(6, 182, 212, 0.3)'
                              : 'rgba(255, 255, 255, 0.1)',
                            color: finCount === 3 ? '#34d399' : finCount > 0 ? '#22d3ee' : '#94a3b8',
                          }}
                        >
                          <FileSpreadsheet size={13} />
                          <span>{finCount === 3 ? 'Concluído (3/3)' : finCount > 0 ? `${finCount}/3 Preenchidos` : 'Finalização'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* MODAL: Sistema Financeiro */}
      {editingSystemRow && (
        <div className="bpo-modal-overlay" onClick={() => setEditingSystemRow(null)}>
          <div className="bpo-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="bpo-modal-header">
              <div>
                <h3>Sistema Financeiro</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                  {editingSystemRow.company.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSystemRow(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="bpo-modal-body">
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Nome do Sistema Financeiro
                </label>
                <input
                  type="text"
                  placeholder="Ex: Conta Azul, Omie, Bling, Granatum, F360..."
                  value={systemForm.name}
                  onChange={(e) => setSystemForm({ ...systemForm, name: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Usuário de Acesso
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="E-mail ou login de acesso..."
                    value={systemForm.user}
                    onChange={(e) => setSystemForm({ ...systemForm, user: e.target.value })}
                    style={{
                      flex: 1,
                      background: 'rgba(30, 41, 59, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                  {systemForm.user && (
                    <button
                      type="button"
                      className="bpo-btn-icon"
                      onClick={() => handleCopy(systemForm.user)}
                      title="Copiar Usuário"
                    >
                      {copiedText === systemForm.user ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Senha de Acesso
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type={showSystemPass ? 'text' : 'password'}
                      placeholder="Senha do sistema financeiro..."
                      value={systemForm.pass}
                      onChange={(e) => setSystemForm({ ...systemForm, pass: e.target.value })}
                      style={{
                        width: '100%',
                        background: 'rgba(30, 41, 59, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        padding: '9px 36px 9px 12px',
                        color: '#fff',
                        fontSize: '13px',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSystemPass(!showSystemPass)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                      }}
                    >
                      {showSystemPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {systemForm.pass && (
                    <button
                      type="button"
                      className="bpo-btn-icon"
                      onClick={() => handleCopy(systemForm.pass)}
                      title="Copiar Senha"
                    >
                      {copiedText === systemForm.pass ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bpo-modal-footer">
              <button
                type="button"
                className="bpo-btn-icon"
                onClick={() => setEditingSystemRow(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="bpo-btn-icon"
                style={{ background: '#06b6d4', color: '#fff', borderColor: '#0891b2' }}
                onClick={async () => {
                  await updateColumn(editingSystemRow.closingId || editingSystemRow.id, 'system', systemForm);
                  setEditingSystemRow(null);
                }}
              >
                Salvar Sistema
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Contas Bancárias (Qtde Bancos) */}
      {editingBanksRow && (
        <div className="bpo-modal-overlay" onClick={() => setEditingBanksRow(null)}>
          <div className="bpo-modal-card" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div className="bpo-modal-header">
              <div>
                <h3>Contas Bancárias da Empresa</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                  {editingBanksRow.company.name} • {banksList.length} conta(s) configurada(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBanksRow(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="bpo-modal-body">
              {banksList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                  <Landmark size={32} style={{ opacity: 0.4, marginBottom: '8px' }} />
                  <p>Nenhum banco cadastrado para esta empresa.</p>
                </div>
              ) : (
                banksList.map((b, idx) => (
                  <div
                    key={b.id || idx}
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '13px', color: '#38bdf8' }}>Banco #{idx + 1}</strong>
                      <button
                        type="button"
                        onClick={() => setBanksList(banksList.filter((_, i) => i !== idx))}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        title="Remover este banco"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8' }}>Banco / Instituição</label>
                        <input
                          type="text"
                          placeholder="Ex: Itaú, Bradesco, Inter..."
                          value={b.bank}
                          onChange={(e) => {
                            const updated = [...banksList];
                            updated[idx].bank = e.target.value;
                            setBanksList(updated);
                          }}
                          style={{
                            width: '100%',
                            background: 'rgba(15, 23, 42, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8' }}>Agência</label>
                        <input
                          type="text"
                          placeholder="0000"
                          value={b.agency}
                          onChange={(e) => {
                            const updated = [...banksList];
                            updated[idx].agency = e.target.value;
                            setBanksList(updated);
                          }}
                          style={{
                            width: '100%',
                            background: 'rgba(15, 23, 42, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8' }}>Conta Corrente (C.C)</label>
                        <input
                          type="text"
                          placeholder="00000-0"
                          value={b.account}
                          onChange={(e) => {
                            const updated = [...banksList];
                            updated[idx].account = e.target.value;
                            setBanksList(updated);
                          }}
                          style={{
                            width: '100%',
                            background: 'rgba(15, 23, 42, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8' }}>Usuário / Login</label>
                        <input
                          type="text"
                          placeholder="Usuário de acesso..."
                          value={b.user}
                          onChange={(e) => {
                            const updated = [...banksList];
                            updated[idx].user = e.target.value;
                            setBanksList(updated);
                          }}
                          style={{
                            width: '100%',
                            background: 'rgba(15, 23, 42, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11px', color: '#94a3b8' }}>Senha</label>
                        <input
                          type="text"
                          placeholder="Senha de acesso..."
                          value={b.pass}
                          onChange={(e) => {
                            const updated = [...banksList];
                            updated[idx].pass = e.target.value;
                            setBanksList(updated);
                          }}
                          style={{
                            width: '100%',
                            background: 'rgba(15, 23, 42, 0.8)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            color: '#fff',
                            fontSize: '12px',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}

              <button
                type="button"
                className="bpo-btn-icon"
                onClick={() =>
                  setBanksList([
                    ...banksList,
                    {
                      id: String(Date.now()),
                      bank: '',
                      agency: '',
                      account: '',
                      user: '',
                      pass: '',
                    },
                  ])
                }
                style={{ alignSelf: 'flex-start', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}
              >
                <Plus size={14} />
                <span>Adicionar Outro Banco</span>
              </button>
            </div>

            <div className="bpo-modal-footer">
              <button
                type="button"
                className="bpo-btn-icon"
                onClick={() => setEditingBanksRow(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="bpo-btn-icon"
                style={{ background: '#3b82f6', color: '#fff', borderColor: '#2563eb' }}
                onClick={async () => {
                  await updateColumn(editingBanksRow.closingId || editingBanksRow.id, 'banks', banksList);
                  setEditingBanksRow(null);
                }}
              >
                Salvar Bancos ({banksList.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Fechamento Conciliação (Calendário Interativo) */}
      {editingCalendarRow && (
        <div className="bpo-modal-overlay" onClick={() => setEditingCalendarRow(null)}>
          <div className="bpo-modal-card" style={{ maxWidth: '820px' }} onClick={(e) => e.stopPropagation()}>
            <div className="bpo-modal-header">
              <div>
                <h3>Calendário de Fechamento de Conciliação</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                  {editingCalendarRow.company.name} • {MONTH_NAMES[selectedMonth - 1]} / {selectedYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCalendarRow(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="bpo-modal-body">
              {/* Grid do Calendário */}
              <div className="bpo-calendar-grid">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((dia) => (
                  <div key={dia} className="bpo-calendar-day-header">
                    {dia}
                  </div>
                ))}

                {/* Células vazias do início da semana */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ background: 'transparent' }} />
                ))}

                {/* Dias do mês */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dayNum = i + 1;
                  const dayDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const dayTasks = calendarTasks.filter((t) => t.date === dayDateStr);
                  const isDayDone = dayTasks.length > 0 && dayTasks.every((t) => t.done);
                  const isSelected = selectedCalendarDay === dayNum;

                  return (
                    <div
                      key={dayNum}
                      className={`bpo-calendar-day-cell ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setSelectedCalendarDay(dayNum)}
                    >
                      <div className="bpo-calendar-day-num">{dayNum}</div>
                      {dayTasks.length > 0 && (
                        <div className={`bpo-calendar-tasks-badge ${isDayDone ? 'all-done' : 'has-pending'}`}>
                          {dayTasks.filter((t) => t.done).length}/{dayTasks.length}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Seção de Tarefas do Dia Selecionado */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '16px',
                  marginTop: '10px',
                }}
              >
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#22d3ee' }}>
                  Tarefas de Conciliação do Dia {selectedCalendarDay} de {MONTH_NAMES[selectedMonth - 1]}:
                </h4>

                {/* Adicionar nova tarefa */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <input
                    type="text"
                    placeholder="Adicionar tarefa (ex: Conciliação Itaú, Extrato Cartões, Baixa Duplicatas...)"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTaskTitle.trim()) {
                        const dayDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedCalendarDay).padStart(2, '0')}`;
                        setCalendarTasks([
                          ...calendarTasks,
                          {
                            id: String(Date.now()),
                            date: dayDateStr,
                            title: newTaskTitle.trim(),
                            done: false,
                          },
                        ]);
                        setNewTaskTitle('');
                      }
                    }}
                    style={{
                      flex: 1,
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    type="button"
                    className="bpo-btn-icon"
                    style={{ background: '#06b6d4', color: '#fff', borderColor: '#0891b2' }}
                    onClick={() => {
                      if (!newTaskTitle.trim()) return;
                      const dayDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedCalendarDay).padStart(2, '0')}`;
                      setCalendarTasks([
                        ...calendarTasks,
                        {
                          id: String(Date.now()),
                          date: dayDateStr,
                          title: newTaskTitle.trim(),
                          done: false,
                        },
                      ]);
                      setNewTaskTitle('');
                    }}
                  >
                    <Plus size={14} />
                    <span>Adicionar</span>
                  </button>
                </div>

                {/* Lista de tarefas do dia */}
                {(() => {
                  const dayDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedCalendarDay).padStart(2, '0')}`;
                  const dayTasks = calendarTasks.filter((t) => t.date === dayDateStr);

                  if (dayTasks.length === 0) {
                    return (
                      <p style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                        Nenhuma tarefa de conciliação agendada para este dia.
                      </p>
                    );
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {dayTasks.map((task) => (
                        <div
                          key={task.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: task.done ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                            border: `1px solid ${task.done ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                            borderRadius: '6px',
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => {
                                setCalendarTasks(
                                  calendarTasks.map((t) =>
                                    t.id === task.id ? { ...t, done: !t.done } : t
                                  )
                                );
                              }}
                            />
                            <span
                              style={{
                                fontSize: '13px',
                                textDecoration: task.done ? 'line-through' : 'none',
                                color: task.done ? '#94a3b8' : '#f8fafc',
                              }}
                            >
                              {task.title}
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() => setCalendarTasks(calendarTasks.filter((t) => t.id !== task.id))}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            title="Excluir tarefa"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="bpo-modal-footer">
              <button
                type="button"
                className="bpo-btn-icon"
                onClick={() => setEditingCalendarRow(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="bpo-btn-icon"
                style={{ background: '#10b981', color: '#fff', borderColor: '#059669' }}
                onClick={async () => {
                  await updateColumn(editingCalendarRow.closingId || editingCalendarRow.id, 'reconciliationTasks', calendarTasks);
                  setEditingCalendarRow(null);
                }}
              >
                Salvar Conciliações ({calendarTasks.filter((t) => t.done).length}/{calendarTasks.length} Concluídas)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Finalização (Relatório Gerencial, Fluxo de Caixa, Análise Categoria) */}
      {editingFinalizationRow && (
        <div className="bpo-modal-overlay" onClick={() => setEditingFinalizationRow(null)}>
          <div className="bpo-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="bpo-modal-header">
              <div>
                <h3>Finalização do Fechamento BPO</h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 0' }}>
                  {editingFinalizationRow.company.name} • {MONTH_NAMES[selectedMonth - 1]} / {selectedYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFinalizationRow(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="bpo-modal-body">
              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  1. Relatório Gerencial
                </label>
                <input
                  type="text"
                  placeholder="Status da entrega, observações ou data..."
                  value={finalizationForm.gerencial || ''}
                  onChange={(e) => setFinalizationForm({ ...finalizationForm, gerencial: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  2. Fluxo de Caixa
                </label>
                <input
                  type="text"
                  placeholder="Conferência de fluxo de caixa, projeções ou status..."
                  value={finalizationForm.fluxoCaixa || ''}
                  onChange={(e) => setFinalizationForm({ ...finalizationForm, fluxoCaixa: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  3. Análise Categoria
                </label>
                <input
                  type="text"
                  placeholder="Análise de categorias de despesa/receita, alocações..."
                  value={finalizationForm.analiseCategoria || ''}
                  onChange={(e) => setFinalizationForm({ ...finalizationForm, analiseCategoria: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: '#fff',
                    fontSize: '13px',
                  }}
                />
              </div>
            </div>

            <div className="bpo-modal-footer">
              <button
                type="button"
                className="bpo-btn-icon"
                onClick={() => setEditingFinalizationRow(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="bpo-btn-icon"
                style={{ background: '#10b981', color: '#fff', borderColor: '#059669' }}
                onClick={async () => {
                  await updateColumn(editingFinalizationRow.closingId || editingFinalizationRow.id, 'finalization', finalizationForm);
                  setEditingFinalizationRow(null);
                }}
              >
                Salvar Finalização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Transferência de Responsável em Massa */}
      {isBulkResponsibleOpen && (
        <BulkAssignResponsibleModal
          isOpen={isBulkResponsibleOpen}
          onClose={() => setIsBulkResponsibleOpen(false)}
          selectedCompanyIds={selectedCompanyIds}
          companies={rows.map((r) => r.company)}
          users={users}
          defaultSector="BPO"
          currentUser={currentUser}
          onSuccess={() => {
            setSelectedCompanyIds([]);
            fetchClosings();
          }}
        />
      )}

      {/* Modal: Detalhes da Empresa */}
      {viewCompanyDetails && (
        <CompanyDetailsModal
          company={viewCompanyDetails}
          onClose={() => setViewCompanyDetails(null)}
        />
      )}
    </div>
  );
}
