import { useState, useEffect } from 'react';
import { FileText, Printer, X } from 'lucide-react';
import { API } from '../api';
import './ExecutiveReportModal.css';

interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  year?: number;
  month?: number;
  period?: string;
}

export function ExecutiveReportModal({ isOpen, onClose, year, month, period }: ExecutiveReportModalProps) {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const query = period
      ? `period=${period}`
      : (year !== undefined && month !== undefined)
        ? `period=${year}-${String(month + 1).padStart(2, '0')}-01`
        : '';
    fetch(`${API}/api/dashboard${query ? `?${query}` : ''}`)
      .then(res => res.json())
      .then(json => {
        setDashboardData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar dados executivos:', err);
        setLoading(false);
      });
  }, [isOpen, period]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const overview = dashboardData?.overview || {};
  const sectors = dashboardData?.sectors || {};

  return (
    <div className="exec-modal-overlay" onClick={onClose}>
      <div className="exec-modal-card" onClick={e => e.stopPropagation()}>
        <div className="exec-header">
          <div className="exec-title-group">
            <FileText className="exec-icon" />
            <div>
              <h2 className="exec-title">Relatório Executivo Mensal — Diretoria</h2>
              <div className="exec-subtitle">
                Briefing executivo consolidado com SLA, conformidade e índices operacionais
              </div>
            </div>
          </div>
          <div className="exec-actions">
            <button className="exec-btn-print" onClick={handlePrint}>
              <Printer size={16} /> Imprimir / Salvar PDF
            </button>
            <button className="exec-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="exec-content">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Consolidando métricas e dados executivos da competência...
            </div>
          ) : (
            <div className="exec-printable" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Cabeçalho formal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #334155', paddingBottom: '1rem' }}>
                <div>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>GRUPO Q-MAX CONTABILIDADE</h1>
                  <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                    Relatório Mensal de Fechamento Operacional e Gestão de Riscos
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8125rem', color: '#94a3b8' }}>
                  <div><strong>Competência:</strong> {dashboardData?.currentMonthLabel || 'Novembro/2026'}</div>
                  <div><strong>Emissão:</strong> {new Date().toLocaleDateString('pt-BR')}</div>
                </div>
              </div>

              {/* Destaque Macro / SLA */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Taxa Global SLA</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981', marginTop: '0.2rem' }}>
                    {overview.overallProgress ?? 0}%
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Conclusão dentro do prazo</div>
                </div>
                <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Empresas Ativas</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.2rem' }}>
                    {overview.totalCompanies ?? 0}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Carteira monitorada</div>
                </div>
                <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Fechamentos 100%</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#a855f7', marginTop: '0.2rem' }}>
                    {overview.completedCount ?? 0}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Todas as guias entregues</div>
                </div>
                <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '10px', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Pendências Críticas</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: (overview.pendingCount ?? 0) > 0 ? '#ef4444' : '#10b981', marginTop: '0.2rem' }}>
                    {overview.pendingCount ?? 0}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Requerem intervenção</div>
                </div>
              </div>

              {/* Desempenho por Setor */}
              <div style={{ background: '#1e293b', padding: '1.25rem', borderRadius: '12px', border: '1px solid #334155' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 1rem 0', color: '#f8fafc' }}>
                  Desempenho Consolidado por Setor
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  {['FISCAL', 'DP', 'CONTABIL'].map(sec => {
                    const sData = sectors[sec] || {};
                    return (
                      <div key={sec} style={{ background: '#0f172a', padding: '0.9rem', borderRadius: '8px', border: '1px solid #1e293b' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#38bdf8' }}>{sec}</span>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#10b981' }}>{sData.progress ?? 0}%</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#334155', borderRadius: '3px', margin: '0.5rem 0', overflow: 'hidden' }}>
                          <div style={{ width: `${sData.progress ?? 0}%`, height: '100%', background: '#10b981' }} />
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Concluídos: {sData.completed ?? 0}</span>
                          <span>Pendentes: {sData.pending ?? 0}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Termo de Encerramento e Assinatura */}
              <div style={{ borderTop: '1px solid #334155', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Documento gerado automaticamente pelo Sistema Integrado de Fechamento Pro.<br />
                  Auditoria com logs imutáveis e conformidade fiscal e trabalhista (LGPD).
                </div>
                <div style={{ textAlign: 'center', width: '220px' }}>
                  <div style={{ borderBottom: '1px solid #94a3b8', paddingBottom: '0.5rem', marginBottom: '0.3rem' }} />
                  <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>Diretoria de Operações</div>
                  <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>Responsável Técnico</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
