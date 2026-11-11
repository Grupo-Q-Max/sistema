import { useState, useEffect } from 'react';
import { Award, Printer, X, ShieldCheck } from 'lucide-react';
import { API } from '../api';
import './CompanyDeliveryReportModal.css';

interface CompanyDeliveryReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  period?: string;
}

export function CompanyDeliveryReportModal({ isOpen, onClose, companyId, period }: CompanyDeliveryReportModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    setLoading(true);
    fetch(`${API}/api/companies/${companyId}/delivery-certificate${period ? `?period=${period}` : ''}`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar comprovante de entregas:', err);
        setLoading(false);
      });
  }, [isOpen, companyId, period]);

  if (!isOpen) return null;

  return (
    <div className="delivery-modal-overlay" onClick={onClose}>
      <div className="delivery-modal-card" onClick={e => e.stopPropagation()}>
        <div className="delivery-header">
          <div className="delivery-title-group">
            <Award className="delivery-icon" />
            <div>
              <h2 className="delivery-title">Extrato de Entregas & Conformidade Fiscal</h2>
              <div className="delivery-subtitle">
                Comprovante oficial de obrigações tributárias e trabalhistas do mês
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="delivery-btn-print" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir / PDF
            </button>
            <button className="delivery-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="delivery-content">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Carregando dados da empresa e obrigações cumpridas...
            </div>
          ) : data && data.company ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Card da Empresa */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>
                      Cód. {data.company.code || 'S/N'}
                    </span>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f8fafc', margin: '0.2rem 0' }}>
                      {data.company.name}
                    </h3>
                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                      CNPJ: {data.company.cnpj || 'Não cadastrado'} • Regime: {data.company.taxRegime || 'Geral'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.25rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
                      <ShieldCheck size={14} /> Regular / Entregue
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem' }}>
                      Competência: {data.competenceLabel}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabela de Obrigações Entregues */}
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.6rem' }}>
                  Obrigações Cumpridas no Mês ({data.totalDelivered || 0} entregues)
                </h4>
                <div style={{ border: '1px solid #334155', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ background: '#1e293b', textAlign: 'left', color: '#94a3b8' }}>
                        <th style={{ padding: '0.65rem 0.9rem' }}>Setor</th>
                        <th style={{ padding: '0.65rem 0.9rem' }}>Obrigação</th>
                        <th style={{ padding: '0.65rem 0.9rem' }}>Status</th>
                        <th style={{ padding: '0.65rem 0.9rem' }}>Data Conclusão</th>
                        <th style={{ padding: '0.65rem 0.9rem' }}>Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.obligations?.map((ob: any, i: number) => (
                        <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '0.65rem 0.9rem', color: '#38bdf8', fontWeight: 600 }}>{ob.sector}</td>
                          <td style={{ padding: '0.65rem 0.9rem', fontWeight: 600, color: '#f8fafc' }}>{ob.obligationKey}</td>
                          <td style={{ padding: '0.65rem 0.9rem' }}>
                            <span style={{ color: ob.status === 'N/A' ? '#94a3b8' : '#10b981', fontWeight: 700 }}>
                              {ob.status === 'N/A' ? 'Não se Aplica' : 'Entregue'}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.9rem', color: '#cbd5e1' }}>
                            {ob.completedAt ? String(ob.completedAt).slice(0, 10) : 'No prazo legal'}
                          </td>
                          <td style={{ padding: '0.65rem 0.9rem', color: '#94a3b8' }}>{ob.notes || '-'}</td>
                        </tr>
                      ))}
                      {(!data.obligations || data.obligations.length === 0) && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                            Nenhuma obrigação registrada como entregue nesta competência.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Assinatura do Escritório */}
              <div style={{ marginTop: '1rem', borderTop: '1px solid #334155', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Emissão: {new Date(data.emissionDate).toLocaleString('pt-BR')}<br />
                  Documento emitido para comprovação de regularidade operacional.
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8125rem', color: '#cbd5e1', fontWeight: 600 }}>
                  Q-MAX Contabilidade & Consultoria
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: '#ef4444', textAlign: 'center' }}>Não foi possível carregar as informações.</div>
          )}
        </div>
      </div>
    </div>
  );
}
