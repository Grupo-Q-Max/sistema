// Guardião Fiscal do Simples Nacional
// Monitora a Receita Bruta Acumulada nos últimos 12 meses (RBT12)
// Alerta sobre estouro de Sublimite Estadual (R$ 3.6M) e Teto do Simples (R$ 4.8M)

export const SIMPLES_LIMITS = {
  CEILING: 4_800_000, // Teto máximo nacional (R$ 4,8 milhões)
  SUBLIMIT: 3_600_000, // Sublimite estadual para recolhimento de ICMS e ISS fora do DAS (R$ 3,6 milhões)
  WARNING_THRESHOLD: 4_320_000, // 90% do teto nacional para alerta preventivo de desenquadramento
};

export type SimplesGuardianRisk = 'SAFE' | 'SUBLIMIT_EXCEEDED' | 'CEILING_RISK' | 'CEILING_EXCEEDED';

export interface SimplesGuardianResult {
  isSimples: boolean;
  rbt12: number;
  risk: SimplesGuardianRisk;
  badgeLabel: string;
  badgeColor: string;
  advice: string;
}

export function checkSimplesGuardian(
  taxRegime: string | null | undefined,
  columnsData?: Record<string, any> | null
): SimplesGuardianResult {
  const normRegime = String(taxRegime || '').toUpperCase().trim();
  const isSimples = normRegime === 'SIMPLES_NACIONAL' || normRegime.includes('SIMPLES');

  if (!isSimples) {
    return {
      isSimples: false,
      rbt12: 0,
      risk: 'SAFE',
      badgeLabel: 'Regime Geral',
      badgeColor: '#64748b',
      advice: 'Empresa não enquadrada no Simples Nacional.',
    };
  }

  // Tentar extrair RBT12 de columnsData (PGDAS, rbt12, faturamento, etc.)
  let rbt12 = 0;
  if (columnsData) {
    const pgdas = columnsData.pgdas;
    if (pgdas && typeof pgdas === 'object') {
      const val = pgdas.data?.rbt12 || pgdas.data?.faturamento || pgdas.rbt12;
      if (val) {
        const clean = String(val).replace(/[^\d.,]/g, '').replace(',', '.');
        rbt12 = parseFloat(clean) || 0;
      }
    }
    if (!rbt12 && columnsData.rbt12) {
      rbt12 = parseFloat(String(columnsData.rbt12).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    }
  }

  if (rbt12 > SIMPLES_LIMITS.CEILING) {
    return {
      isSimples: true,
      rbt12,
      risk: 'CEILING_EXCEEDED',
      badgeLabel: 'Teto Simples Ultrapassado',
      badgeColor: '#ef4444',
      advice: `RBT12 de R$ ${rbt12.toLocaleString('pt-BR')} ultrapassou o teto de R$ 4,8M! Desenquadramento obrigatório do Simples Nacional.`,
    };
  }

  if (rbt12 > SIMPLES_LIMITS.WARNING_THRESHOLD) {
    return {
      isSimples: true,
      rbt12,
      risk: 'CEILING_RISK',
      badgeLabel: 'Risco Teto Simples (90%+)',
      badgeColor: '#f97316',
      advice: `RBT12 de R$ ${rbt12.toLocaleString('pt-BR')} atingiu mais de 90% do teto! Planeje a transição tributária para Lucro Presumido/Real.`,
    };
  }

  if (rbt12 > SIMPLES_LIMITS.SUBLIMIT) {
    return {
      isSimples: true,
      rbt12,
      risk: 'SUBLIMIT_EXCEEDED',
      badgeLabel: 'Sublimite ICMS/ISS Estourado',
      badgeColor: '#eab308',
      advice: `RBT12 de R$ ${rbt12.toLocaleString('pt-BR')} ultrapassou R$ 3,6M! O ICMS e o ISS devem ser recolhidos em guias estaduais/municipais fora do DAS.`,
    };
  }

  return {
    isSimples: true,
    rbt12,
    risk: 'SAFE',
    badgeLabel: 'Simples Regular',
    badgeColor: '#10b981',
    advice: rbt12 > 0
      ? `RBT12 de R$ ${rbt12.toLocaleString('pt-BR')} dentro dos limites regulares do Simples Nacional.`
      : 'RBT12 dentro dos limites regulares do Simples Nacional.',
  };
}

