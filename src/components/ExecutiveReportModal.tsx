import { useState, useEffect } from 'react';
import { FileText, X, Printer, TrendingUp, ShieldCheck, DollarSign, Users, Award } from 'lucide-react';
import { API } from '../api';
import './ExecutiveReportModal.css';

interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  year?: number;
  month?: number;
}

export function ExecutiveReportModal({
  isOpen,
  onClose,
  year: propYear,
  month: propMonth,
}: ExecutiveReportModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [year, setYear] = useState(propYear ?? now.getFullYear());
  const [month, setMonth] = useState(propMonth != null ? (propMonth < 12 && propMonth > 0 ? propMonth : propMonth + 1) : (now.getMonth() + 1));

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/executive-report?year=${year}&month=${month}`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao gerar relatório executivo:', err);
        setLoading(false);
      });
  }, [isOpen, year, month]);

  if (!isOpen) return null;

  const kpis = data?.kpis || { totalCompanies: 0, fiscalCompletionRate: 0, payrollCompletionRate: 0 };
  const financial = data?.financialHealth || { total: 0, regularCount: 0, pendingCount: 0, blockedCount: 0, adimplenciaRate: 100 };
  const regimes = data?.regimeDistribution || { SIMPLES: 0, PRESUMIDO: 0, REAL: 0 };

  return (
    <div className="exec-overlay" onClick={onClose}>
      <div className="exec-card" onClick={e => e.stopPropagation()}>
        <div className="exec-header">
          <div className="exec-title-group">
            <FileText className="exec-icon" />
            <div>
              <h2 className="exec-title">Relatório Executivo Mensal para Diretoria</h2>
              <div className="exec-subtitle">
                Dossiê executivo compilado · Competência {String(month).padStart(2, '0')}/{year}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="button"
              className="exec-print-btn"
              onClick={() => window.print()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: '#38bdf8',
                color: '#0f172a',
                border: 'none',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <Printer size={15} />
              <span>Imprimir / Salvar PDF</span>
            </button>
            <button className="exec-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="exec-content">
          {/* Seletor de Competência */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600 }}>Filtrar Competência:</span>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
              }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Mês {String(m).padStart(2, '0')}</option>
              ))}
            </select>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              style={{
                background: '#1e293b',
                color: '#f8fafc',
                border: '1px solid #334155',
                padding: '0.35rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
              }}
            >
              {[2025, 2026, 2027].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              Compilando dados da diretoria...
            </div>
          ) : (
            <>
              {/* KPIs de Produção */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8', fontSize: '0.8125rem', fontWeight: 700 }}>
                    <ShieldCheck size={18} />
                    <span>SETOR FISCAL</span>
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.5rem' }}>
                    {kpis.fiscalCompletionRate}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {kpis.fiscalCompleted} de {kpis.totalCompanies} empresas fechadas
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '0.8125rem', fontWeight: 700 }}>
                    <Users size={18} />
                    <span>DEPARTAMENTO PESSOAL</span>
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.5rem' }}>
                    {kpis.payrollCompletionRate}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {kpis.payrollCompleted} de {kpis.totalCompanies} empresas concluídas
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b', fontSize: '0.8125rem', fontWeight: 700 }}>
                    <DollarSign size={18} />
                    <span>ADIMPLÊNCIA DE HONORÁRIOS</span>
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.5rem' }}>
                    {financial.adimplenciaRate}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {financial.regularCount} em dia · {financial.blockedCount} bloqueados (+60d)
                  </div>
                </div>
              </div>

              {/* Distribuição Tributária e Resumo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingUp size={16} color="#38bdf8" />
                    Distribuição da Carteira por Regime
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                      <span>Simples Nacional</span>
                      <strong style={{ color: '#10b981' }}>{regimes.SIMPLES} empresas</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                      <span>Lucro Presumido</span>
                      <strong style={{ color: '#38bdf8' }}>{regimes.PRESUMIDO} empresas</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                      <span>Lucro Real</span>
                      <strong style={{ color: '#a855f7' }}>{regimes.REAL} empresas</strong>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Award size={16} color="#eab308" />
                    Resumo Executivo para a Reunião
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                    A operação deste mês manteve uma taxa de cumprimento de prazos fiscais de <strong>{kpis.fiscalCompletionRate}%</strong> e de folha de <strong>{kpis.payrollCompletionRate}%</strong>.
                    Atualmente, <strong>{financial.blockedCount} cliente(s)</strong> encontram-se com serviços e certidões travados por inadimplência acima de 60 dias, recomendando-se cobrança ativa pela diretoria.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
