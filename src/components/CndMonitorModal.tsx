import { useState, useEffect } from 'react';
import { ShieldCheck, X, Search, ExternalLink, Check, AlertTriangle } from 'lucide-react';
import { API } from '../api';
import './CndMonitorModal.css';

interface CndMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CndMonitorModal({ isOpen, onClose }: CndMonitorModalProps) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL'); // 'ALL' | 'PENDING' | 'REGULAR'

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/cnd/status`)
      .then(res => res.json())
      .then(json => {
        setCompanies(Array.isArray(json) ? json : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar CNDs:', err);
        setLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = companies.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cnpj?.includes(searchTerm);

    if (!matchSearch) return false;

    const hasAnyPending = ['federal', 'fgts', 'trabalhista', 'municipal'].some(
      k => c.cnd?.[k]?.status === 'PENDING'
    );

    if (filterType === 'PENDING') return hasAnyPending;
    if (filterType === 'REGULAR') return !hasAnyPending;
    return true;
  });

  return (
    <div className="cnd-overlay" onClick={onClose}>
      <div className="cnd-card" onClick={e => e.stopPropagation()}>
        <div className="cnd-header">
          <div className="cnd-title-group">
            <ShieldCheck className="cnd-icon" />
            <div>
              <h2 className="cnd-title">Monitor Unificado de CNDs</h2>
              <div className="cnd-subtitle">
                Acompanhamento preventivo de certidões Federais, Trabalhistas, FGTS e Municipais
              </div>
            </div>
          </div>
          <button className="cnd-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="cnd-content">
          {/* Barra de Filtros e Busca */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#64748b' }} />
              <input
                type="text"
                placeholder="Buscar empresa por código, nome ou CNPJ..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '0.6rem 1rem 0.6rem 2.25rem',
                  color: '#f8fafc',
                  fontSize: '0.875rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setFilterType('ALL')}
                style={{
                  background: filterType === 'ALL' ? '#38bdf8' : '#1e293b',
                  color: filterType === 'ALL' ? '#0f172a' : '#94a3b8',
                  border: '1px solid #334155',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                Todas ({companies.length})
              </button>
              <button
                onClick={() => setFilterType('PENDING')}
                style={{
                  background: filterType === 'PENDING' ? '#ef4444' : '#1e293b',
                  color: filterType === 'PENDING' ? '#ffffff' : '#ef4444',
                  border: '1px solid #ef4444',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                Com Pendência
              </button>
              <button
                onClick={() => setFilterType('REGULAR')}
                style={{
                  background: filterType === 'REGULAR' ? '#10b981' : '#1e293b',
                  color: filterType === 'REGULAR' ? '#0f172a' : '#10b981',
                  border: '1px solid #10b981',
                  padding: '0.5rem 0.8rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                100% Regulares
              </button>
            </div>
          </div>

          {/* Links para Emissão Oficial */}
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#94a3b8' }}>
            <span>Emissão rápida oficial:</span>
            <a href="https://solucoes.receita.fazenda.gov.br/servicos/certidaointernet/pj/emitir" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
              Receita Federal <ExternalLink size={11} />
            </a>
            •
            <a href="https://consulta-crf.caixa.gov.br/" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
              Caixa CRF <ExternalLink size={11} />
            </a>
            •
            <a href="https://cndt-certidao.tst.jus.br/" target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
              TST Trabalhista <ExternalLink size={11} />
            </a>
          </div>

          {/* Tabela de Empresas e suas CNDs */}
          <div className="cnd-table-wrapper">
            <table className="cnd-table">
              <thead>
                <tr>
                  <th>Cód</th>
                  <th>Razão Social</th>
                  <th>CND Federal (RFB/PGFN)</th>
                  <th>CRF (FGTS)</th>
                  <th>CNDT (Trabalhista)</th>
                  <th>CND Municipal</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                      Carregando status das certidões...
                    </td>
                  </tr>
                ) : filtered.map(c => {
                  const fed = c.cnd?.federal || { status: 'REGULAR' };
                  const fgts = c.cnd?.fgts || { status: 'REGULAR' };
                  const trab = c.cnd?.trabalhista || { status: 'REGULAR' };
                  const mun = c.cnd?.municipal || { status: 'REGULAR' };

                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700, color: '#38bdf8' }}>{c.code || 'S/N'}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{c.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>CNPJ: {c.cnpj || '-'}</div>
                      </td>
                      <td>
                        <span className={`cnd-status-tag ${fed.status === 'PENDING' ? 'pending' : 'regular'}`}>
                          {fed.status === 'PENDING' ? <AlertTriangle size={12} /> : <Check size={12} />}
                          {fed.status === 'PENDING' ? 'Débito RFB' : 'Regular'}
                        </span>
                      </td>
                      <td>
                        <span className={`cnd-status-tag ${fgts.status === 'PENDING' ? 'pending' : 'regular'}`}>
                          {fgts.status === 'PENDING' ? <AlertTriangle size={12} /> : <Check size={12} />}
                          {fgts.status === 'PENDING' ? 'Irregular' : 'CRF Ativo'}
                        </span>
                      </td>
                      <td>
                        <span className={`cnd-status-tag ${trab.status === 'PENDING' ? 'pending' : 'regular'}`}>
                          {trab.status === 'PENDING' ? <AlertTriangle size={12} /> : <Check size={12} />}
                          {trab.status === 'PENDING' ? 'Processo Ativo' : 'Negativa'}
                        </span>
                      </td>
                      <td>
                        <span className={`cnd-status-tag ${mun.status === 'PENDING' ? 'pending' : 'regular'}`}>
                          {mun.status === 'PENDING' ? <AlertTriangle size={12} /> : <Check size={12} />}
                          {mun.status === 'PENDING' ? 'Bloqueio' : 'Regular'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      Nenhuma empresa encontrada com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
