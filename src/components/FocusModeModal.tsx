import { useState, useEffect } from 'react';
import { Target, X, Check, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import './FocusModeModal.css';

interface FocusModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  onCompleteClosing?: (closingId: string, companyId: string) => void;
}

export function FocusModeModal({ isOpen, onClose, rows, onCompleteClosing }: FocusModeModalProps) {
  // Filtrar apenas empresas que ainda têm obrigações pendentes
  const pendingRows = (rows || []).filter(r => r.calculatedStatus !== 'COMPLETED' && r.progressPercent < 100);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
  }, [isOpen]);

  const currentRow = pendingRows[currentIndex] || null;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        if (currentIndex < pendingRows.length - 1) setCurrentIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleMarkComplete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, pendingRows.length, currentRow]);

  if (!isOpen) return null;

  const handleMarkComplete = () => {
    if (!currentRow) return;
    if (onCompleteClosing && currentRow.id) {
      onCompleteClosing(currentRow.id, currentRow.company?.id);
    }
    setCompletedTodayCount(prev => prev + 1);
    if (currentIndex < pendingRows.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  return (
    <div className="focus-modal-overlay" onClick={onClose}>
      <div className="focus-modal-card" onClick={e => e.stopPropagation()}>
        <div className="focus-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="focus-badge">
              <Target size={14} /> Modo Foco • Fila do Dia
            </span>
            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              {pendingRows.length > 0 ? `Empresa ${currentIndex + 1} de ${pendingRows.length}` : 'Fila Vazia'}
            </span>
          </div>
          <button className="focus-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="focus-body">
          {/* Barra de Progresso da Fila */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
              <span>Meta do Dia</span>
              <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                {completedTodayCount} concluídas nesta sessão
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${pendingRows.length > 0 ? (currentIndex / pendingRows.length) * 100 : 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #38bdf8, #10b981)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {currentRow ? (
            <div className="focus-company-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="focus-company-code">CÓDIGO {currentRow.company?.code || 'S/N'}</div>
                  <h3 className="focus-company-name">{currentRow.company?.name}</h3>
                  <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                    Regime: {currentRow.company?.taxRegime || 'Simples Nacional'} • Cidade: {currentRow.company?.city || 'SP'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>
                    {currentRow.progressPercent ?? 0}%
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Progresso Atual</div>
                </div>
              </div>

              {currentRow.company?.notes && (
                <div style={{ background: '#0f172a', padding: '0.75rem', borderRadius: '8px', borderLeft: '3px solid #38bdf8', fontSize: '0.8125rem', color: '#cbd5e1' }}>
                  <strong>Atenção:</strong> {currentRow.company.notes}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  onClick={handleMarkComplete}
                  style={{
                    flex: 1,
                    background: '#10b981',
                    color: '#0f172a',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Check size={18} /> Marcar Avanço / Próximo [Espaço]
                </button>
                <button
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  style={{
                    background: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    fontWeight: 600,
                    cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
                    opacity: currentIndex === 0 ? 0.5 : 1,
                  }}
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  disabled={currentIndex >= pendingRows.length - 1}
                  onClick={() => setCurrentIndex(prev => Math.min(pendingRows.length - 1, prev + 1))}
                  style={{
                    background: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    fontWeight: 600,
                    cursor: currentIndex >= pendingRows.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: currentIndex >= pendingRows.length - 1 ? 0.5 : 1,
                  }}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', background: '#1e293b', borderRadius: '14px' }}>
              <Sparkles size={40} style={{ color: '#10b981', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Parabéns! Fila do Dia Zerada!
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Todas as empresas desta carteira foram concluídas com sucesso.
              </p>
            </div>
          )}

          {/* Barra de atalhos rápidos */}
          <div className="focus-shortcuts-bar">
            <div>
              <span className="focus-key">ESPAÇO</span> Concluir & Avançar
            </div>
            <div>
              <span className="focus-key">→</span> Pular Empresa
            </div>
            <div>
              <span className="focus-key">ESC</span> Sair do Modo Foco
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
