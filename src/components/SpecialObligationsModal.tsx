import { useState, useEffect } from 'react';
import { Calendar, X, Check, Search } from 'lucide-react';
import { API } from '../api';
import './SpecialObligationsModal.css';

interface SpecialObligationsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SpecialObligationsModal({ isOpen, onClose }: SpecialObligationsModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/special-obligations?year=${selectedYear}`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar obrigações especiais:', err);
        setLoading(false);
      });
  }, [isOpen, selectedYear]);

  if (!isOpen) return null;

  const companies = (data?.companies || []).filter((c: any) =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="special-overlay" onClick={onClose}>
      <div className="special-card" onClick={e => e.stopPropagation()}>
        <div className="special-header">
          <div className="special-title-group">
            <Calendar className="special-icon" />
            <div>
              <h2 className="special-title">Calendário de Obrigações Especiais & Anuais</h2>
              <div className="special-subtitle">
                Acompanhamento de declarações anuais (DEFIS, ECD, ECF, 13º Salário, Alvarás)
              </div>
            </div>
          </div>
          <button className="special-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="special-content">
          {/* Seletor de Ano e Quadro de Obrigações */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600 }}>Ano de Exercício:</span>
              {[2025, 2026, 2027].map(y => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  style={{
                    background: selectedYear === y ? '#38bdf8' : '#1e293b',
                    color: selectedYear === y ? '#0f172a' : '#94a3b8',
                    border: '1px solid #334155',
                    padding: '0.3rem 0.7rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                  }}
                >
                  {y}
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

          {/* Cards dos 4 Trimestres */}
          <div className="special-quarters-grid">
            <div className="special-quarter-card">
              <span className="special-quarter-title">1º Trimestre (Jan - Mar)</span>
              <div className="special-item-chip">
                <span>DEFIS (Simples)</span>
                <span style={{ color: '#38bdf8' }}>Até 31/03</span>
              </div>
              <div className="special-item-chip">
                <span>DIRF / Informes</span>
                <span style={{ color: '#38bdf8' }}>Fev</span>
              </div>
            </div>

            <div className="special-quarter-card">
              <span className="special-quarter-title">2º Trimestre (Abr - Jun)</span>
              <div className="special-item-chip">
                <span>IRPF dos Sócios</span>
                <span style={{ color: '#f59e0b' }}>Até 30/04</span>
              </div>
              <div className="special-item-chip">
                <span>ECD Contábil</span>
                <span style={{ color: '#f59e0b' }}>Até 31/05</span>
              </div>
            </div>

            <div className="special-quarter-card">
              <span className="special-quarter-title">3º Trimestre (Jul - Set)</span>
              <div className="special-item-chip">
                <span>ECF Fiscal</span>
                <span style={{ color: '#a855f7' }}>Até 31/07</span>
              </div>
              <div className="special-item-chip">
                <span>DITR Rural</span>
                <span style={{ color: '#a855f7' }}>Até 30/09</span>
              </div>
            </div>

            <div className="special-quarter-card">
              <span className="special-quarter-title">4º Trimestre (Out - Dez)</span>
              <div className="special-item-chip">
                <span>13º 1ª Parcela</span>
                <span style={{ color: '#10b981' }}>Até 30/11</span>
              </div>
              <div className="special-item-chip">
                <span>13º 2ª Parcela</span>
                <span style={{ color: '#10b981' }}>Até 20/12</span>
              </div>
            </div>
          </div>

          {/* Tabela de Empresas x Obrigações Especiais */}
          <div style={{ border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Cód</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Razão Social</th>
                  <th style={{ padding: '0.75rem 1rem' }}>DEFIS</th>
                  <th style={{ padding: '0.75rem 1rem' }}>ECD</th>
                  <th style={{ padding: '0.75rem 1rem' }}>ECF</th>
                  <th style={{ padding: '0.75rem 1rem' }}>13º Salário</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                      Carregando obrigações de {selectedYear}...
                    </td>
                  </tr>
                ) : companies.map((c: any) => {
                  const isSimples = String(c.taxRegime || '').toUpperCase().includes('SIMPLES');

                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ fontWeight: 700, color: '#38bdf8', padding: '0.65rem 1rem' }}>{c.code || '—'}</td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        {isSimples ? (
                          <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Check size={14} /> Aplicável
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>N/A</span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        {!isSimples ? (
                          <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Check size={14} /> Obrigatório
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>Dispensada</span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        {!isSimples ? (
                          <span style={{ color: '#a855f7', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Check size={14} /> Obrigatório
                          </span>
                        ) : (
                          <span style={{ color: '#64748b' }}>Dispensada</span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#10b981' }}>
                        Previsto 11/12
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
