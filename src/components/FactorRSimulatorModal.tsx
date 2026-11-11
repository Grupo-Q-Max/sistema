import React, { useState } from 'react';
import { Calculator, X, Sparkles, TrendingUp, DollarSign, MessageCircle, Copy, Check, Info } from 'lucide-react';
import './FactorRSimulatorModal.css';

interface FactorRSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCompanyName?: string;
}

export const FactorRSimulatorModal: React.FC<FactorRSimulatorModalProps> = ({
  isOpen,
  onClose,
  initialCompanyName = '',
}) => {
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [rbt12, setRbt12] = useState<number>(360000); // 360k anual (~30k/mês)
  const [folha12, setFolha12] = useState<number>(60000); // folha atual
  const [monthlyRevenue, setMonthlyRevenue] = useState<number>(30000);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Cálculo Fator R atual
  const fatorR = rbt12 > 0 ? (folha12 / rbt12) * 100 : 0;
  const isAnexoIII = fatorR >= 28;

  // Folha mínima necessária nos 12 meses para atingir 28%
  const folhaNecessaria12 = rbt12 * 0.28;
  const deficitFolha12 = Math.max(0, folhaNecessaria12 - folha12);

  // Pró-labore sugerido a emitir na competência atual
  const proLaboreIdealMes = deficitFolha12 > 0 ? Math.ceil(deficitFolha12 / 12) : 0;

  // Alíquotas estimadas (faixa 1 até 180k = 6% vs 15.5%; faixa 2 até 360k = ~11.2% vs ~18%; etc.)
  let aliqAnexoIII = 6.0;
  let aliqAnexoV = 15.5;

  if (rbt12 > 180000 && rbt12 <= 360000) {
    aliqAnexoIII = 11.2;
    aliqAnexoV = 18.0;
  } else if (rbt12 > 360000 && rbt12 <= 720000) {
    aliqAnexoIII = 13.5;
    aliqAnexoV = 19.5;
  } else if (rbt12 > 720000) {
    aliqAnexoIII = 16.0;
    aliqAnexoV = 20.5;
  }

  const aliquotaAtual = isAnexoIII ? aliqAnexoIII : aliqAnexoV;
  const aliquotaOtimizada = aliqAnexoIII;

  const impostoAtualMes = (monthlyRevenue * aliquotaAtual) / 100;
  const impostoOtimizadoMes = (monthlyRevenue * aliquotaOtimizada) / 100;
  const economiaMensal = Math.max(0, impostoAtualMes - impostoOtimizadoMes);
  const economiaAnual = economiaMensal * 12;

  const formatMoney = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleCopyReport = () => {
    const text =
      `*Diagnóstico de Fator R - Simples Nacional*\n` +
      `Empresa: ${companyName || 'Cliente'}\n` +
      `Receita Bruta (RBT12): ${formatMoney(rbt12)}\n` +
      `Folha + Pró-labore (12 meses): ${formatMoney(folha12)}\n` +
      `Fator R Atual: ${fatorR.toFixed(2)}% (${isAnexoIII ? 'Enquadrado no Anexo III ✅' : 'Tributado pelo Anexo V ⚠️'})\n\n` +
      `${
        !isAnexoIII
          ? `💡 *Oportunidade de Economia:*\n` +
            `Emitindo pró-labore de aproximadamente *${formatMoney(proLaboreIdealMes)}/mês*, o Fator R atinge os 28% necessários para migrar para o *Anexo III* (alíquota cai de ${aliqAnexoV}% para ${aliqAnexoIII}%).\n\n` +
            `💰 Economia estimada no imposto: *${formatMoney(economiaMensal)}/mês* (~${formatMoney(economiaAnual)}/ano).\n\n`
          : `Parabéns! Sua empresa já atinge a marca dos 28% e usufrui do Anexo III com alíquota reduzida.`
      }` +
      `Relatório gerado pela Assessoria Contábil.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Olá! Fizemos uma simulação tributária do *Fator R do Simples Nacional* para sua empresa:\n\n` +
      `• Fator R Atual: *${fatorR.toFixed(2)}%*\n` +
      `• Enquadramento: *${isAnexoIII ? 'Anexo III (Alíquota Reduzida)' : 'Anexo V (Alíquota Mais Alta)'}*\n` +
      (!isAnexoIII
        ? `• Economia Projetada: *${formatMoney(economiaMensal)}/mês* (~${formatMoney(economiaAnual)}/ano) ajustando o Pró-labore.\n\n`
        : `• Sua empresa está otimizada no menor anexo fiscal!\n\n`) +
      `Podemos conversar para planejar essa economia na próxima folha?`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  return (
    <div className="factor-modal-overlay" onClick={onClose}>
      <div className="factor-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="factor-modal-header">
          <div className="factor-title-wrap">
            <div className="factor-icon-box">
              <Calculator size={22} color="#a855f7" />
            </div>
            <div>
              <h3>Simulador do Fator "R" (Simples Nacional)</h3>
              <p>Planejamento tributário inteligente: Anexo III (6%) vs Anexo V (15,5%)</p>
            </div>
          </div>
          <button className="factor-btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="factor-modal-body">
          {/* Inputs Grid */}
          <div className="factor-inputs-grid">
            <div className="factor-input-group">
              <label>Nome do Cliente / Empresa</label>
              <input
                type="text"
                placeholder="Ex: Consultoria Médica Silva Ltda"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            <div className="factor-input-group">
              <label>Faturamento Bruto Últimos 12 Meses (RBT12)</label>
              <div className="factor-currency-wrap">
                <span>R$</span>
                <input
                  type="number"
                  value={rbt12}
                  onChange={(e) => setRbt12(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>

            <div className="factor-input-group">
              <label>Folha de Salários + Pró-labore (12 Meses)</label>
              <div className="factor-currency-wrap">
                <span>R$</span>
                <input
                  type="number"
                  value={folha12}
                  onChange={(e) => setFolha12(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>

            <div className="factor-input-group">
              <label>Previsão de Faturamento do Mês Atual</label>
              <div className="factor-currency-wrap">
                <span>R$</span>
                <input
                  type="number"
                  value={monthlyRevenue}
                  onChange={(e) => setMonthlyRevenue(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>
          </div>

          {/* Resultado Visual do Fator R */}
          <div className={`factor-gauge-box ${isAnexoIII ? 'success' : 'warning'}`}>
            <div className="factor-gauge-header">
              <div>
                <span className="factor-gauge-label">Fator "R" Calculado:</span>
                <div className="factor-gauge-value">
                  {fatorR.toFixed(2)}%
                  <span className={`factor-badge ${isAnexoIII ? 'badge-green' : 'badge-amber'}`}>
                    {isAnexoIII ? 'Anexo III (Econômico)' : 'Anexo V (Mais Caro)'}
                  </span>
                </div>
              </div>
              <div className="factor-target-info">
                <span>Meta Legal:</span>
                <strong>28,00%</strong>
              </div>
            </div>

            <div className="factor-progress-bar">
              <div
                className={`factor-progress-fill ${isAnexoIII ? 'fill-green' : 'fill-amber'}`}
                style={{ width: `${Math.min(100, (fatorR / 28) * 100)}%` }}
              />
            </div>

            <p className="factor-gauge-desc">
              {isAnexoIII
                ? '✅ Excelente! A relação folha/faturamento está acima de 28%, permitindo tributação com alíquota reduzida no Anexo III.'
                : '⚠️ Atenção: A folha representa menos de 28% do faturamento. A empresa está pagando imposto majorado no Anexo V.'}
            </p>
          </div>

          {/* Cards de Oportunidade e Economia */}
          <div className="factor-cards-grid">
            <div className="factor-card highlight">
              <div className="factor-card-title">
                <Sparkles size={16} color="#38bdf8" />
                <span>Pró-labore Sugerido</span>
              </div>
              <strong className="factor-card-big">{formatMoney(proLaboreIdealMes)}</strong>
              <small>Valor mensal para atingir os 28% no fechamento</small>
            </div>

            <div className="factor-card">
              <div className="factor-card-title">
                <DollarSign size={16} color="#10b981" />
                <span>Economia Mensal Estimada</span>
              </div>
              <strong className="factor-card-big" style={{ color: '#34d399' }}>
                {formatMoney(economiaMensal)}
              </strong>
              <small>Diferença líquida de imposto DAS no mês</small>
            </div>

            <div className="factor-card">
              <div className="factor-card-title">
                <TrendingUp size={16} color="#a855f7" />
                <span>Economia Projetada Anual</span>
              </div>
              <strong className="factor-card-big" style={{ color: '#c084fc' }}>
                {formatMoney(economiaAnual)}
              </strong>
              <small>Retenção direta de caixa para o empresário</small>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="factor-modal-footer">
          <div className="factor-footer-hint">
            <Info size={14} color="#94a3b8" />
            <span>Fundamentação: Art. 18, § 5º-J da Lei Complementar nº 123/2006.</span>
          </div>
          <div className="factor-footer-btns">
            <button type="button" className="factor-btn-secondary" onClick={handleCopyReport}>
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copied ? 'Copiado!' : 'Copiar Diagnóstico'}</span>
            </button>
            <button type="button" className="factor-btn-whatsapp" onClick={handleShareWhatsApp}>
              <MessageCircle size={15} />
              <span>Enviar no WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
