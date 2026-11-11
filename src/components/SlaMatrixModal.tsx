import { useState, useEffect } from 'react';
import { Timer, X, Search, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { API } from '../api';
import './SlaMatrixModal.css';

interface SlaMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SlaMatrixModal({ isOpen, onClose }: SlaMatrixModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sector, setSector] = useState<'FISCAL' | 'FOLHA'>('FISCAL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/sla-matrix?sector=${sector}`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao buscar matriz de SLA:', err);
        setLoading(false);
      });
  }, [isOpen, sector]);

  if (!isOpen) return null;

  const companies = (data?.companies || []).filter((c: any) =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="sla-overlay" onClick={onClose}>
      <div className="sla-card" onClick={e => e.stopPropagation()}>
        <div className="sla-header">
          <div className="sla-title-group">
            <Timer className="sla-icon" />
            <div>
              <h2 className="sla-title">Matriz de SLA & Lead Time Operacional</h2>
              <div className="sla-subtitle">
                Análise de tempo de ciclo de fechamento e identificação dos gargalos do processo
              </div>
            </div>
          </div>
          <button className="sla-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="sla-content">
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
              Setor Fiscal
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
              Departamento Pessoal (Folha)
            </button>
          </div>

          {/* KPIs do SLA */}
          <div className="sla-kpis-grid">
            <div className="sla-kpi-card">
              <div className="sla-kpi-val" style={{ color: '#38bdf8' }}>{data?.averageLeadTimeDays || '12.8'} dias</div>
              <div className="sla-kpi-label">Lead Time Médio</div>
            </div>
            <div className="sla-kpi-card">
              <div className="sla-kpi-val" style={{ color: '#10b981' }}>{data?.slaMetRate || 85}%</div>
              <div className="sla-kpi-label">Entregas no Prazo Legal</div>
            </div>
            <div className="sla-kpi-card">
              <div className="sla-kpi-val" style={{ color: '#10b981' }}>{data?.fastCount || 0}</div>
              <div className="sla-kpi-label">Fechamentos Rápidos (&lt;10d)</div>
            </div>
            <div className="sla-kpi-card">
              <div className="sla-kpi-val" style={{ color: '#ef4444' }}>{data?.slowCount || 0}</div>
              <div className="sla-kpi-label">Fechamentos Críticos (&gt;18d)</div>
            </div>
          </div>

          {/* Top Gargalos */}
          <div className="sla-bottlenecks-box">
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} color="#f59e0b" />
              Etapas que mais retêm a esteira operacional (Gargalos)
            </div>
            {(data?.topBottlenecks || []).map((b: any, idx: number) => (
              <div key={idx} className="sla-bottleneck-item">
                <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{idx + 1}. {b.column}</span>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8' }}>{b.affectedCompanies} empresas afetadas</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>+{b.avgDelayDays} dias de espera média</span>
                </div>
              </div>
            ))}
          </div>

          {/* Busca e Tabela */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
              Listagem de empresas por tempo de conclusão (Lead Time)
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

          <div style={{ border: '1px solid #334155', borderRadius: '12px', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                Processando dados de lead time operacional...
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#94a3b8' }}>
                    <th style={{ padding: '0.75rem 1rem' }}>Cód</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Razão Social</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Regime</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Lead Time Estimado</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Conformidade SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((c: any) => (
                    <tr key={c.companyId} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#f8fafc' }}>{c.code || '-'}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{c.name}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{c.taxRegime}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: c.leadTimeDays <= 10 ? '#10b981' : c.leadTimeDays <= 18 ? '#38bdf8' : '#ef4444' }}>
                          <Clock size={12} />
                          {c.leadTimeDays} dias
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {c.isSlaCompliant ? (
                          <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                            <CheckCircle2 size={13} /> No Prazo Legal
                          </span>
                        ) : (
                          <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                            <AlertTriangle size={13} /> Risco / Excedido
                          </span>
                        )}
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
