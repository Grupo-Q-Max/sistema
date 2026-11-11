import { useState } from 'react';
import { Landmark, X, Sparkles } from 'lucide-react';
import './TaxReformSimulatorModal.css';

interface TaxReformSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TaxReformSimulatorModal({ isOpen, onClose }: TaxReformSimulatorModalProps) {
  const [revenue, setRevenue] = useState<number>(2400000);
  const [creditInputsPercent, setCreditInputsPercent] = useState<number>(45); // 45% de insumos com crédito
  const [sector, setSector] = useState<'SERVICOS' | 'COMERCIO' | 'INDUSTRIA'>('SERVICOS');

  if (!isOpen) return null;

  // 1. Cenário Atual (PIS/COFINS + ICMS/ISS médio)
  // Serviços: PIS/COFINS (3.65% ou 9.25%) + ISS (2 a 5% ~ 3.5%) -> Total ~ 7.15% no Presumido
  // Comércio: PIS/COFINS + ICMS (~18% - créditos) -> Efetivo ~ 11%
  let currentTaxRate = sector === 'SERVICOS' ? 0.0865 : sector === 'COMERCIO' ? 0.12 : 0.145;
  const currentAnnualTax = revenue * currentTaxRate;

  // 2. Cenário Teste 2026 (0.9% CBS + 0.1% IBS = 1.0% de alíquota teste)
  const testPhaseTax = revenue * 0.01;

  // 3. Cenário Pleno Reforma 2033 (IVA Dual ~26.5% padrão com crédito financeiro amplo)
  // Crédito = (Receita * creditInputsPercent) * 26.5%
  const standardIvaRate = 0.265;
  const grossIva = revenue * standardIvaRate;
  const creditIva = (revenue * (creditInputsPercent / 100)) * standardIvaRate;
  const netIva2033 = Math.max(0, grossIva - creditIva);
  const effectiveIvaRate = (netIva2033 / revenue) * 100;

  return (
    <div className="taxref-overlay" onClick={onClose}>
      <div className="taxref-card" onClick={e => e.stopPropagation()}>
        <div className="taxref-header">
          <div className="taxref-title-group">
            <Landmark className="taxref-icon" />
            <div>
              <h2 className="taxref-title">Simulador da Reforma Tributária (IBS / CBS / IVA Dual)</h2>
              <div className="taxref-subtitle">
                Projeção do impacto da Emenda Constitucional 132/PLP 68: Fase de Teste 2026 vs Modelo Pleno 2033
              </div>
            </div>
          </div>
          <button className="taxref-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="taxref-content">
          {/* Inputs de Simulação */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Receita Anual Estimada (R$)</label>
              <input
                type="number"
                value={revenue}
                onChange={e => setRevenue(Math.max(1000, Number(e.target.value)))}
                step="100000"
                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem', color: '#fff', fontSize: '0.875rem' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Segmento Operacional</label>
              <select
                value={sector}
                onChange={e => setSector(e.target.value as any)}
                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem', color: '#fff', fontSize: '0.875rem' }}
              >
                <option value="SERVICOS">Prestação de Serviços</option>
                <option value="COMERCIO">Comércio / Atacado / Varejo</option>
                <option value="INDUSTRIA">Indústria / Manufatura</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Despesas com Crédito de IVA (%)</label>
              <input
                type="number"
                value={creditInputsPercent}
                onChange={e => setCreditInputsPercent(Math.max(0, Math.min(90, Number(e.target.value))))}
                step="5"
                style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem', color: '#fff', fontSize: '0.875rem' }}
              />
            </div>
          </div>

          {/* Cards Comparativos dos 3 Cenários */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#94a3b8' }}>CENÁRIO ATUAL (PIS/COFINS/ISS)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc', marginTop: '0.5rem' }}>
                R$ {Math.round(currentAnnualTax).toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                Alíquota efetiva estimada: {(currentTaxRate * 100).toFixed(1)}%
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #38bdf8', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#38bdf8' }}>FASE DE TESTE (2026/2027)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8', marginTop: '0.5rem' }}>
                R$ {Math.round(testPhaseTax).toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                0,9% CBS Federal + 0,1% IBS Estadual/Mun. (Total 1,0%)
              </div>
            </div>

            <div style={{ background: '#1e293b', border: '1px solid #a855f7', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#a855f7' }}>TRANSIÇÃO COMPLETA (2033)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#a855f7', marginTop: '0.5rem' }}>
                R$ {Math.round(netIva2033).toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                Alíquota líquida pós-créditos de insumos: {effectiveIvaRate.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Análise Consultiva */}
          <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '12px', padding: '1rem 1.25rem', fontSize: '0.8125rem', color: '#cbd5e1' }}>
            <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={16} /> PARECER CONSULTIVO DA REFORMA
            </div>
            {sector === 'SERVICOS' ? (
              <span>
                Para empresas de Serviços, a ausência de insumos físicos faz com que o modelo IVA (~26,5%) gere aumento da carga bruta caso o cliente não esteja no Simples Nacional. O planejamento tributário e o aproveitamento de créditos de subcontratação serão vitais a partir de 2027.
              </span>
            ) : (
              <span>
                Para empresas de Comércio e Indústria, o modelo de não-cumulatividade plena com aproveitamento integral de créditos de insumos (energia, telecomunicações, aluguéis e matérias-primas) pode manter ou até reduzir o custo efetivo de tributação.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
