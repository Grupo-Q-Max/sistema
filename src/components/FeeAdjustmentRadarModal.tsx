import { useState, useEffect } from 'react';
import { DollarSign, Download, X, ExternalLink } from 'lucide-react';
import { API } from '../api';
import './FeeAdjustmentRadarModal.css';

export interface FeeSuggestion {
  companyId: string;
  code: string | null;
  name: string;
  cnpj: string;
  taxRegime: string;
  city: string | null;
  employees: number;
  reasons: string[];
  suggestedAdjustmentMonthly: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  responsibleDP?: string;
}

interface FeeRadarPayload {
  timestamp: string;
  totalOpportunityMonthly: number;
  totalOpportunityAnnual: number;
  companiesAffected: number;
  suggestions: FeeSuggestion[];
}

export interface FeeAdjustmentRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeeAdjustmentRadarModal({ isOpen, onClose }: FeeAdjustmentRadarModalProps) {
  const [data, setData] = useState<FeeRadarPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'ALL' | 'HIGH' | 'EMPLOYEES'>('ALL');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`${API}/api/billing/drift-radar`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json) setData(json);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const suggestions = (data?.suggestions || []).filter((s) => {
    if (tab === 'HIGH') return s.priority === 'HIGH';
    if (tab === 'EMPLOYEES') return s.employees >= 20;
    return true;
  });

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  };

  const handleExportCSV = () => {
    if (!data?.suggestions?.length) return;
    const header = 'Código;Razão Social;CNPJ;Regime;Funcionários DP;Honorário Adicional Sugerido (Mês);Prioridade;Motivo;Responsável DP\n';
    const rows = data.suggestions
      .map(
        (s) =>
          `"${s.code || ''}";"${s.name}";"${s.cnpj}";"${s.taxRegime}";${s.employees};"R$ ${s.suggestedAdjustmentMonthly}";"${s.priority}";"${s.reasons.join(' | ')}";"${s.responsibleDP || ''}"`
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `radar_reajuste_honorarios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpen360 = (companyId: string) => {
    window.dispatchEvent(new CustomEvent('open-company-360', { detail: { companyId } }));
  };

  return (
    <div className="fee-radar-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="fee-radar-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="fee-radar-header">
          <h3>
            <DollarSign size={20} color="#10b981" />
            Radar de Reajuste de Honorários (Desvio de Escopo)
          </h3>
          <div className="fee-radar-controls">
            <button
              type="button"
              className="fee-radar-btn-export"
              onClick={handleExportCSV}
              disabled={!data?.suggestions?.length}
            >
              <Download size={14} /> Exportar Comercial (CSV)
            </button>
            <button
              type="button"
              className="executive-report-btn-close"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="fee-radar-body">
          {/* Banner Oportunidade Financeira */}
          <div className="fee-radar-opportunity-banner">
            <div className="opportunity-title">
              <span>Recuperação de Receita Estimada</span>
              <h2>
                {formatCurrency(data?.totalOpportunityMonthly || 0)} <span style={{ fontSize: 16, fontWeight: 500, color: '#a7f3d0' }}>/ mês</span>
              </h2>
            </div>
            <div className="opportunity-meta">
              <div className="meta-item">
                <span>Impacto Anualizado</span>
                <strong style={{ color: '#34d399' }}>{formatCurrency(data?.totalOpportunityAnnual || 0)}/ano</strong>
              </div>
              <div className="meta-item">
                <span>Clientes Elegíveis</span>
                <strong>{data?.companiesAffected || 0} empresas</strong>
              </div>
            </div>
          </div>

          {/* Abas de Filtro */}
          <div className="fee-radar-tabs">
            <button
              type="button"
              className={`fee-radar-tab-btn ${tab === 'ALL' ? 'active' : ''}`}
              onClick={() => setTab('ALL')}
            >
              Todas as Oportunidades ({data?.suggestions?.length || 0})
            </button>
            <button
              type="button"
              className={`fee-radar-tab-btn ${tab === 'HIGH' ? 'active' : ''}`}
              onClick={() => setTab('HIGH')}
            >
              Alta Prioridade ({data?.suggestions?.filter((s) => s.priority === 'HIGH').length || 0})
            </button>
            <button
              type="button"
              className={`fee-radar-tab-btn ${tab === 'EMPLOYEES' ? 'active' : ''}`}
              onClick={() => setTab('EMPLOYEES')}
            >
              Equipes Volumosas (&ge; 20 func)
            </button>
          </div>

          {/* Tabela de Oportunidades */}
          <div className="fee-radar-table-container">
            {loading ? (
              <p style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                Calculando oportunidades de reajuste com base no volume de DP e regimes tributários...
              </p>
            ) : suggestions.length === 0 ? (
              <p style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                Nenhum desvio significativo de escopo encontrado nos critérios selecionados.
              </p>
            ) : (
              <table className="fee-radar-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Cód.</th>
                    <th>Razão Social</th>
                    <th style={{ width: 130 }}>Regime</th>
                    <th style={{ width: 100, textAlign: 'center' }}>Equipe DP</th>
                    <th>Desvios de Escopo Identificados</th>
                    <th style={{ width: 140, textAlign: 'right' }}>Honorário Sugerido</th>
                    <th style={{ width: 80, textAlign: 'center' }}>Raio-X</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={s.companyId}>
                      <td style={{ fontWeight: 600, color: '#94a3b8' }}>{s.code || '-'}</td>
                      <td>
                        <strong>{s.name}</strong>
                        {s.responsibleDP && (
                          <div style={{ fontSize: 10.5, color: '#64748b' }}>Resp DP: {s.responsibleDP}</div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: '#cbd5e1' }}>{s.taxRegime}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: s.employees >= 20 ? '#60a5fa' : '#cbd5e1' }}>
                          {s.employees} func.
                        </span>
                      </td>
                      <td>
                        {s.reasons.map((r, i) => (
                          <span key={i} className="reason-tag">
                            {r}
                          </span>
                        ))}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="fee-value-badge">+{formatCurrency(s.suggestedAdjustmentMonthly)}/mês</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="notification-action-btn"
                          title="Abrir Raio-X da Empresa"
                          onClick={() => handleOpen360(s.companyId)}
                        >
                          <ExternalLink size={12} />
                        </button>
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
