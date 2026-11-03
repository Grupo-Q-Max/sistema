import React, { useState } from 'react';
import {
  X,
  Zap,
  CheckCircle2,
  MinusCircle,
  AlertTriangle,
  RotateCcw,
  Calendar,
  Building2,
  Loader2,
  Check,
  Sparkles
} from 'lucide-react';
import { API } from '../api';
import { installmentHeaders } from '../config/installments';
import { formatCompanyCode } from '../utils/codeSort';
import './BulkActionModal.css';

export interface BulkActionModalProps {
  open: boolean;
  onClose: () => void;
  selectedRows: any[];
  columns: any[];
  sector: string;
  period?: Date;
  currentUser?: any;
  onSuccess: (updatedResults: any[], message: string) => void;
}

export function BulkActionModal({
  open,
  onClose,
  selectedRows,
  columns,
  sector,
  period: _period,
  currentUser,
  onSuccess
}: BulkActionModalProps) {
  const [columnKey, setColumnKey] = useState<string>(() => {
    return columns[0]?.columnKey || columns[0]?.id || '';
  });
  const [action, setAction] = useState<'CONCLUIDO' | 'NA' | 'PENDENCIA' | 'CLEAR'>('CONCLUIDO');
  const [date, setDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [pendencyReason, setPendencyReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!open) return null;

  const activeColumns = columns.filter(col => col.isEditable !== false && col.inputType !== 'READONLY');
  const selectedColumn = activeColumns.find(col => (col.columnKey || col.id) === columnKey) || activeColumns[0];

  const eligibleClosingIds = selectedRows
    .map(r => r.id)
    .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eligibleClosingIds.length) {
      setError('Nenhum fechamento válido selecionado.');
      return;
    }
    if (!columnKey) {
      setError('Selecione a obrigação.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const headers = installmentHeaders(currentUser);
      const response = await fetch(`${API}/api/closings/bulk-action`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          closingIds: eligibleClosingIds,
          columnKey,
          action,
          date: action === 'CONCLUIDO' ? (date || new Date().toISOString()) : undefined,
          pendencyReason: action === 'PENDENCIA' ? pendencyReason : undefined,
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          userName: currentUser?.name
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar ações em massa.');
      }

      onSuccess(data.updatedResults || [], data.message || `${data.updatedCount} empresas atualizadas com sucesso!`);
      onClose();
    } catch (err: any) {
      console.error('Falha na ação em massa:', err);
      setError(err.message || 'Erro inesperado ao salvar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bulk-modal-backdrop" onClick={onClose}>
      <div className="bulk-modal-card" onClick={e => e.stopPropagation()}>
        <div className="bulk-modal-header">
          <div className="bulk-modal-title-box">
            <div className="bulk-modal-icon">
              <Zap size={22} />
            </div>
            <div>
              <h2>Ações em Massa no Fechamento</h2>
              <p>Atualize {selectedRows.length} empresa(s) simultaneamente</p>
            </div>
          </div>
          <button className="bulk-modal-close" onClick={onClose} aria-label="Fechar modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bulk-modal-body">
            {/* Lista visual das empresas selecionadas */}
            <div className="bulk-companies-preview">
              <div className="bulk-companies-header">
                <span>Empresas Selecionadas ({selectedRows.length}):</span>
                <span>{sector}</span>
              </div>
              <div className="bulk-tags-container">
                {selectedRows.slice(0, 15).map(row => (
                  <span key={row.id || row.company?.id} className="bulk-company-tag" title={row.company?.name}>
                    [{formatCompanyCode(row.company?.code)}] {row.company?.name?.slice(0, 20)}...
                  </span>
                ))}
                {selectedRows.length > 15 && (
                  <span className="bulk-company-tag" style={{ background: '#312e81', color: '#c7d2fe' }}>
                    +{selectedRows.length - 15} outras
                  </span>
                )}
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', fontSize: '0.84rem' }}>
                {error}
              </div>
            )}

            {/* 1. Escolha da Obrigação */}
            <div className="bulk-form-group">
              <label className="bulk-form-label">
                <Building2 size={15} color="#818cf8" />
                1. Selecione a Obrigação / Coluna:
              </label>
              <select
                className="bulk-select"
                value={columnKey}
                onChange={e => setColumnKey(e.target.value)}
                disabled={submitting}
              >
                {activeColumns.map(col => {
                  const key = col.columnKey || col.id;
                  return (
                    <option key={key} value={key}>
                      {col.name || key}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 2. Escolha da Ação */}
            <div className="bulk-form-group">
              <label className="bulk-form-label">
                <Zap size={15} color="#818cf8" />
                2. Selecione a Ação a Aplicar:
              </label>
              <div className="bulk-actions-grid">
                <button
                  type="button"
                  className={`bulk-action-card ${action === 'CONCLUIDO' ? 'active-concluido' : ''}`}
                  onClick={() => setAction('CONCLUIDO')}
                  disabled={submitting}
                >
                  <div className="bulk-action-card-header">
                    <CheckCircle2 size={16} color="#10b981" />
                    <span>Concluir</span>
                  </div>
                  <span className="bulk-action-card-desc">
                    Marca como concluída com a data definida
                  </span>
                </button>

                <button
                  type="button"
                  className={`bulk-action-card ${action === 'NA' ? 'active-na' : ''}`}
                  onClick={() => setAction('NA')}
                  disabled={submitting}
                >
                  <div className="bulk-action-card-header">
                    <MinusCircle size={16} color="#94a3b8" />
                    <span>Não se Aplica (N/A)</span>
                  </div>
                  <span className="bulk-action-card-desc">
                    Isenta as empresas desta obrigação
                  </span>
                </button>

                <button
                  type="button"
                  className={`bulk-action-card ${action === 'PENDENCIA' ? 'active-pendencia' : ''}`}
                  onClick={() => setAction('PENDENCIA')}
                  disabled={submitting}
                >
                  <div className="bulk-action-card-header">
                    <AlertTriangle size={16} color="#f59e0b" />
                    <span>Registrar Pendência</span>
                  </div>
                  <span className="bulk-action-card-desc">
                    Sinaliza pendência com justificativa
                  </span>
                </button>

                <button
                  type="button"
                  className={`bulk-action-card ${action === 'CLEAR' ? 'active-clear' : ''}`}
                  onClick={() => setAction('CLEAR')}
                  disabled={submitting}
                >
                  <div className="bulk-action-card-header">
                    <RotateCcw size={16} color="#3b82f6" />
                    <span>Voltar p/ Pendente</span>
                  </div>
                  <span className="bulk-action-card-desc">
                    Limpa o status e retorna para pendente
                  </span>
                </button>
              </div>
            </div>

            {/* 3. Parâmetros dinâmicos */}
            {action === 'CONCLUIDO' && (
              <div className="bulk-form-group">
                <label className="bulk-form-label">
                  <Calendar size={15} color="#10b981" />
                  Data de Conclusão:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="date"
                    className="bulk-input-text"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    disabled={submitting}
                    required
                  />
                  <button
                    type="button"
                    className="bulk-btn-clear"
                    onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                    disabled={submitting}
                  >
                    Hoje
                  </button>
                </div>
              </div>
            )}

            {action === 'PENDENCIA' && (
              <div className="bulk-form-group">
                <label className="bulk-form-label">
                  <AlertTriangle size={15} color="#f59e0b" />
                  Motivo da Pendência:
                </label>
                <textarea
                  className="bulk-textarea"
                  placeholder="Ex: Aguardando envio dos extratos fiscais pelo cliente..."
                  value={pendencyReason}
                  onChange={e => setPendencyReason(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            )}

            {/* Resumo da Execução */}
            <div className="bulk-summary-box">
              <Sparkles size={18} color="#818cf8" style={{ flexShrink: 0 }} />
              <div>
                Será aplicado <strong>{action === 'CONCLUIDO' ? 'CONCLUÍDO' : action === 'NA' ? 'N/A' : action === 'PENDENCIA' ? 'PENDÊNCIA' : 'PENDENTE'}</strong> na obrigação <strong>{selectedColumn?.name || columnKey}</strong> para <strong>{selectedRows.length} empresa(s)</strong> selecionada(s).
              </div>
            </div>
          </div>

          <div className="bulk-modal-footer">
            <button
              type="button"
              className="bulk-btn-cancel"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bulk-btn-submit"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="payroll-spin" />
                  Aplicando em lote...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Aplicar em {selectedRows.length} Empresas
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
