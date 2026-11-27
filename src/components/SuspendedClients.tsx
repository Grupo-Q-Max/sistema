import { useState, useEffect, useMemo } from 'react';
import {
  PauseCircle,
  PlayCircle,
  Building2,
  Search,
  Plus,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  X,
  Edit2,
  FileText,
  Clock,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { API } from '../api';
import type { CurrentUser } from '../types/auth';
import { formatCompanyCode } from '../utils/codeSort';
import { formatRegimeLabel } from './CompanyDetailsModal';
import './SuspendedClients.css';

interface SuspendedClientsProps {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser?: CurrentUser | null;
  onLogout?: () => void;
}

interface SuspendedCompany {
  id: string;
  code: string | null;
  name: string;
  tradeName?: string | null;
  cnpj: string;
  taxRegime: string;
  city?: string | null;
  groupName?: string | null;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  responsibles?: Array<{
    sector: string;
    user: { id: string; name: string | null; email: string; role: string };
  }>;
}

export function SuspendedClients({
  currentView,
  onNavigate,
  currentUser,
  onLogout,
}: SuspendedClientsProps) {
  const [list, setList] = useState<SuspendedCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal de Nova Suspensão
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [allCompanies, setAllCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [suspendDate, setSuspendDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [suspendReason, setSuspendReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Modal de Edição de Motivo
  const [editingCompany, setEditingCompany] = useState<SuspendedCompany | null>(null);
  const [editReason, setEditReason] = useState('');
  const [editDate, setEditDate] = useState('');

  // Modal de Confirmação de Reativação
  const [reactivatingCompany, setReactivatingCompany] = useState<SuspendedCompany | null>(null);
  const [reactivating, setReactivating] = useState(false);

  const fetchSuspended = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API}/api/companies/suspended`);
      if (!res.ok) throw new Error('Não foi possível carregar empresas suspensas.');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar lista de suspensos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuspended();
  }, []);

  const loadAllCompanies = async () => {
    try {
      const res = await fetch(`${API}/api/companies`);
      if (res.ok) {
        const data = await res.json();
        const activeOnly = (Array.isArray(data) ? data : []).filter(
          (c: any) => !c.exitDate && !c.isSuspended
        );
        setAllCompanies(activeOnly);
      }
    } catch {}
  };

  const handleOpenSuspendModal = () => {
    setSelectedCompanyId('');
    setSuspendDate(new Date().toISOString().slice(0, 10));
    setSuspendReason('');
    setModalError('');
    setIsSuspendModalOpen(true);
    loadAllCompanies();
  };

  const handleConfirmSuspend = async () => {
    if (!selectedCompanyId) {
      setModalError('Selecione a empresa para suspender.');
      return;
    }
    if (!suspendReason.trim()) {
      setModalError('Informe o motivo da suspensão.');
      return;
    }
    try {
      setSubmitting(true);
      setModalError('');
      const res = await fetch(`${API}/api/companies/${selectedCompanyId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: suspendReason.trim(),
          date: suspendDate,
          userId: currentUser?.id,
          userName: currentUser?.name,
          userEmail: currentUser?.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao suspender empresa.');
      setIsSuspendModalOpen(false);
      await fetchSuspended();
      window.dispatchEvent(new CustomEvent('company-suspended-updated'));
    } catch (err: any) {
      setModalError(err?.message || 'Erro ao processar suspensão.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReactivate = async () => {
    if (!reactivatingCompany) return;
    try {
      setReactivating(true);
      const res = await fetch(`${API}/api/companies/${reactivatingCompany.id}/unsuspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser?.id,
          userName: currentUser?.name,
          userEmail: currentUser?.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao reativar empresa.');
      setReactivatingCompany(null);
      await fetchSuspended();
      window.dispatchEvent(new CustomEvent('company-suspended-updated'));
    } catch (err: any) {
      alert(err?.message || 'Erro ao reativar empresa.');
    } finally {
      setReactivating(false);
    }
  };

  const handleSaveEditReason = async () => {
    if (!editingCompany) return;
    try {
      setSubmitting(true);
      const res = await fetch(`${API}/api/companies/${editingCompany.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSuspended: true,
          suspendedReason: editReason.trim(),
          suspendedAt: editDate ? new Date(editDate) : editingCompany.suspendedAt,
          userId: currentUser?.id,
          userName: currentUser?.name,
          userEmail: currentUser?.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar motivo.');
      setEditingCompany(null);
      await fetchSuspended();
      window.dispatchEvent(new CustomEvent('company-suspended-updated'));
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar alterações.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(term);
      const tradeMatch = c.tradeName?.toLowerCase().includes(term);
      const cnpjMatch = c.cnpj.includes(term);
      const codeMatch = c.code?.toLowerCase().includes(term);
      const reasonMatch = c.suspendedReason?.toLowerCase().includes(term);
      const groupMatch = c.groupName?.toLowerCase().includes(term);
      return nameMatch || tradeMatch || cnpjMatch || codeMatch || reasonMatch || groupMatch;
    });
  }, [list, searchTerm]);

  const presetReasons = [
    'Inadimplência contratual',
    'Solicitação do cliente',
    'Bloqueio cadastral temporário',
    'Pendência de documentação',
    'Empresa inativa / sem movimento a pedido',
  ];

  return (
    <div className="crm-dashboard">
      <Sidebar
        currentView={currentView}
        onNavigate={onNavigate}
        currentUser={currentUser}
        onLogout={onLogout}
      />

      <main className="crm-main">
        <header className="crm-header">
          <div className="page-header">
            <h1>
              <PauseCircle size={26} color="#f59e0b" />
              Clientes com Serviços Suspensos
              <span className="suspended-badge-count">{list.length} suspenso(s)</span>
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Empresas com prestação de serviços suspensa. Elas continuam visíveis nos fechamentos,
              porém com indicativo de suspensão e bloqueio de preenchimento.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn-primary-gradient"
              onClick={handleOpenSuspendModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                background: 'linear-gradient(135deg, #d97706, #f59e0b)',
                color: '#fff',
                borderRadius: '8px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Plus size={18} />
              Suspender Novo Cliente
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="suspended-page-container">
            {/* KPI Cards */}
            <div className="suspended-stats-grid">
              <div className="suspended-stat-card">
                <div
                  className="suspended-stat-icon"
                  style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}
                >
                  <PauseCircle size={24} />
                </div>
                <div className="suspended-stat-info">
                  <strong>{list.length}</strong>
                  <span>Total de Clientes Suspensos</span>
                </div>
              </div>

              <div className="suspended-stat-card">
                <div
                  className="suspended-stat-icon"
                  style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}
                >
                  <CheckCircle2 size={24} />
                </div>
                <div className="suspended-stat-info">
                  <strong>Bloqueados</strong>
                  <span>Nos Fechamentos Fiscal, DP e Contábil</span>
                </div>
              </div>

              <div className="suspended-stat-card">
                <div
                  className="suspended-stat-icon"
                  style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}
                >
                  <FileText size={24} />
                </div>
                <div className="suspended-stat-info">
                  <strong>Reativação Direta</strong>
                  <span>Restaura permissão de edição em 1 clique</span>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            <div className="suspended-toolbar-card">
              <div className="suspended-search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Buscar por Razão Social, CNPJ, Código, Grupo ou Motivo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Tabela de Suspensos */}
            <div className="suspended-table-container">
              {loading ? (
                <div className="suspended-empty-state">
                  <Clock size={32} color="#f59e0b" style={{ animation: 'spin 1.5s linear infinite' }} />
                  <p>Carregando clientes suspensos...</p>
                </div>
              ) : error ? (
                <div className="suspended-empty-state" style={{ color: '#ef4444' }}>
                  <AlertTriangle size={32} />
                  <p>{error}</p>
                </div>
              ) : filteredList.length === 0 ? (
                <div className="suspended-empty-state">
                  <PauseCircle size={40} color="#64748b" />
                  <h3>Nenhum cliente suspenso encontrado</h3>
                  <p>
                    {searchTerm
                      ? 'Nenhum resultado para os termos da busca.'
                      : 'Não há empresas com prestação de serviços suspensa no momento.'}
                  </p>
                </div>
              ) : (
                <div className="suspended-table-responsive">
                  <table className="suspended-table">
                    <thead>
                      <tr>
                        <th>CÓDIGO</th>
                        <th>EMPRESA / RAZÃO SOCIAL</th>
                        <th>CNPJ</th>
                        <th>TRIBUTAÇÃO</th>
                        <th>DATA SUSPENSÃO</th>
                        <th>MOTIVO DA SUSPENSÃO</th>
                        <th>AÇÕES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredList.map((c) => {
                        const dateFormatted = c.suspendedAt
                          ? new Date(c.suspendedAt).toLocaleDateString('pt-BR', {
                              timeZone: 'UTC',
                            })
                          : '—';
                        return (
                          <tr key={c.id}>
                            <td>
                              <span className="company-code-badge">
                                {formatCompanyCode(c.code) || '—'}
                              </span>
                            </td>
                            <td>
                              <div className="company-name-cell">
                                <Building2 size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                                <div>
                                  <strong className="comp-name-title">{c.name}</strong>
                                  {c.tradeName && (
                                    <span className="comp-trade-subtitle">{c.tradeName}</span>
                                  )}
                                  {c.groupName && (
                                    <span className="comp-group-pill">{c.groupName}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className="cnpj-badge">{c.cnpj}</span>
                            </td>
                            <td>
                              <span className="tax-regime-badge">
                                {formatRegimeLabel(c.taxRegime)}
                              </span>
                            </td>
                            <td>
                              <span className="date-badge">
                                <Calendar size={13} style={{ marginRight: 4 }} />
                                {dateFormatted}
                              </span>
                            </td>
                            <td>
                              <div
                                className="reason-cell"
                                title={c.suspendedReason || 'Sem motivo informado'}
                              >
                                {c.suspendedReason || '—'}
                              </div>
                            </td>
                            <td>
                              <div className="actions-cell">
                                <button
                                  type="button"
                                  className="btn-action-edit"
                                  title="Editar motivo e data da suspensão"
                                  onClick={() => {
                                    setEditingCompany(c);
                                    setEditReason(c.suspendedReason || '');
                                    setEditDate(
                                      c.suspendedAt
                                        ? new Date(c.suspendedAt).toISOString().slice(0, 10)
                                        : ''
                                    );
                                  }}
                                >
                                  <Edit2 size={14} />
                                  <span>Editar</span>
                                </button>

                                <button
                                  type="button"
                                  className="btn-action-reactivate"
                                  title="Reativar empresa e liberar edição nos fechamentos"
                                  onClick={() => setReactivatingCompany(c)}
                                >
                                  <PlayCircle size={15} />
                                  <span>Reativar</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal para Suspender Cliente */}
        {isSuspendModalOpen && (
          <div className="closing-modal-backdrop" onClick={() => !submitting && setIsSuspendModalOpen(false)}>
            <div
              className="closing-modal-content suspended-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="closing-modal-header">
                <div className="closing-modal-title orange">
                  <PauseCircle size={20} />
                  Suspender Prestação de Serviços
                </div>
                <button
                  type="button"
                  className="closing-modal-close-btn"
                  disabled={submitting}
                  onClick={() => setIsSuspendModalOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="closing-modal-body">
                <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: 0 }}>
                  A empresa selecionada continuará aparecendo nas tabelas de fechamento (Fiscal, DP e
                  Contábil) com a tag <strong>SUSPENSO</strong> e terá o preenchimento bloqueado até
                  ser reativada.
                </p>

                {modalError && (
                  <div className="alert-error-box" role="alert">
                    <AlertTriangle size={16} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="form-field-group">
                  <label>
                    Selecione a Empresa <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    className="modal-select"
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">-- Escolha uma empresa ativa --</option>
                    {allCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatCompanyCode(c.code) ? `[${formatCompanyCode(c.code)}] ` : ''}
                        {c.name} ({c.cnpj})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field-group">
                  <label>Data de Início da Suspensão</label>
                  <input
                    type="date"
                    className="modal-input"
                    value={suspendDate}
                    onChange={(e) => setSuspendDate(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="form-field-group">
                  <label>
                    Motivo da Suspensão <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div className="preset-reasons-wrap">
                    {presetReasons.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="preset-btn"
                        onClick={() => setSuspendReason(preset)}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="modal-textarea"
                    rows={4}
                    placeholder="Descreva a justificativa para suspensão de serviços..."
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="sub-modal-actions">
                  <button
                    type="button"
                    className="btn-secondary-light"
                    disabled={submitting}
                    onClick={() => setIsSuspendModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-confirm-suspend"
                    disabled={submitting}
                    onClick={handleConfirmSuspend}
                  >
                    {submitting ? 'Suspendendo...' : 'Confirmar Suspensão'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Confirmação de Reativação */}
        {reactivatingCompany && (
          <div className="closing-modal-backdrop" onClick={() => !reactivating && setReactivatingCompany(null)}>
            <div
              className="closing-modal-content suspended-modal-small"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="closing-modal-header">
                <div className="closing-modal-title green">
                  <PlayCircle size={20} />
                  Reativar Empresa
                </div>
                <button
                  type="button"
                  className="closing-modal-close-btn"
                  disabled={reactivating}
                  onClick={() => setReactivatingCompany(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="closing-modal-body">
                <p style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: 1.5 }}>
                  Deseja realmente reativar a prestação de serviços para a empresa{' '}
                  <strong>{reactivatingCompany.name}</strong>?
                </p>
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>
                  Ao reativar, a etiqueta de suspensão será removida e as edições nos controles de
                  fechamento serão liberadas novamente para os responsáveis.
                </p>

                <div className="sub-modal-actions">
                  <button
                    type="button"
                    className="btn-secondary-light"
                    disabled={reactivating}
                    onClick={() => setReactivatingCompany(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-confirm-reactivate"
                    disabled={reactivating}
                    onClick={handleConfirmReactivate}
                  >
                    {reactivating ? 'Reativando...' : 'Reativar Empresa Agora'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Edição de Motivo */}
        {editingCompany && (
          <div className="closing-modal-backdrop" onClick={() => !submitting && setEditingCompany(null)}>
            <div
              className="closing-modal-content suspended-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="closing-modal-header">
                <div className="closing-modal-title orange">
                  <Edit2 size={20} />
                  Editar Motivo da Suspensão
                </div>
                <button
                  type="button"
                  className="closing-modal-close-btn"
                  disabled={submitting}
                  onClick={() => setEditingCompany(null)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="closing-modal-body">
                <p style={{ color: '#e2e8f0', fontWeight: 600, margin: '0 0 14px' }}>
                  {editingCompany.name}
                </p>

                <div className="form-field-group">
                  <label>Data da Suspensão</label>
                  <input
                    type="date"
                    className="modal-input"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="form-field-group">
                  <label>Motivo da Suspensão</label>
                  <textarea
                    className="modal-textarea"
                    rows={4}
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="sub-modal-actions">
                  <button
                    type="button"
                    className="btn-secondary-light"
                    disabled={submitting}
                    onClick={() => setEditingCompany(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary-gradient"
                    disabled={submitting}
                    onClick={handleSaveEditReason}
                  >
                    {submitting ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
