import { useState, useEffect } from 'react';
import { ShieldCheck, Snowflake, X, History, Check, AlertCircle } from 'lucide-react';
import { API } from '../api';
import './CompetenceSnapshotModal.css';

export interface CompetenceSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  referencePeriod: string; // YYYY-MM-DD
  periodLabel: string;
  sector?: string;
}

export function CompetenceSnapshotModal({
  isOpen,
  onClose,
  referencePeriod,
  periodLabel,
  sector = 'GERAL',
}: CompetenceSnapshotModalProps) {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [notes, setNotes] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/competence/snapshots`);
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.snapshots || []);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchSnapshots();
      setSuccessMsg(null);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFreeze = async () => {
    if (!window.confirm(`Tem certeza de que deseja CONGELAR e homologar a competência ${periodLabel}? Esta ação gerará um snapshot permanente para fins de conformidade legal e auditoria externa.`)) {
      return;
    }

    try {
      setFreezing(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch(`${API}/api/competence/freeze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referencePeriod,
          sector,
          summaryNotes: notes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Erro ao congelar competência');
        return;
      }

      setSuccessMsg(`Competência ${periodLabel} congelada e homologada com sucesso!`);
      setNotes('');
      void fetchSnapshots();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao congelar competência');
    } finally {
      setFreezing(false);
    }
  };

  return (
    <div className="snapshot-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="snapshot-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="snapshot-modal-header">
          <h3>
            <Snowflake size={18} color="#60a5fa" />
            Congelamento & Homologação de Competência ({periodLabel})
          </h3>
          <button type="button" className="executive-report-btn-close" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="snapshot-modal-body">
          {/* Card de Ação */}
          <div className="snapshot-action-card">
            <h4>
              <ShieldCheck size={16} /> Homologar Snapshot Imutável
            </h4>
            <p>
              Ao homologar, o sistema captura o estado integral de todos os fechamentos, cálculos e observações
              desta competência, blindando o histórico contra modificações retroativas para atender auditorias contábeis
              e requisitos de compliance (Art. 173 CTN).
            </p>

            <textarea
              placeholder="Observações da diretoria / sócio para este fechamento (opcional)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: 6,
                padding: '8px 10px',
                color: '#f8fafc',
                fontSize: 12,
                resize: 'none',
              }}
            />

            {errorMsg && (
              <div style={{ color: '#ef4444', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} /> {errorMsg}
              </div>
            )}
            {successMsg && (
              <div style={{ color: '#10b981', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} /> {successMsg}
              </div>
            )}

            <button
              type="button"
              className="snapshot-freeze-btn"
              onClick={handleFreeze}
              disabled={freezing || loading}
            >
              <Snowflake size={15} />
              {freezing ? 'Gravando Snapshot...' : `Congelar Competência ${periodLabel}`}
            </button>
          </div>

          {/* Histórico de Snapshots */}
          <div className="snapshot-list-section">
            <h4>
              <History size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Snapshots Homologados Recentemente
            </h4>

            {loading ? (
              <p style={{ color: '#94a3b8', fontSize: 12 }}>Carregando histórico de snapshots...</p>
            ) : snapshots.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 12 }}>Nenhum snapshot homologado até o momento.</p>
            ) : (
              <table className="snapshot-table">
                <thead>
                  <tr>
                    <th>Competência</th>
                    <th>Setor</th>
                    <th>Homologado por</th>
                    <th>Conclusão</th>
                    <th>Data Homologação</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.summary?.period || s.referencePeriod.slice(0, 7)}</strong></td>
                      <td>{s.sector}</td>
                      <td>{s.closedByName || 'Diretoria'}</td>
                      <td>
                        <span className="snapshot-badge-rate">
                          {s.summary?.completionRate ?? 100}%
                        </span>
                      </td>
                      <td>{new Date(s.createdAt).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
