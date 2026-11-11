import { useState, useEffect } from 'react';
import { ShieldAlert, X, Search, AlertTriangle, CheckCircle, HeartPulse } from 'lucide-react';
import { API } from '../api';
import './CustomerHealthRadarModal.css';

interface CustomerHealthRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CustomerHealthRadarModal({ isOpen, onClose }: CustomerHealthRadarModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/churn-radar`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar radar de churn:', err);
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const companies = (data?.companies || []).filter((c: any) => {
    const matchesSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = riskFilter === 'ALL' || c.riskLevel === riskFilter;
    return matchesSearch && matchesRisk;
  });

  const summary = data?.summary || { total: 0, highRiskCount: 0, mediumRiskCount: 0, lowRiskCount: 0, averageHealthScore: 0 };

  return (
    <div className="churn-overlay" onClick={onClose}>
      <div className="churn-card" onClick={e => e.stopPropagation()}>
        <div className="churn-header">
          <div className="churn-title-group">
            <HeartPulse className="churn-icon" />
            <div>
              <h2 className="churn-title">Radar de Saúde do Cliente & Risco de Churn</h2>
              <div className="churn-subtitle">
                Identificação preditiva de atrito, inadimplência e clientes em risco de rescisão
              </div>
            </div>
          </div>
          <button className="churn-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="churn-content">
          {/* KPIs Bar */}
          <div className="churn-kpis-grid">
            <div className="churn-kpi-card">
              <div className="churn-kpi-val" style={{ color: '#38bdf8' }}>{summary.averageHealthScore}/100</div>
              <div className="churn-kpi-label">Score Médio da Carteira</div>
            </div>
            <div className="churn-kpi-card">
              <div className="churn-kpi-val" style={{ color: '#ef4444' }}>{summary.highRiskCount}</div>
              <div className="churn-kpi-label">Alto Risco de Churn</div>
            </div>
            <div className="churn-kpi-card">
              <div className="churn-kpi-val" style={{ color: '#f59e0b' }}>{summary.mediumRiskCount}</div>
              <div className="churn-kpi-label">Pontos de Atenção</div>
            </div>
            <div className="churn-kpi-card">
              <div className="churn-kpi-val" style={{ color: '#10b981' }}>{summary.lowRiskCount}</div>
              <div className="churn-kpi-label">Clientes Saudáveis</div>
            </div>
          </div>

          {/* Filtros e Busca */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(rf => (
                <button
                  key={rf}
                  onClick={() => setRiskFilter(rf)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: riskFilter === rf ? '#38bdf8' : '#1e293b',
                    color: riskFilter === rf ? '#0f172a' : '#94a3b8',
                    border: '1px solid #334155',
                  }}
                >
                  {rf === 'ALL' && 'Todos os Clientes'}
                  {rf === 'HIGH' && '🔴 Alto Risco'}
                  {rf === 'MEDIUM' && '🟡 Atenção'}
                  {rf === 'LOW' && '🟢 Saudáveis'}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }} />
              <input
                type="text"
                placeholder="Filtrar por nome ou código..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.45rem 0.8rem 0.45rem 2rem',
                  color: '#f8fafc',
                  fontSize: '0.8125rem',
                }}
              />
            </div>
          </div>

          {/* Tabela de Empresas */}
          <div className="churn-table-container">
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                Calculando score preditivo de saúde dos clientes...
              </div>
            ) : (
              <table className="churn-table">
                <thead>
                  <tr>
                    <th>Cód</th>
                    <th>Razão Social</th>
                    <th>Score de Saúde</th>
                    <th>Motivos de Risco Detectados</th>
                    <th>Recomendação para Diretoria</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                        Nenhuma empresa encontrada para este filtro.
                      </td>
                    </tr>
                  ) : (
                    companies.map((c: any) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 700 }}>{c.code || '-'}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{c.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{c.taxRegime}</div>
                        </td>
                        <td>
                          <span
                            className={`churn-score-pill ${
                              c.riskLevel === 'HIGH'
                                ? 'churn-score-high'
                                : c.riskLevel === 'MEDIUM'
                                ? 'churn-score-medium'
                                : 'churn-score-low'
                            }`}
                          >
                            {c.riskLevel === 'HIGH' && <ShieldAlert size={12} />}
                            {c.riskLevel === 'MEDIUM' && <AlertTriangle size={12} />}
                            {c.riskLevel === 'LOW' && <CheckCircle size={12} />}
                            {c.score}/100 · {c.riskLevel === 'HIGH' ? 'Alto Risco' : c.riskLevel === 'MEDIUM' ? 'Atenção' : 'Saudável'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.75rem' }}>
                            {c.reasons.map((r: string, idx: number) => (
                              <span key={idx} style={{ color: c.riskLevel === 'HIGH' ? '#fca5a5' : '#cbd5e1' }}>
                                • {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', maxWidth: '280px' }}>
                          {c.recommendation}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
