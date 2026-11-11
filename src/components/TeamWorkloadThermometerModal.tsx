import { useState, useEffect } from 'react';
import { Users, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { API } from '../api';
import './TeamWorkloadThermometerModal.css';

interface TeamWorkloadThermometerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TeamWorkloadThermometerModal({ isOpen, onClose }: TeamWorkloadThermometerModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState<'FISCAL' | 'FOLHA'>('FISCAL');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/workload/thermometer?sector=${sector}`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao buscar termômetro de carga:', err);
        setLoading(false);
      });
  }, [isOpen, sector]);

  if (!isOpen) return null;

  const analysts = data?.analysts || [];

  return (
    <div className="worktherm-overlay" onClick={onClose}>
      <div className="worktherm-card" onClick={e => e.stopPropagation()}>
        <div className="worktherm-header">
          <div className="worktherm-title-group">
            <Users className="worktherm-icon" />
            <div>
              <h2 className="worktherm-title">Termômetro de Carga & Burnout da Equipe</h2>
              <div className="worktherm-subtitle">
                Distribuição de peso e complexidade da carteira por analista · Prevenção de sobrecarga
              </div>
            </div>
          </div>
          <button className="worktherm-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="worktherm-content">
          {/* Seletor de Setor */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setSector('FISCAL')}
              style={{
                background: sector === 'FISCAL' ? '#38bdf8' : '#1e293b',
                color: sector === 'FISCAL' ? '#0f172a' : '#94a3b8',
                border: '1px solid #334155',
                padding: '0.4rem 1rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Equipe Fiscal
            </button>
            <button
              onClick={() => setSector('FOLHA')}
              style={{
                background: sector === 'FOLHA' ? '#38bdf8' : '#1e293b',
                color: sector === 'FOLHA' ? '#0f172a' : '#94a3b8',
                border: '1px solid #334155',
                padding: '0.4rem 1rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Equipe de Pessoal (Folha)
            </button>
          </div>

          {/* Cards de Analistas */}
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Calculando distribuição de complexidade...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {analysts.map((a: any) => {
                const isOverload = a.status === 'OVERLOAD';
                const isIdeal = a.status === 'IDEAL';
                const color = isOverload ? '#ef4444' : isIdeal ? '#10b981' : '#38bdf8';

                return (
                  <div
                    key={a.userId}
                    style={{
                      background: '#1e293b',
                      border: `1px solid ${isOverload ? '#ef4444' : '#334155'}`,
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {a.name}
                          {isOverload && (
                            <span style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '2px 8px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <AlertTriangle size={12} /> Sobrecarga Crítica
                            </span>
                          )}
                          {isIdeal && (
                            <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '2px 8px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={12} /> Carga Ideal
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{a.email}</div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{a.loadPercent}%</span>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{a.totalCompanies} empresas atribuídas</div>
                      </div>
                    </div>

                    {/* Barra de Progresso do Termômetro */}
                    <div style={{ width: '100%', height: '8px', background: '#0f172a', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, a.loadPercent)}%`,
                          height: '100%',
                          background: color,
                          borderRadius: '999px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
