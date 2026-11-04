import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Sparkles,
  Filter,
  CheckCheck,
  RotateCcw,
  Layers,
  Database
} from 'lucide-react';
import { API } from '../api';
import './DominioStagingModal.css';

interface StagingItem {
  id: string;
  companyId?: string | null;
  companyCode?: string | null;
  companyName: string;
  sector: 'CONTABIL' | 'FISCAL' | 'DP';
  referencePeriod: string;
  columnKey: string;
  columnLabel: string;
  currentValue?: string | null;
  proposedValue: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  sourceFile?: string | null;
  createdAt: string;
  approvedBy?: string | null;
}

interface DominioStagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DominioStagingModal({ isOpen, onClose, onSuccess }: DominioStagingModalProps) {
  const [items, setItems] = useState<StagingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sectorFilter, setSectorFilter] = useState<'ALL' | 'CONTABIL' | 'FISCAL' | 'DP'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const url = `${API}/api/dominio-staging?status=${statusFilter}${sectorFilter !== 'ALL' ? `&sector=${sectorFilter}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      console.error('Erro ao buscar fila de conciliação do Domínio:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchItems();
      setSelectedIds(new Set());
    }
  }, [isOpen, sectorFilter, statusFilter]);

  if (!isOpen) return null;

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = new Set(items.map(item => item.id));
      setSelectedIds(allIds);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleApprove = async (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedIds);
    if (targetIds.length === 0) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/dominio-staging/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `${targetIds.length} alteração(ões) aprovada(s)!`);
        fetchItems();
        setSelectedIds(new Set());
        if (onSuccess) onSuccess();
        window.dispatchEvent(new CustomEvent('dominio-staging-updated'));
      }
    } catch {
      showToast('Erro ao aprovar alterações.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedIds);
    if (targetIds.length === 0) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/dominio-staging/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: targetIds })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || `${targetIds.length} alteração(ões) rejeitada(s).`);
        fetchItems();
        setSelectedIds(new Set());
        if (onSuccess) onSuccess();
        window.dispatchEvent(new CustomEvent('dominio-staging-updated'));
      }
    } catch {
      showToast('Erro ao rejeitar alterações.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSeedSample = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API}/api/dominio-staging/seed-sample`, { method: 'POST' });
      if (res.ok) {
        showToast('Dados de teste do Domínio criados com sucesso!');
        fetchItems();
        window.dispatchEvent(new CustomEvent('dominio-staging-updated'));
      }
    } catch {
      showToast('Erro ao gerar dados de teste.');
    } finally {
      setActionLoading(false);
    }
  };

  const getSectorBadgeClass = (s: string) => {
    if (s === 'CONTABIL') return 'badge-contabil';
    if (s === 'FISCAL') return 'badge-fiscal';
    return 'badge-dp';
  };

  return (
    <div className="dominio-staging-overlay" onClick={onClose}>
      <div className="dominio-staging-modal" onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className="dominio-staging-header">
          <div className="dominio-staging-title-group">
            <div className="dominio-staging-icon-wrapper">
              <Database size={24} className="text-amber-400" />
            </div>
            <div>
              <div className="dominio-staging-title">
                Central de Aprovação do Domínio
                <span className="dominio-staging-badge">
                  {items.filter(i => i.status === 'PENDING').length} pendentes
                </span>
              </div>
              <div className="dominio-staging-subtitle">
                Compare as informações detectadas no backup do Domínio antes de aplicá-las ao Fechamento Pro.
              </div>
            </div>
          </div>
          <button className="dominio-staging-close" onClick={onClose} title="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* TOAST FEEDBACK */}
        {toastMessage && (
          <div className="dominio-staging-toast">
            <Sparkles size={16} />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* CONTROLES / FILTROS */}
        <div className="dominio-staging-toolbar">
          <div className="dominio-staging-filters">
            <span className="dominio-filter-label"><Filter size={14} /> Setor:</span>
            <button
              className={`dominio-filter-btn ${sectorFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setSectorFilter('ALL')}
            >
              Todos
            </button>
            <button
              className={`dominio-filter-btn ${sectorFilter === 'CONTABIL' ? 'active' : ''}`}
              onClick={() => setSectorFilter('CONTABIL')}
            >
              Contábil
            </button>
            <button
              className={`dominio-filter-btn ${sectorFilter === 'FISCAL' ? 'active' : ''}`}
              onClick={() => setSectorFilter('FISCAL')}
            >
              Fiscal
            </button>
            <button
              className={`dominio-filter-btn ${sectorFilter === 'DP' ? 'active' : ''}`}
              onClick={() => setSectorFilter('DP')}
            >
              DP
            </button>

            <span className="dominio-filter-label" style={{ marginLeft: 16 }}><Clock size={14} /> Status:</span>
            <button
              className={`dominio-filter-btn ${statusFilter === 'PENDING' ? 'active' : ''}`}
              onClick={() => setStatusFilter('PENDING')}
            >
              Pendentes
            </button>
            <button
              className={`dominio-filter-btn ${statusFilter === 'APPROVED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('APPROVED')}
            >
              Aprovados
            </button>
            <button
              className={`dominio-filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              Histórico Completo
            </button>
          </div>

          <div className="dominio-staging-actions">
            {statusFilter === 'PENDING' && (
              <>
                <button
                  className="btn-staging-approve"
                  disabled={selectedIds.size === 0 || actionLoading}
                  onClick={() => handleApprove()}
                >
                  <CheckCircle2 size={16} />
                  Aprovar Selecionados ({selectedIds.size})
                </button>
                <button
                  className="btn-staging-reject"
                  disabled={selectedIds.size === 0 || actionLoading}
                  onClick={() => handleReject()}
                >
                  <XCircle size={16} />
                  Rejeitar Selecionados
                </button>
              </>
            )}
            <button
              className="btn-staging-refresh"
              onClick={fetchItems}
              disabled={loading}
              title="Atualizar lista"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        {/* TABELA DE CONCILIAÇÃO */}
        <div className="dominio-staging-content">
          {loading ? (
            <div className="dominio-staging-empty">
              <RotateCcw size={32} className="animate-spin text-cyan-400" />
              <p>Carregando alterações do Domínio...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="dominio-staging-empty">
              <CheckCheck size={48} className="text-emerald-400" />
              <h3>Tudo em dia! Nenhuma alteração pendente.</h3>
              <p>O Fechamento Pro está 100% conciliado com o backup mais recente do Sistema Domínio.</p>
              <button className="btn-staging-seed" onClick={handleSeedSample} disabled={actionLoading}>
                <Sparkles size={16} />
                Gerar Exemplo de Alterações para Testar
              </button>
            </div>
          ) : (
            <table className="dominio-staging-table">
              <thead>
                <tr>
                  {statusFilter === 'PENDING' && (
                    <th style={{ width: 40, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.size === items.length && items.length > 0}
                        onChange={handleSelectAll}
                      />
                    </th>
                  )}
                  <th>Empresa</th>
                  <th>Setor</th>
                  <th>Competência</th>
                  <th>Coluna / Campo</th>
                  <th>No Fechamento Pro (Atual)</th>
                  <th></th>
                  <th>No Sistema Domínio (Novo)</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <tr key={item.id} className={isSelected ? 'selected-row' : ''}>
                      {statusFilter === 'PENDING' && (
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(item.id)}
                          />
                        </td>
                      )}
                      <td>
                        <div className="dominio-company-cell">
                          <span className="dominio-company-code">#{item.companyCode || '-'}</span>
                          <span className="dominio-company-name">{item.companyName}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`sector-tag ${getSectorBadgeClass(item.sector)}`}>
                          {item.sector}
                        </span>
                      </td>
                      <td>
                        <span className="period-tag">{item.referencePeriod}</span>
                      </td>
                      <td>
                        <span className="column-label-tag">{item.columnLabel}</span>
                      </td>
                      <td>
                        <span className="val-current">
                          {item.currentValue ? item.currentValue : <em style={{ opacity: 0.5 }}>Vazio / Não preenchido</em>}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', width: 30 }}>
                        <ArrowRight size={14} className="text-slate-500" />
                      </td>
                      <td>
                        <span className="val-proposed">{item.proposedValue}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {item.status === 'PENDING' ? (
                          <div className="row-action-btns">
                            <button
                              className="btn-icon-approve"
                              title="Aprovar e Integrar ao Fechamento"
                              onClick={() => handleApprove([item.id])}
                              disabled={actionLoading}
                            >
                              <CheckCircle2 size={18} />
                            </button>
                            <button
                              className="btn-icon-reject"
                              title="Rejeitar Alteração"
                              onClick={() => handleReject([item.id])}
                              disabled={actionLoading}
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                        ) : item.status === 'APPROVED' ? (
                          <span className="status-badge approved">Aprovado</span>
                        ) : (
                          <span className="status-badge rejected">Rejeitado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* FOOTER */}
        <div className="dominio-staging-footer">
          <div className="dominio-staging-info">
            <Layers size={16} />
            <span>
              Origem dos dados: <strong>{items[0]?.sourceFile || 'Backup do Domínio (.dom)'}</strong>
            </span>
          </div>
          <button className="btn-staging-close" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
