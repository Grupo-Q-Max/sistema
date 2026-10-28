import React, { useState, useEffect } from 'react';
import { CalendarPlus, X, AlertCircle } from 'lucide-react';
import { ButtonSpinner } from './LoadingSkeleton';
import { API } from '../api';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

interface ManualCompetenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (year: number, month: number, message: string) => void;
  initialYear?: number;
  initialMonth?: number; // 1-12
}

export function ManualCompetenceModal({
  isOpen,
  onClose,
  onSuccess,
  initialYear,
  initialMonth,
}: ManualCompetenceModalProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(initialYear || currentYear);
  const [month, setMonth] = useState<number>(initialMonth || new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialYear) setYear(initialYear);
    if (initialMonth) setMonth(initialMonth);
    setError(null);
  }, [isOpen, initialYear, initialMonth]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/closings/rollover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(year),
          month: Number(month),
          manual: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao abrir competência manual');
      }

      onSuccess(Number(year), Number(month), data.message || `Competência de ${MONTH_NAMES[month - 1]} de ${year} aberta com sucesso!`);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao abrir competência');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !loading && onClose()}>
      <div
        className="modal-card settings-modal"
        style={{ maxWidth: '480px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalendarPlus size={22} color="var(--accent, #6366f1)" />
              Abrir Competência Manual
            </h2>
            <p style={{ marginTop: '4px' }}>
              Gere os fechamentos e obrigações para todas as empresas ativas sem esperar a virada automática.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn close-btn"
            disabled={loading}
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              >
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>
                  Mês da Competência
                </label>
                <select
                  value={month}
                  disabled={loading}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  style={{ width: '100%' }}
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {String(idx + 1).padStart(2, '0')} - {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #94a3b8)' }}>
                  Ano
                </label>
                <input
                  type="number"
                  min="2020"
                  max="2035"
                  value={year}
                  disabled={loading}
                  onChange={(e) => setYear(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div
              style={{
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '12px',
                color: 'var(--text-main, #e2e8f0)',
                lineHeight: '1.5',
              }}
            >
              <strong>O que acontece ao abrir:</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                <li>Cria as linhas de fechamento para Fiscal, DP, Cushman e Parcelamento;</li>
                <li>Copia os campos marcados como &quot;Replica Mês&quot; e valores &quot;N/A&quot; da competência anterior;</li>
                <li>Libera a competência imediatamente para edição da equipe.</li>
              </ul>
            </div>
          </div>

          <div className="modal-footer" style={{ marginTop: '20px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              {loading ? <ButtonSpinner /> : <CalendarPlus size={16} />}
              <span>{loading ? 'Abrindo Competência...' : `Abrir ${String(month).padStart(2, '0')}/${year}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

