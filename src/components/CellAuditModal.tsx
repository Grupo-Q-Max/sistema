import { useEffect, useState } from 'react';
import { History, X, User, ArrowRight, Clock, AlertCircle } from 'lucide-react';
import { API } from '../api';
import './CellAuditModal.css';

export interface CellAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  companyCode?: string | null;
  columnKey: string;
  columnLabel: string;
  sector?: string;
}

interface AuditLogEntry {
  id: string;
  userName: string;
  userEmail?: string;
  userId?: string;
  oldValue: any;
  newValue: any;
  status?: string;
  createdAt: string;
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function renderValueBadge(val: any) {
  if (val === null || val === undefined || val === '') {
    return <span className="audit-val-empty">Vazio / Limpo</span>;
  }
  const s = String(val).trim();
  if (s === 'OK' || s.startsWith('OK')) {
    return <span className="audit-val-badge badge-ok">{s}</span>;
  }
  if (s === 'PENDENTE' || s.startsWith('PEND')) {
    return <span className="audit-val-badge badge-pending">{s}</span>;
  }
  if (s === 'NA' || s === 'N/A') {
    return <span className="audit-val-badge badge-na">N/A</span>;
  }
  if (s === 'SEM_MOVIMENTO' || s.includes('SEM MOVIMENTO')) {
    return <span className="audit-val-badge badge-sem-mov">Sem Movimento</span>;
  }
  if (typeof val === 'object') {
    return <span className="audit-val-badge badge-json">{JSON.stringify(val)}</span>;
  }
  return <span className="audit-val-badge badge-custom">{s}</span>;
}

export function CellAuditModal({
  isOpen,
  onClose,
  companyId,
  companyName,
  companyCode,
  columnKey,
  columnLabel,
  sector,
}: CellAuditModalProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !companyId || !columnKey) return;
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const url = new URL(`${API}/api/audit/cell-history`);
    url.searchParams.set('companyId', companyId);
    url.searchParams.set('columnKey', columnKey);
    if (sector) url.searchParams.set('sector', sector);

    fetch(url.toString())
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao carregar histórico.');
        return res.json();
      })
      .then((data) => {
        if (!isCancelled) {
          setLogs(data.logs || []);
        }
      })
      .catch((err) => {
        if (!isCancelled) setError(err.message || 'Erro ao buscar histórico.');
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, companyId, columnKey, sector]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="cell-audit-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cell-audit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cell-audit-header">
          <div className="cell-audit-title-group">
            <div className="cell-audit-icon-box">
              <History size={20} />
            </div>
            <div>
              <h3>Trilha de Auditoria</h3>
              <p className="cell-audit-subtitle">
                {companyCode && <span className="audit-code">[{companyCode}]</span>} <strong>{companyName}</strong> ·{' '}
                <span className="audit-col-name">{columnLabel}</span>
              </p>
            </div>
          </div>
          <button type="button" className="cell-audit-close-btn" onClick={onClose} aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>

        <div className="cell-audit-body">
          {loading ? (
            <div className="cell-audit-loading">
              <Clock size={24} className="spin-icon" />
              <span>Buscando histórico de alterações...</span>
            </div>
          ) : error ? (
            <div className="cell-audit-error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="cell-audit-empty">
              <History size={36} />
              <h4>Nenhum histórico registrado</h4>
              <p>Nenhuma alteração recente foi registrada para este campo nesta empresa.</p>
            </div>
          ) : (
            <div className="cell-audit-timeline">
              {logs.map((log, index) => (
                <div key={log.id || index} className="timeline-item">
                  <div className="timeline-node" />
                  <div className="timeline-content">
                    <div className="timeline-meta">
                      <div className="timeline-user">
                        <div className="user-dot">
                          <User size={12} />
                        </div>
                        <span className="user-name">{log.userName}</span>
                      </div>
                      <span className="timeline-time">{formatDateTime(log.createdAt)}</span>
                    </div>

                    <div className="timeline-change-row">
                      <div className="change-from">{renderValueBadge(log.oldValue)}</div>
                      <ArrowRight size={14} className="change-arrow" />
                      <div className="change-to">{renderValueBadge(log.newValue)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cell-audit-footer">
          <button type="button" className="cell-audit-btn-close" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
