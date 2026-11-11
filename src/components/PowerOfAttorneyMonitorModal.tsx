import { useState, useEffect } from 'react';
import { KeyRound, X, Search } from 'lucide-react';
import { API } from '../api';
import './PowerOfAttorneyMonitorModal.css';

interface PowerOfAttorneyMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PowerOfAttorneyMonitorModal({ isOpen, onClose }: PowerOfAttorneyMonitorModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCompany, setEditingCompany] = useState<{ id: string; name: string; system: 'ecac' | 'caixa' | 'municipal' } | null>(null);
  const [expInput, setExpInput] = useState('');

  const loadData = () => {
    setLoading(true);
    fetch(`${API}/api/power-of-attorneys`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar procurações:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSavePoa = async () => {
    if (!editingCompany || !expInput) return;
    try {
      const res = await fetch(`${API}/api/companies/${editingCompany.id}/power-of-attorney`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: editingCompany.system, expirationDate: expInput }),
      });
      if (res.ok) {
        setEditingCompany(null);
        setExpInput('');
        loadData();
      }
    } catch (err) {
      console.error('Erro ao salvar procuração:', err);
    }
  };

  const companies = (data?.companies || []).filter((c: any) =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderBadge = (comp: any, system: 'ecac' | 'caixa' | 'municipal', label: string) => {
    const item = comp[system];
    const status = item?.status;
    const isExpired = status === 'EXPIRED';
    const isWarning = status === 'WARNING';
    const isValid = status === 'VALID';

    return (
      <button
        type="button"
        onClick={() => {
          setEditingCompany({ id: comp.id, name: comp.name, system });
          setExpInput(item?.expiration ? item.expiration.split('T')[0] : '');
        }}
        style={{
          background: isExpired ? 'rgba(239, 68, 68, 0.15)' : isWarning ? 'rgba(245, 158, 11, 0.15)' : isValid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(51, 65, 85, 0.3)',
          border: `1px solid ${isExpired ? '#ef4444' : isWarning ? '#f59e0b' : isValid ? '#10b981' : '#334155'}`,
          color: isExpired ? '#ef4444' : isWarning ? '#f59e0b' : isValid ? '#10b981' : '#94a3b8',
          padding: '0.25rem 0.6rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
        title="Clique para atualizar data de validade"
      >
        {isExpired ? `✕ ${label} Expirada` : isWarning ? `⚠️ ${label} (<30d)` : isValid ? `✓ ${label} OK` : `+ Registrar ${label}`}
      </button>
    );
  };

  return (
    <div className="poa-overlay" onClick={onClose}>
      <div className="poa-card" onClick={e => e.stopPropagation()}>
        <div className="poa-header">
          <div className="poa-title-group">
            <KeyRound className="poa-icon" />
            <div>
              <h2 className="poa-title">Monitor de Validade de Procurações Eletrônicas</h2>
              <div className="poa-subtitle">
                Acompanhamento preventivo de procurações no e-CAC, Caixa e DTE Municipal
              </div>
            </div>
          </div>
          <button className="poa-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="poa-content">
          {/* Banner de Alertas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8' }}>{data?.total || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: '0.25rem' }}>
                Total de Empresas
              </div>
            </div>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b' }}>{data?.warningCount || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: '0.25rem' }}>
                Vencem nos próximos 30 dias
              </div>
            </div>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>{data?.expiredCount || 0}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginTop: '0.25rem' }}>
                Procurações Já Expiradas
              </div>
            </div>
          </div>

          {/* Busca */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              Clique em qualquer botão de procuração para registrar ou atualizar o vencimento
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

          {/* Modal Pequeno de Edição */}
          {editingCompany && (
            <div style={{ background: '#1e293b', border: '1px solid #38bdf8', borderRadius: '12px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: '#f8fafc', fontWeight: 600 }}>
                Data de Vencimento ({editingCompany.system.toUpperCase()}) para {editingCompany.name}:
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="date"
                  value={expInput}
                  onChange={e => setExpInput(e.target.value)}
                  style={{ background: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '0.35rem 0.6rem', fontSize: '0.8125rem' }}
                />
                <button
                  type="button"
                  onClick={handleSavePoa}
                  style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.4rem 0.8rem', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer' }}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  style={{ background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.8rem', fontSize: '0.8125rem', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Tabela de Procurações */}
          <div style={{ border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                Consultando cadastro de procurações eletrônicas...
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Cód</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Razão Social</th>
                    <th style={{ padding: '0.75rem 1rem' }}>e-CAC (Receita Federal)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Caixa (Conectividade)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>DTE Municipal</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c: any) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#f8fafc' }}>{c.code || '-'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{c.name}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{renderBadge(c, 'ecac', 'e-CAC')}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{renderBadge(c, 'caixa', 'Caixa')}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{renderBadge(c, 'municipal', 'Municipal')}</td>
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
