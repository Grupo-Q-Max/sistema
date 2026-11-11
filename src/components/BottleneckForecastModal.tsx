import { useState, useEffect } from 'react';
import { Activity, X, AlertTriangle } from 'lucide-react';
import { API } from '../api';
import './BottleneckForecastModal.css';

interface BottleneckForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  sector?: string;
}

export function BottleneckForecastModal({ isOpen, onClose, sector = 'FISCAL' }: BottleneckForecastModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeSector, setActiveSector] = useState(sector);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/analytics/bottleneck-forecast?sector=${activeSector}`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar previsão de gargalos:', err);
        setLoading(false);
      });
  }, [isOpen, activeSector]);

  if (!isOpen) return null;

  return (
    <div className="bottleneck-modal-overlay" onClick={onClose}>
      <div className="bottleneck-modal-card" onClick={e => e.stopPropagation()}>
        <div className="bottleneck-header">
          <div className="bottleneck-title-group">
            <Activity className="bottleneck-icon" />
            <div>
              <h2 className="bottleneck-title">Radar Preditivo de Gargalos & SLA</h2>
              <div className="bottleneck-subtitle">
                Previsão de entrega para o Dia 20 e análise de sobrecarga de operadores
              </div>
            </div>
          </div>
          <button className="bottleneck-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="bottleneck-content">
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            {['FISCAL', 'DP', 'CUSHMAN'].map(s => (
              <button
                key={s}
                onClick={() => setActiveSector(s)}
                style={{
                  background: activeSector === s ? '#38bdf8' : '#1e293b',
                  color: activeSector === s ? '#0f172a' : '#94a3b8',
                  border: '1px solid #334155',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Calculando cadência histórica e projeção de entregas...
            </div>
          ) : data ? (
            <>
              <div className="bottleneck-metrics-row">
                <div className="bottleneck-metric-card">
                  <span className="bottleneck-metric-label">Dias Úteis Restantes</span>
                  <span className="bottleneck-metric-val">{data.workdaysRemaining} dias</span>
                  <span className="bottleneck-metric-sub">Até o prazo legal de {data.targetDate}</span>
                </div>
                <div className="bottleneck-metric-card">
                  <span className="bottleneck-metric-label">Operadores Monitorados</span>
                  <span className="bottleneck-metric-val">{data.operators?.length || 0}</span>
                  <span className="bottleneck-metric-sub">Com carteiras atribuídas</span>
                </div>
                <div className="bottleneck-metric-card">
                  <span className="bottleneck-metric-label">Gargalos Críticos</span>
                  <span className="bottleneck-metric-val" style={{ color: (data.operators?.filter((o: any) => o.riskLevel === 'CRITICAL').length || 0) > 0 ? '#ef4444' : '#10b981' }}>
                    {data.operators?.filter((o: any) => o.riskLevel === 'CRITICAL').length || 0}
                  </span>
                  <span className="bottleneck-metric-sub">Operadores em risco de atraso</span>
                </div>
              </div>

              {data.suggestions?.length > 0 && (
                <div className="bottleneck-suggestions-box">
                  <div className="bottleneck-suggestions-title">
                    <AlertTriangle size={18} /> Recomendações da Gestão / Ações Preventivas
                  </div>
                  <ul className="bottleneck-suggestions-list">
                    {data.suggestions.map((sug: string, idx: number) => (
                      <li key={idx}>{sug}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bottleneck-table-wrapper">
                <table className="bottleneck-table">
                  <thead>
                    <tr>
                      <th>Operador</th>
                      <th>Carteira</th>
                      <th>Concluídos</th>
                      <th>Pendentes</th>
                      <th>Cadência Diária</th>
                      <th>Déficit Previsto</th>
                      <th>Status SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.operators?.map((op: any) => (
                      <tr key={op.userId}>
                        <td style={{ fontWeight: 600 }}>{op.userName}</td>
                        <td>{op.assignedCount}</td>
                        <td style={{ color: '#10b981', fontWeight: 600 }}>{op.completedCount}</td>
                        <td style={{ color: '#f59e0b' }}>{op.pendingCount + op.inProgressCount}</td>
                        <td>{op.dailyRate} / dia</td>
                        <td style={{ fontWeight: 700, color: op.projectedDeficit > 0 ? '#ef4444' : '#10b981' }}>
                          {op.projectedDeficit > 0 ? `-${op.projectedDeficit} emp.` : 'Em dia'}
                        </td>
                        <td>
                          {op.riskLevel === 'CRITICAL' && (
                            <span className="bottleneck-badge-critical">Risco Crítico</span>
                          )}
                          {op.riskLevel === 'WARNING' && (
                            <span className="bottleneck-badge-warning">Alerta de Atraso</span>
                          )}
                          {op.riskLevel === 'SAFE' && (
                            <span className="bottleneck-badge-safe">Ritmo Seguro</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!data.operators || data.operators.length === 0) && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                          Nenhuma empresa atribuída a operadores neste setor.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ color: '#ef4444', textAlign: 'center' }}>Não foi possível carregar os dados.</div>
          )}
        </div>
      </div>
    </div>
  );
}
