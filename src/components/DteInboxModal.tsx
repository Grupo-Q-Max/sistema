import React, { useState, useEffect } from 'react';
import {
  MailWarning,
  X,
  Plus,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { API, authHeaders } from '../api';
import './DteInboxModal.css';

interface DteNotification {
  id: string;
  companyId?: string | null;
  companyName: string;
  agency: string;
  subject: string;
  processNumber?: string | null;
  notificationDate: string;
  deadlineDate: string;
  notes?: string | null;
  priority: 'CRITICA' | 'ALTA' | 'NORMAL';
  status: 'PENDENTE' | 'EM_ANALISE' | 'RESPONDIDO' | 'CONCLUIDO';
  createdAt: string;
}

interface DteInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: any;
}

export const DteInboxModal: React.FC<DteInboxModalProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<DteNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');

  // Form states
  const [isCreating, setIsCreating] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [agency, setAgency] = useState('Receita Federal (e-CAC)');
  const [subject, setSubject] = useState('');
  const [processNumber, setProcessNumber] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'CRITICA' | 'ALTA' | 'NORMAL'>('ALTA');
  const [submitting, setSubmitting] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/dte-notifications`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error('Erro ao buscar notificações DTE:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !subject.trim() || !deadlineDate) {
      alert('Preencha os campos obrigatórios da notificação.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/dte-notifications`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          companyName,
          agency,
          subject,
          processNumber,
          deadlineDate,
          notes,
          priority,
        }),
      });

      if (res.ok) {
        setIsCreating(false);
        setCompanyName('');
        setSubject('');
        setProcessNumber('');
        setDeadlineDate('');
        setNotes('');
        await fetchNotifications();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao registrar notificação.');
      }
    } catch (err) {
      console.error(err);
      alert('Falha de conexão ao salvar notificação.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`${API}/api/dte-notifications/${id}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, status: newStatus as any } : n))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta notificação do DTE?')) return;
    try {
      const res = await fetch(`${API}/api/dte-notifications/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Cálculo de dias restantes
  const getDaysRemaining = (deadline: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(deadline + 'T00:00:00');
    const diffTime = target.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const filtered = notifications.filter((n) => {
    const matchesSearch =
      n.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.processNumber && n.processNumber.includes(searchTerm));
    const matchesStatus = filterStatus === 'TODOS' || n.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = notifications.filter((n) => n.status !== 'CONCLUIDO').length;
  const criticalCount = notifications.filter(
    (n) => n.status !== 'CONCLUIDO' && getDaysRemaining(n.deadlineDate) <= 5
  ).length;

  return (
    <div className="dte-modal-overlay" onClick={onClose}>
      <div className="dte-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dte-modal-header">
          <div className="dte-header-title">
            <div className="dte-icon-box">
              <MailWarning size={22} color="#f59e0b" />
            </div>
            <div>
              <h3>Guardião do DTE & Intimações Eletrônicas</h3>
              <p>Monitoramento de prazos, notificações e termos de exclusão (e-CAC / SEFAZ)</p>
            </div>
          </div>
          <button className="dte-btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Top Stats */}
        <div className="dte-stats-bar">
          <div className="dte-stat-card">
            <Clock size={18} color="#38bdf8" />
            <div>
              <span className="dte-stat-lbl">Pendências Ativas</span>
              <strong className="dte-stat-num">{pendingCount}</strong>
            </div>
          </div>

          <div className="dte-stat-card critical">
            <AlertTriangle size={18} color="#ef4444" />
            <div>
              <span className="dte-stat-lbl">Prazos Críticos (≤ 5 dias)</span>
              <strong className="dte-stat-num" style={{ color: '#f87171' }}>
                {criticalCount}
              </strong>
            </div>
          </div>

          <div className="dte-stat-card">
            <CheckCircle2 size={18} color="#10b981" />
            <div>
              <span className="dte-stat-lbl">Total Registrado</span>
              <strong className="dte-stat-num">{notifications.length}</strong>
            </div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="dte-toolbar">
          <div className="dte-search-wrap">
            <Search size={15} color="#64748b" />
            <input
              type="text"
              placeholder="Buscar por empresa, assunto ou processo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="dte-filter-group">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="TODOS">Todos os Status</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="EM_ANALISE">Em Análise</option>
              <option value="RESPONDIDO">Respondidos</option>
              <option value="CONCLUIDO">Concluídos</option>
            </select>

            <button
              type="button"
              className="dte-btn-add"
              onClick={() => setIsCreating(!isCreating)}
            >
              <Plus size={16} />
              <span>{isCreating ? 'Cancelar' : 'Nova Intimação'}</span>
            </button>
          </div>
        </div>

        {/* Form to Register Notification */}
        {isCreating && (
          <form className="dte-create-form" onSubmit={handleCreate}>
            <div className="dte-form-grid">
              <div className="dte-field">
                <label>Razão Social / Nome da Empresa *</label>
                <input
                  type="text"
                  placeholder="Ex: Alfa Comércio Ltda"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              </div>

              <div className="dte-field">
                <label>Órgão Fiscalizador *</label>
                <select value={agency} onChange={(e) => setAgency(e.target.value)}>
                  <option value="Receita Federal (e-CAC)">Receita Federal (e-CAC)</option>
                  <option value="PGFN (Dívida Ativa)">PGFN (Dívida Ativa)</option>
                  <option value="SEFAZ Estadual (DEC)">SEFAZ Estadual (DEC)</option>
                  <option value="Prefeitura Municipal">Prefeitura Municipal</option>
                  <option value="Ministério do Trabalho">Ministério do Trabalho</option>
                </select>
              </div>

              <div className="dte-field" style={{ gridColumn: 'span 2' }}>
                <label>Assunto / Motivo da Intimação *</label>
                <input
                  type="text"
                  placeholder="Ex: Termo de Exclusão do Simples por Débito ou Divergência DCTFWeb"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div className="dte-field">
                <label>Nº do Processo / Termo</label>
                <input
                  type="text"
                  placeholder="Ex: 10880.720192/2026-44"
                  value={processNumber}
                  onChange={(e) => setProcessNumber(e.target.value)}
                />
              </div>

              <div className="dte-field">
                <label>Data Limite para Resposta / Regularização *</label>
                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  required
                />
              </div>

              <div className="dte-field">
                <label>Prioridade da Notificação</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                  <option value="CRITICA">Crítica (Risco de Exclusão / Multa)</option>
                  <option value="ALTA">Alta</option>
                  <option value="NORMAL">Normal</option>
                </select>
              </div>

              <div className="dte-field" style={{ gridColumn: 'span 2' }}>
                <label>Observações / Plano de Ação</label>
                <input
                  type="text"
                  placeholder="Ex: Levantar guias não pagas e parcelar antes do vencimento do prazo"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="dte-form-actions">
              <button
                type="button"
                className="dte-btn-cancel"
                onClick={() => setIsCreating(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="dte-btn-save" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Cadastrar Intimação'}
              </button>
            </div>
          </form>
        )}

        {/* Notifications Table */}
        <div className="dte-table-wrap">
          <table className="dte-table">
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Órgão & Assunto</th>
                <th>Prazo Limite</th>
                <th>Tempo Restante</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px auto' }} />
                    <p>Carregando intimações do DTE...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                    Nenhuma intimação fiscal registrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const days = getDaysRemaining(item.deadlineDate);
                  const isExpired = days < 0;
                  const isCritical = days >= 0 && days <= 5;

                  return (
                    <tr key={item.id} className={item.status === 'CONCLUIDO' ? 'row-done' : ''}>
                      <td>
                        <div className="dte-comp-cell">
                          <Building2 size={14} color="#38bdf8" />
                          <strong>{item.companyName}</strong>
                        </div>
                      </td>
                      <td>
                        <div className="dte-subject-cell">
                          <span className="dte-agency-tag">{item.agency}</span>
                          <span className="dte-subject-text">{item.subject}</span>
                          {item.processNumber && (
                            <small className="dte-proc-num">Proc: {item.processNumber}</small>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="dte-date-cell">
                          <Calendar size={13} color="#94a3b8" />
                          <span>
                            {new Date(item.deadlineDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </td>
                      <td>
                        {item.status === 'CONCLUIDO' ? (
                          <span className="dte-countdown-badge done">Concluído</span>
                        ) : isExpired ? (
                          <span className="dte-countdown-badge expired">VENCIDO!</span>
                        ) : isCritical ? (
                          <span className="dte-countdown-badge critical">
                            🚨 {days} dia{days === 1 ? '' : 's'} restante{days === 1 ? '' : 's'}!
                          </span>
                        ) : (
                          <span className="dte-countdown-badge normal">
                            {days} dia{days === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          className="dte-status-select"
                          value={item.status}
                          onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                        >
                          <option value="PENDENTE">Pendente</option>
                          <option value="EM_ANALISE">Em Análise</option>
                          <option value="RESPONDIDO">Respondido</option>
                          <option value="CONCLUIDO">Concluído</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="dte-btn-delete"
                          onClick={() => handleDelete(item.id)}
                          title="Excluir notificação"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
