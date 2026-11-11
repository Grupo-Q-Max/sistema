import { useState } from 'react';
import { DollarSign, X, AlertTriangle, CheckCircle } from 'lucide-react';
import './PricingCalculatorModal.css';

interface PricingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName?: string;
  initialFee?: number;
}

export function PricingCalculatorModal({
  isOpen,
  onClose,
  companyName,
  initialFee = 900,
}: PricingCalculatorModalProps) {
  const [currentFee, setCurrentFee] = useState<number>(initialFee);
  const [regime, setRegime] = useState<string>('SIMPLES');
  const [employeesCount, setEmployeesCount] = useState<number>(5);
  const [invoicesVolume, setInvoicesVolume] = useState<number>(80);
  const [bankAccountsCount, setBankAccountsCount] = useState<number>(2);
  const [complexity, setComplexity] = useState<'BAIXA' | 'MEDIA' | 'ALTA'>('MEDIA');
  const hourlyCost = 65; // Custo médio hora/homem do escritório

  if (!isOpen) return null;

  // Cálculo de Horas Gastas por Mês
  let baseHoursFiscal = regime === 'SIMPLES' ? 3.5 : regime === 'PRESUMIDO' ? 7.0 : 14.0;
  baseHoursFiscal += (invoicesVolume / 50) * 1.5;

  let baseHoursFolha = employeesCount * 0.8 + 2.0;
  let baseHoursContabil = bankAccountsCount * 2.5 + (invoicesVolume / 40) * 1.2;

  let complexityMultiplier = complexity === 'BAIXA' ? 0.85 : complexity === 'MEDIA' ? 1.0 : 1.35;
  const totalEstimatedHours = Math.round((baseHoursFiscal + baseHoursFolha + baseHoursContabil) * complexityMultiplier * 10) / 10;

  // Custo Operacional Mensal
  const operationalCost = Math.round(totalEstimatedHours * hourlyCost);

  // Margem de Lucro Efetiva
  const effectiveProfit = currentFee - operationalCost;
  const effectiveProfitMargin = currentFee > 0 ? Math.round((effectiveProfit / currentFee) * 100) : 0;

  // Honorário Ideal Recomendado (Margem Alvo de 40%)
  const recommendedFee = Math.round(operationalCost / 0.6);

  return (
    <div className="pricing-overlay" onClick={onClose}>
      <div className="pricing-card" onClick={e => e.stopPropagation()}>
        <div className="pricing-header">
          <div className="pricing-title-group">
            <DollarSign className="pricing-icon" />
            <div>
              <h2 className="pricing-title">
                {companyName ? `Precificação & Rentabilidade · ${companyName}` : 'Calculadora de Precificação & Rentabilidade do Contrato'}
              </h2>
              <div className="pricing-subtitle">
                Avaliação de esforço em horas x honorário atual cobrado vs honorário ideal
              </div>
            </div>
          </div>
          <button className="pricing-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="pricing-content">
          {/* Inputs do Contrato */}
          <div className="pricing-inputs-grid">
            <div className="pricing-input-group">
              <label>Honorário Atual Cobrado (R$/mês)</label>
              <input
                type="number"
                value={currentFee}
                onChange={e => setCurrentFee(Math.max(100, Number(e.target.value)))}
                step="50"
              />
            </div>

            <div className="pricing-input-group">
              <label>Regime Tributário</label>
              <select value={regime} onChange={e => setRegime(e.target.value)}>
                <option value="SIMPLES">Simples Nacional</option>
                <option value="PRESUMIDO">Lucro Presumido</option>
                <option value="REAL">Lucro Real</option>
              </select>
            </div>

            <div className="pricing-input-group">
              <label>Quantidade de Funcionários</label>
              <input
                type="number"
                value={employeesCount}
                onChange={e => setEmployeesCount(Math.max(0, Number(e.target.value)))}
              />
            </div>

            <div className="pricing-input-group">
              <label>Volume Médio de NFs (mês)</label>
              <input
                type="number"
                value={invoicesVolume}
                onChange={e => setInvoicesVolume(Math.max(0, Number(e.target.value)))}
                step="10"
              />
            </div>

            <div className="pricing-input-group">
              <label>Contas Bancárias / Extratos</label>
              <input
                type="number"
                value={bankAccountsCount}
                onChange={e => setBankAccountsCount(Math.max(1, Number(e.target.value)))}
              />
            </div>

            <div className="pricing-input-group">
              <label>Complexidade Operacional</label>
              <select value={complexity} onChange={e => setComplexity(e.target.value as any)}>
                <option value="BAIXA">Baixa (Cliente organizado)</option>
                <option value="MEDIA">Média (Padrão de mercado)</option>
                <option value="ALTA">Alta (Muitas conciliações/atrito)</option>
              </select>
            </div>
          </div>

          {/* Banner de Diagnóstico do Contrato */}
          <div
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '12px',
              border: `1px solid ${
                effectiveProfitMargin < 0
                  ? 'rgba(239, 68, 68, 0.4)'
                  : effectiveProfitMargin < 25
                  ? 'rgba(245, 158, 11, 0.4)'
                  : 'rgba(16, 185, 129, 0.4)'
              }`,
              background:
                effectiveProfitMargin < 0
                  ? 'rgba(239, 68, 68, 0.12)'
                  : effectiveProfitMargin < 25
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(16, 185, 129, 0.12)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: effectiveProfitMargin < 0 ? '#ef4444' : effectiveProfitMargin < 25 ? '#f59e0b' : '#10b981',
                }}
              >
                {effectiveProfitMargin < 0 ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                DIAGNÓSTICO:{' '}
                {effectiveProfitMargin < 0
                  ? 'CONTRATO DEFICITÁRIO (Prejuízo Operacional)'
                  : effectiveProfitMargin < 25
                  ? 'MARGEM APERTADA (Abaixo da média saudável)'
                  : 'CONTRATO SAUDÁVEL & LUCRATIVO'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                {effectiveProfitMargin < 0
                  ? 'O custo em horas da equipe para atender este cliente é superior ao valor faturado no honorário.'
                  : effectiveProfitMargin < 25
                  ? 'Recomenda-se aplicar reajuste anual para alinhar com o volume de trabalho entregue.'
                  : 'O contrato oferece margem adequada para remunerar a equipe e reinvestir na operação.'}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                Honorário Recomendado
              </span>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>
                R$ {recommendedFee.toLocaleString('pt-BR')}
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>/mês</span>
              </div>
            </div>
          </div>

          {/* Grade de Resultados */}
          <div className="pricing-results-grid">
            <div className="pricing-result-card">
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f8fafc' }}>{totalEstimatedHours}h</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginTop: '0.25rem' }}>
                Tempo Gasto Estimado / Mês
              </div>
            </div>
            <div className="pricing-result-card">
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444' }}>
                R$ {operationalCost.toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginTop: '0.25rem' }}>
                Custo da Equipe (R$ 65/h)
              </div>
            </div>
            <div className="pricing-result-card">
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: effectiveProfit >= 0 ? '#10b981' : '#ef4444',
                }}
              >
                R$ {effectiveProfit.toLocaleString('pt-BR')}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginTop: '0.25rem' }}>
                Lucro Operacional Líquido
              </div>
            </div>
            <div className="pricing-result-card">
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: effectiveProfitMargin >= 40 ? '#10b981' : effectiveProfitMargin >= 25 ? '#38bdf8' : '#f59e0b',
                }}
              >
                {effectiveProfitMargin}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, marginTop: '0.25rem' }}>
                Margem Efetiva do Contrato
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
