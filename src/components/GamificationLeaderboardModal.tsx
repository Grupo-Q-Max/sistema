import { useState, useEffect } from 'react';
import { Trophy, X } from 'lucide-react';
import { API } from '../api';
import './GamificationLeaderboardModal.css';

interface GamificationLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GamificationLeaderboardModal({ isOpen, onClose }: GamificationLeaderboardModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/gamification/leaderboard`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar ranking:', err);
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const leaders = data?.leaderboard || [];
  const top1 = leaders[0] || null;
  const top2 = leaders[1] || null;
  const top3 = leaders[2] || null;

  return (
    <div className="gamify-overlay" onClick={onClose}>
      <div className="gamify-card" onClick={e => e.stopPropagation()}>
        <div className="gamify-header">
          <div className="gamify-title-group">
            <Trophy className="gamify-icon" />
            <div>
              <h2 className="gamify-title">Ranking & Conquistas da Equipe</h2>
              <div className="gamify-subtitle">
                Pontuação mensal, velocidade de entrega no prazo e medalhas operacionais
              </div>
            </div>
          </div>
          <button className="gamify-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="gamify-content">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Computando pontuações e conquistas do mês...
            </div>
          ) : (
            <>
              {/* Pódio dos 3 Primeiros */}
              {leaders.length > 0 && (
                <div className="gamify-podium">
                  {/* 2º Lugar */}
                  {top2 && (
                    <div className="podium-place podium-2nd">
                      <div className="podium-avatar" style={{ background: '#94a3b8', color: '#0f172a' }}>
                        🥈
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#e2e8f0' }}>{top2.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{top2.points} pts</div>
                      <div className="podium-pedestal">
                        <span style={{ fontSize: '1.25rem', fontWeight: 800 }}>2º</span>
                      </div>
                    </div>
                  )}

                  {/* 1º Lugar */}
                  {top1 && (
                    <div className="podium-place podium-1st">
                      <div className="podium-avatar" style={{ background: '#f59e0b', color: '#0f172a' }}>
                        👑
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f59e0b' }}>{top1.name}</div>
                      <div style={{ fontSize: '0.8125rem', color: '#cbd5e1', fontWeight: 700 }}>{top1.points} pts</div>
                      <div className="podium-pedestal">
                        <span style={{ fontSize: '1.75rem', fontWeight: 900 }}>1º</span>
                        <span style={{ fontSize: '0.6875rem', color: '#f59e0b', fontWeight: 700 }}>CAMPEÃO DO MÊS</span>
                      </div>
                    </div>
                  )}

                  {/* 3º Lugar */}
                  {top3 && (
                    <div className="podium-place podium-3rd">
                      <div className="podium-avatar" style={{ background: '#b45309', color: '#ffffff' }}>
                        🥉
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#e2e8f0' }}>{top3.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{top3.points} pts</div>
                      <div className="podium-pedestal">
                        <span style={{ fontSize: '1.125rem', fontWeight: 800 }}>3º</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lista Completa da Equipe */}
              <div className="gamify-list">
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                  Quadro Geral de Eficiência ({leaders.length} colaboradores)
                </div>

                {leaders.map((u: any, index: number) => (
                  <div key={u.userId} className="gamify-list-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="gamify-rank">#{index + 1}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#f8fafc' }}>{u.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {u.totalActions} baixas realizadas • {u.activeDaysCount} dias ativos no mês
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="gamify-badges-row">
                        {u.badges?.map((b: any, bIdx: number) => (
                          <span key={bIdx} className="gamify-badge-pill" style={{ border: `1px solid ${b.color}55`, color: b.color }}>
                            {b.icon} {b.label}
                          </span>
                        ))}
                      </div>

                      <div style={{ textAlign: 'right', minWidth: '80px' }}>
                        <span style={{ fontSize: '1.125rem', fontWeight: 800, color: index === 0 ? '#f59e0b' : '#38bdf8' }}>
                          {u.points}
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b', display: 'block' }}>pontos</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
