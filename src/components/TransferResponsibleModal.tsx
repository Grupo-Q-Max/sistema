import { useState, useEffect, type FormEvent } from 'react';
import { ArrowRightLeft, X, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { API } from '../api';
import { ButtonSpinner } from './LoadingSkeleton';
import type { CurrentUser } from '../types/auth';
import './TransferResponsibleModal.css';

export interface TransferResponsibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: Array<{ id: string; name?: string; email?: string; role?: string; active?: boolean }>;
  initialFromUserId?: string;
  initialSector?: 'FISCAL' | 'DP' | 'CONTABIL' | 'ALL';
  onSuccess: (count: number, fromName: string, toName: string, sectorLabel: string) => void;
  currentUser?: CurrentUser | null;
}

const SECTOR_OPTIONS = [
  { value: 'FISCAL', label: 'Fiscal' },
  { value: 'DP', label: 'Departamento Pessoal (DP)' },
  { value: 'CONTABIL', label: 'Contábil' },
  { value: 'ALL', label: 'Todos os Setores (Geral)' },
];

export function TransferResponsibleModal({
  isOpen,
  onClose,
  users,
  initialFromUserId,
  initialSector = 'FISCAL',
  onSuccess,
  currentUser,
}: TransferResponsibleModalProps) {
  const [fromUserId, setFromUserId] = useState<string>(initialFromUserId || '');
  const [toUserId, setToUserId] = useState<string>('');
  const [sector, setSector] = useState<string>(initialSector);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialFromUserId) setFromUserId(initialFromUserId);
      if (initialSector) setSector(initialSector);
      setError(null);
    }
  }, [isOpen, initialFromUserId, initialSector]);

  // Consulta prévia da quantidade de empresas quando fromUserId ou sector mudam
  useEffect(() => {
    if (!isOpen || !fromUserId) {
      setPreviewCount(null);
      return;
    }

    let active = true;
    setPreviewLoading(true);

    fetch(`${API}/api/responsibles/transfer/preview?fromUserId=${fromUserId}&sector=${sector}`)
      .then((res) => res.json())
      .then((data) => {
        if (active) {
          setPreviewCount(typeof data.count === 'number' ? data.count : 0);
        }
      })
      .catch(() => {
        if (active) setPreviewCount(null);
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, fromUserId, sector]);

  if (!isOpen) return null;

  const fromUser = users.find((u) => u.id === fromUserId);
  const toUser = users.find((u) => u.id === toUserId);
  const sectorMeta = SECTOR_OPTIONS.find((s) => s.value === sector);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!fromUserId) {
      setError('Selecione o colaborador de origem.');
      return;
    }
    if (!toUserId) {
      setError('Selecione o colaborador de destino.');
      return;
    }
    if (fromUserId === toUserId) {
      setError('O colaborador de origem e destino não podem ser o mesmo.');
      return;
    }
    if (previewCount === 0) {
      setError(`O colaborador ${fromUser?.name || fromUser?.email} não possui nenhuma empresa para transferir neste setor.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/responsibles/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromUserId,
          toUserId,
          sector: sector || null,
          actorId: currentUser?.id,
          actorEmail: currentUser?.email,
          actorName: currentUser?.name || currentUser?.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao transferir responsabilidades.');
      }

      onSuccess(
        data.count,
        fromUser?.name || fromUser?.email || 'Origem',
        toUser?.name || toUser?.email || 'Destino',
        sectorMeta?.label || 'Setor'
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro inesperado ao transferir.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="transfer-resp-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="transfer-resp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="transfer-resp-header">
          <div className="transfer-resp-title-group">
            <div className="transfer-resp-icon-box">
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <h3>Transferir Carteira de Responsável</h3>
              <p className="transfer-resp-subtitle">
                Transfira todas as empresas de um colaborador para outro diretamente
              </p>
            </div>
          </div>
          <button type="button" className="transfer-resp-close-btn" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="transfer-resp-body">
          {error && (
            <div className="transfer-resp-error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Campo Setor */}
          <div className="transfer-resp-field">
            <label htmlFor="transfer-sector">Setor de Atuação</label>
            <select
              id="transfer-sector"
              value={sector}
              onChange={(e) => setSector(e.target.value as any)}
              disabled={submitting}
            >
              {SECTOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Comparativo De -> Para */}
          <div className="transfer-resp-users-grid">
            <div className="transfer-resp-field">
              <label htmlFor="transfer-from">De (Colaborador Atual)</label>
              <select
                id="transfer-from"
                value={fromUserId}
                onChange={(e) => setFromUserId(e.target.value)}
                disabled={submitting}
              >
                <option value="">Selecione quem sairá...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.id === toUserId}>
                    {u.name || u.email} {u.active === false ? '(Inativo)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="transfer-resp-arrow-divider">
              <ArrowRight size={20} />
            </div>

            <div className="transfer-resp-field">
              <label htmlFor="transfer-to">Para (Novo Responsável)</label>
              <select
                id="transfer-to"
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                disabled={submitting}
              >
                <option value="">Selecione o novo responsável...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.id === fromUserId || u.active === false}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Resumo da Operação */}
          {fromUserId && (
            <div className={`transfer-resp-summary-card ${previewCount === 0 ? 'empty' : 'ready'}`}>
              <div className="transfer-resp-summary-header">
                <CheckCircle2 size={16} />
                <span>Impacto da Transferência</span>
              </div>
              <p className="transfer-resp-summary-text">
                {previewLoading ? (
                  <span>Calculando total de empresas vinculadas...</span>
                ) : previewCount !== null ? (
                  previewCount > 0 ? (
                    <>
                      Serão transferidas <strong>{previewCount} empresa{previewCount > 1 ? 's' : ''}</strong> do setor{' '}
                      <strong>{sectorMeta?.label}</strong> de <strong>{fromUser?.name || fromUser?.email}</strong> para{' '}
                      <strong>{toUser ? (toUser.name || toUser.email) : '...'}</strong>.
                    </>
                  ) : (
                    <>
                      <strong>{fromUser?.name || fromUser?.email}</strong> não possui nenhuma empresa vinculada no setor{' '}
                      <strong>{sectorMeta?.label}</strong>.
                    </>
                  )
                ) : (
                  <span>Selecione os parâmetros acima para ver o resumo.</span>
                )}
              </p>
            </div>
          )}

          <div className="transfer-resp-footer">
            <button type="button" className="btn-secondary-light" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary transfer-submit-btn"
              disabled={submitting || !fromUserId || !toUserId || fromUserId === toUserId || previewCount === 0}
            >
              {submitting ? (
                <>
                  <ButtonSpinner />
                  <span>Transferindo carteira...</span>
                </>
              ) : (
                <>
                  <ArrowRightLeft size={16} />
                  <span>Confirmar Transferência</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
