import { useState } from 'react';
import { Calculator, X, Sparkles } from 'lucide-react';
import './TaxSimulatorModal.css';

interface TaxSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRevenue?: number;
  initialPayroll?: number;
  companyName?: string;
  currentRegime?: string;
}

export function TaxSimulatorModal({
  isOpen,
  onClose,
  initialRevenue = 1200000,
  initialPayroll = 360000,
  companyName,
  currentRegime,
}: TaxSimulatorModalProps) {
  const [annualRevenue, setAnnualRevenue] = useState<number>(initialRevenue);
  const [annualPayroll, setAnnualPayroll] = useState<number>(initialPayroll);
  const [activityType, setActivityType] = useState<string>('SERVICOS'); // 'COMERCIO' | 'SERVICOS' | 'INDUSTRIA'
  const [netMarginPercent, setNetMarginPercent] = useState<number>(15);

  if (!isOpen) return null;

  // 1. Simples Nacional Calculation
  // Fator R = Folha / Receita
  const factorR = annualRevenue > 0 ? (annualPayroll / annualRevenue) : 0;
  let simplesRate = 0.08; // 8% default
  if (activityType === 'COMERCIO') {
    simplesRate = annualRevenue <= 180000 ? 0.04 : annualRevenue <= 360000 ? 0.073 : annualRevenue <= 720000 ? 0.095 : 0.115;
  } else if (activityType === 'INDUSTRIA') {
    simplesRate = annualRevenue <= 180000 ? 0.045 : annualRevenue <= 360000 ? 0.078 : annualRevenue <= 720000 ? 0.10 : 0.125;
  } else {
    // Serviços: se Fator R >= 28%, entra no Anexo III, senão Anexo V
    if (factorR >= 0.28) {
      simplesRate = annualRevenue <= 180000 ? 0.06 : annualRevenue <= 360000 ? 0.112 : annualRevenue <= 720000 ? 0.135 : 0.16;
    } else {
      simplesRate = annualRevenue <= 180000 ? 0.155 : annualRevenue <= 360000 ? 0.18 : annualRevenue <= 720000 ? 0.195 : 0.21;
    }
  }
  const simplesAnnualTax = annualRevenue * simplesRate;

  // 2. Lucro Presumido Calculation
  // PIS (0.65%) + COFINS (3%) = 3.65%
  // Presunção: Serviços 32%, Comércio 8%
  const presuncaoRate = activityType === 'COMERCIO' ? 0.08 : 0.32;
  const basePresumida = annualRevenue * presuncaoRate;
  // IRPJ: 15% + 10% excedente de R$ 240k/ano
  const irpjNominal = basePresumida * 0.15;
  const irpjExcedente = Math.max(0, (basePresumida - 240000) * 0.10);
  // CSLL: Serviços 9% sobre 32% (2.88%), Comércio 9% sobre 12% (1.08%)
  const csllPresuncaoRate = activityType === 'COMERCIO' ? 0.12 : 0.32;
  const csll = (annualRevenue * csllPresuncaoRate) * 0.09;
  const pisCofins = annualRevenue * 0.0365;
  // ISS / ICMS estimado: ~3%
  const issIcms = annualRevenue * 0.03;
  // CPP sobre a folha (20% patronal + RAT + terceiros ~ 27.8%)
  const cppPresumido = annualPayroll * 0.278;
  const presumidoAnnualTax = irpjNominal + irpjExcedente + csll + pisCofins + issIcms + cppPresumido;

  // 3. Lucro Real Calculation
  const realProfit = Math.max(0, annualRevenue * (netMarginPercent / 100));
  const irpjReal = (realProfit * 0.15) + Math.max(0, (realProfit - 240000) * 0.10);
  const csllReal = realProfit * 0.09;
  // PIS/COFINS não-cumulativo líquido ~ 4%
  const pisCofinsReal = annualRevenue * 0.04;
  const cppReal = annualPayroll * 0.278;
  const realAnnualTax = irpjReal + csllReal + pisCofinsReal + issIcms + cppReal;

  // Identificar o melhor regime
  const options = [
    { name: 'Simples Nacional', tax: simplesAnnualTax, rate: (simplesAnnualTax / annualRevenue) * 100 },
    { name: 'Lucro Presumido', tax: presumidoAnnualTax, rate: (presumidoAnnualTax / annualRevenue) * 100 },
    { name: 'Lucro Real', tax: realAnnualTax, rate: (realAnnualTax / annualRevenue) * 100 },
  ];
  options.sort((a, b) => a.tax - b.tax);
  const bestOption = options[0];
  const worstOption = options[options.length - 1];
  const maxSavings = Math.max(0, worstOption.tax - bestOption.tax);

  return (
    <div className="tax-sim-overlay" onClick={onClose}>
      <div className="tax-sim-card" onClick={e => e.stopPropagation()}>
        <div className="tax-sim-header">
          <div className="tax-sim-title-group">
            <Calculator className="tax-sim-icon" />
            <div>
              <h2 className="tax-sim-title">
                {companyName ? `Comparador Tributário · ${companyName}` : 'Comparador Tributário Inteligente'}
              </h2>
              <div className="tax-sim-subtitle">
                {currentRegime ? `Regime Atual: ${currentRegime} · ` : ''}Simulação comparativa: Simples vs Presumido vs Real
              </div>
            </div>
          </div>
          <button className="tax-sim-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="tax-sim-content">
          {/* Inputs de Simulação */}
          <div className="tax-sim-inputs-grid">
            <div className="tax-sim-input-group">
              <label>Receita Bruta Anual (R$)</label>
              <input
                type="number"
                value={annualRevenue}
                onChange={e => setAnnualRevenue(Math.max(1000, Number(e.target.value)))}
                step="50000"
              />
            </div>
            <div className="tax-sim-input-group">
              <label>Folha Anual + Pró-Labore (R$)</label>
              <input
                type="number"
                value={annualPayroll}
                onChange={e => setAnnualPayroll(Math.max(0, Number(e.target.value)))}
                step="10000"
              />
            </div>
            <div className="tax-sim-input-group">
              <label>Atividade Principal</label>
              <select value={activityType} onChange={e => setActivityType(e.target.value)}>
                <option value="SERVICOS">Prestação de Serviços</option>
                <option value="COMERCIO">Comércio / Varejo</option>
                <option value="INDUSTRIA">Indústria / Fabricação</option>
              </select>
            </div>
            <div className="tax-sim-input-group">
              <label>Margem Líquida Est. Lucro Real (%)</label>
              <input
                type="number"
                value={netMarginPercent}
                onChange={e => setNetMarginPercent(Math.max(1, Math.min(100, Number(e.target.value))))}
                step="1"
                min="1"
                max="100"
              />
            </div>
          </div>

          {/* Banner de Economia Projetada */}
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.8125rem', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={16} /> REGIME MAIS VANTAJOSO RECOMENDADO: {bestOption.name.toUpperCase()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                Fator R calculado: {(factorR * 100).toFixed(1)}% {activityType === 'SERVICOS' && (factorR >= 0.28 ? ' (Enquadrado no Anexo III)' : ' (Enquadrado no Anexo V)')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>
                Economia de R$ {maxSavings.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} / ano
              </div>
              <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Comparado ao regime mais oneroso</div>
            </div>
          </div>

          {/* Cards dos 3 Regimes */}
          <div className="tax-sim-results-grid">
            {/* Simples Nacional */}
            <div className={`tax-sim-regime-card ${bestOption.name === 'Simples Nacional' ? 'best' : ''}`}>
              {bestOption.name === 'Simples Nacional' && <span className="tax-sim-best-badge">Mais Econômico</span>}
              <h3 className="tax-sim-regime-title">Simples Nacional</h3>
              <div>
                <div className="tax-sim-tax-val">R$ {simplesAnnualTax.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                <div className="tax-sim-effective-rate">Alíquota Efetiva: {((simplesAnnualTax / annualRevenue) * 100).toFixed(2)}%</div>
              </div>
              <div className="tax-sim-breakdown">
                <div className="tax-sim-breakdown-row">
                  <span>Guia Única DAS:</span>
                  <strong>R$ {simplesAnnualTax.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
                </div>
                <div className="tax-sim-breakdown-row">
                  <span>INSS Patronal:</span>
                  <strong>Incluso no DAS</strong>
                </div>
              </div>
            </div>

            {/* Lucro Presumido */}
            <div className={`tax-sim-regime-card ${bestOption.name === 'Lucro Presumido' ? 'best' : ''}`}>
              {bestOption.name === 'Lucro Presumido' && <span className="tax-sim-best-badge">Mais Econômico</span>}
              <h3 className="tax-sim-regime-title">Lucro Presumido</h3>
              <div>
                <div className="tax-sim-tax-val">R$ {presumidoAnnualTax.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                <div className="tax-sim-effective-rate">Carga Efetiva: {((presumidoAnnualTax / annualRevenue) * 100).toFixed(2)}%</div>
              </div>
              <div className="tax-sim-breakdown">
                <div className="tax-sim-breakdown-row">
                  <span>PIS / COFINS (3.65%):</span>
                  <strong>R$ {pisCofins.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
                </div>
                <div className="tax-sim-breakdown-row">
                  <span>IRPJ + CSLL:</span>
                  <strong>R$ {(irpjNominal + irpjExcedente + csll).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
                </div>
                <div className="tax-sim-breakdown-row">
                  <span>INSS Patronal Folha:</span>
                  <strong>R$ {cppPresumido.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
                </div>
              </div>
            </div>

            {/* Lucro Real */}
            <div className={`tax-sim-regime-card ${bestOption.name === 'Lucro Real' ? 'best' : ''}`}>
              {bestOption.name === 'Lucro Real' && <span className="tax-sim-best-badge">Mais Econômico</span>}
              <h3 className="tax-sim-regime-title">Lucro Real</h3>
              <div>
                <div className="tax-sim-tax-val">R$ {realAnnualTax.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                <div className="tax-sim-effective-rate">Carga Efetiva: {((realAnnualTax / annualRevenue) * 100).toFixed(2)}%</div>
              </div>
              <div className="tax-sim-breakdown">
                <div className="tax-sim-breakdown-row">
                  <span>Margem Estimada:</span>
                  <strong>{netMarginPercent}%</strong>
                </div>
                <div className="tax-sim-breakdown-row">
                  <span>IRPJ + CSLL (34% s/ Lucro):</span>
                  <strong>R$ {(irpjReal + csllReal).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
                </div>
                <div className="tax-sim-breakdown-row">
                  <span>INSS Patronal Folha:</span>
                  <strong>R$ {cppReal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
