import { useState, useEffect } from 'react';
import { Sparkles, X, Search, CheckCircle } from 'lucide-react';
import { API } from '../api';
import './TaxOpportunityRadarModal.css';

interface TaxOpportunityRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TaxOpportunityRadarModal({ isOpen, onClose }: TaxOpportunityRadarModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/tax-opportunities`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao buscar oportunidades tributárias:', err);
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const opportunities = (data?.opportunities || []).filter((o: any) =>
    o.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="taxopp-overlay" onClick={onClose}>
      <div className="taxopp-card" onClick={e => e.stopPropagation()}>
        <div className="taxopp-header">
          <div className="taxopp-title-group">
            <Sparkles className="taxopp-icon" />
            <div>
              <h2 className="taxopp-title">Radar de Oportunidades Tributárias & Monofásicos</h2>
              <div className="taxopp-subtitle">
                Identificação de produtos monofásicos no Simples/Presumido e potencial de honorários de êxito
              </div>
            </div>
          </div>
          <button className="taxopp-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="taxopp-content">
          {/* Banner KPIs de Potencial */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8' }}>{data?.totalEligible || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: '0.25rem' }}>
                Empresas Elegíveis
              </div>
            </div>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>
                R$ {(data?.totalRecoveryPotential || 0).toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: '0.25rem' }}>
                Recuperação Estimada (5 Anos)
              </div>
            </div>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b' }}>
                R$ {(data?.totalPotentialFee || 0).toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: '0.25rem' }}>
                Honorários Potenciais (20% Êxito)
              </div>
            </div>
          </div>

          {/* Busca */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              Empresas com atividades de Autopeças, Farmácias, Cosméticos, Bebidas e Pet Shops
            </span>
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

          {/* Tabela de Oportunidades */}
          <div style={{ border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                Cruzando atividades com a tabela de produtos monofásicos...
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Cód</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Razão Social</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Regime</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Economia / Mês</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Potencial 5 Anos</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Honorário Êxito (20%)</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((o: any) => (
                    <tr key={o.companyId} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#f8fafc' }}>{o.code || '-'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{o.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <CheckCircle size={10} /> {o.category}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{o.taxRegime}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#38bdf8', fontWeight: 700 }}>
                        R$ {o.monthlyTaxReduction.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#10b981', fontWeight: 700 }}>
                        R$ {o.fiveYearsRecovery.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#f59e0b', fontWeight: 800 }}>
                        R$ {o.estimatedSuccessFee.toLocaleString('pt-BR')}
                      </td>
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
