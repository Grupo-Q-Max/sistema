/**
 * Regras operacionais de preenchimento automático por regime tributário no setor FISCAL:
 * - Imune IRPJ: Carnê Leão N/A, restante obrigatório
 * - Lucro Presumido: Carnê Leão N/A, restante obrigatório
 * - Lucro Real: Carnê Leão N/A, restante obrigatório
 * - Simples Nacional: Carnê Leão, Sped Contribuições e MIT N/A, restante obrigatório
 * - MEI: Impostos obrigatório, o restante N/A
 * - Pessoa Física: Carnê Leão obrigatório, o restante N/A
 */

export const ALL_FISCAL_KEYS = [
  'carne_leao',
  'reinf',
  'impostos',
  'iss',
  'mit',
  'sped_fiscal',
  'sped_contribuicao',
  'destda',
] as const;

export function getFiscalNaKeysForRegime(regime: string | null | undefined): string[] {
  if (!regime) return [];
  const normalized = regime.toUpperCase().trim();

  switch (normalized) {
    case 'IMUNE_IRPJ':
    case 'IMUNE IRPJ':
      return ['carne_leao'];

    case 'LUCRO_PRESUMIDO':
    case 'LUCRO PRESUMIDO':
      return ['carne_leao'];

    case 'LUCRO_REAL_TRIMESTRAL':
    case 'LUCRO_REAL_ESTIMATIVA':
    case 'LUCRO_REAL_ANUAL':
    case 'LUCRO REAL / TRIMESTRAL':
    case 'LUCRO REAL / ESTIMATIVA':
    case 'LUCRO REAL / ANUAL':
    case 'LUCRO REAL':
      return ['carne_leao'];

    case 'SIMPLES_NACIONAL':
    case 'SIMPLES NACIONAL':
      return ['carne_leao', 'sped_contribuicao', 'mit'];

    case 'MEI':
      // Apenas IMPOSTOS é obrigatório; todas as outras 7 obrigações são N/A
      return ['carne_leao', 'reinf', 'iss', 'mit', 'sped_fiscal', 'sped_contribuicao', 'destda'];

    case 'PESSOA_FISICA':
    case 'PESSOA FÍSICA':
    case 'PESSOA FISICA':
      // Apenas CARNÊ LEÃO é obrigatório; todas as outras 7 obrigações são N/A
      return ['reinf', 'impostos', 'iss', 'mit', 'sped_fiscal', 'sped_contribuicao', 'destda'];

    default:
      return [];
  }
}

/**
 * Retorna se para aquele regime aquela obrigação específica é dispensada por regra (N/A)
 */
export function isFiscalObligationNA(regime: string | null | undefined, colKey: string): boolean {
  const naKeys = getFiscalNaKeysForRegime(regime);
  return naKeys.includes(colKey);
}

/**
 * Aplica as regras de N/A no objeto columnsData do fechamento fiscal
 */
export function applyFiscalRegimeRules(
  regime: string | null | undefined,
  columnsData: Record<string, any> = {}
): Record<string, any> {
  const naKeys = new Set(getFiscalNaKeysForRegime(regime));
  const updated = { ...columnsData };

  for (const key of naKeys) {
    const existing = updated[key];
    // Se não tiver valor ou não tiver status ou for vazio/pendente, define N/A
    if (!existing || typeof existing !== 'object' || !existing.status || existing.status === 'PENDING' || existing.status === 'PENDENTE') {
      updated[key] = {
        status: 'N/A',
        label: 'N/A',
        autoFilled: true,
      };
    }
  }

  return updated;
}

