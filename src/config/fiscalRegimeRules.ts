/**
 * Regras operacionais de preenchimento automático por regime tributário no setor FISCAL.
 * Suporta regras padrão e regras customizáveis salvas no banco (AppConfig: fiscal_regime_rules).
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

export const ALL_TAX_REGIMES = [
  { key: 'MEI', label: 'MEI' },
  { key: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { key: 'SIMPLES_NACIONAL_HIBRIDO', label: 'Simples Nacional Híbrido' },
  { key: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { key: 'LUCRO_REAL_TRIMESTRAL', label: 'Lucro Real / Trimestral' },
  { key: 'LUCRO_REAL_ESTIMATIVA', label: 'Lucro Real / Estimativa' },
  { key: 'LUCRO_REAL_ANUAL', label: 'Lucro Real / Anual' },
  { key: 'IMUNE_IRPJ', label: 'Imune IRPJ' },
  { key: 'CONDOMINIOS', label: 'Condomínios' },
  { key: 'DOMESTICA', label: 'Doméstica' },
  { key: 'ASSOCIACOES', label: 'Associações' },
  { key: 'PESSOA_FISICA', label: 'Pessoa Física' },
] as const;

export type FiscalRegimeNaMap = Record<string, string[]>;

export const DEFAULT_FISCAL_REGIME_NA_RULES: FiscalRegimeNaMap = {
  IMUNE_IRPJ: ['carne_leao'],
  LUCRO_PRESUMIDO: ['carne_leao'],
  LUCRO_REAL_TRIMESTRAL: ['carne_leao'],
  LUCRO_REAL_ESTIMATIVA: ['carne_leao'],
  LUCRO_REAL_ANUAL: ['carne_leao'],
  SIMPLES_NACIONAL: ['carne_leao', 'sped_contribuicao', 'mit'],
  SIMPLES_NACIONAL_HIBRIDO: ['carne_leao', 'sped_contribuicao', 'mit'],
  MEI: ['carne_leao', 'reinf', 'iss', 'mit', 'sped_fiscal', 'sped_contribuicao', 'destda'],
  PESSOA_FISICA: ['reinf', 'impostos', 'iss', 'mit', 'sped_fiscal', 'sped_contribuicao', 'destda'],
  CONDOMINIOS: [],
  DOMESTICA: [],
  ASSOCIACOES: [],
};

let activeRuntimeNaRules: FiscalRegimeNaMap | null = null;

export function normalizeFiscalRegimeRules(raw: any): FiscalRegimeNaMap {
  const result: FiscalRegimeNaMap = {};
  for (const r of ALL_TAX_REGIMES) {
    const incoming = raw && typeof raw === 'object' ? raw[r.key] : undefined;
    if (Array.isArray(incoming)) {
      result[r.key] = Array.from(
        new Set(
          incoming
            .filter((k: any) => typeof k === 'string' && k.trim())
            .map((k: string) => k.trim())
        )
      );
    } else {
      result[r.key] = [...(DEFAULT_FISCAL_REGIME_NA_RULES[r.key] || [])];
    }
  }
  return result;
}

export function setActiveFiscalRegimeRules(rules: any) {
  activeRuntimeNaRules = rules ? normalizeFiscalRegimeRules(rules) : null;
}

export function getActiveFiscalRegimeRules(): FiscalRegimeNaMap {
  return activeRuntimeNaRules || normalizeFiscalRegimeRules(DEFAULT_FISCAL_REGIME_NA_RULES);
}

export function normalizeRegimeKey(regime: string | null | undefined): string {
  if (!regime) return '';
  const normalized = regime.toUpperCase().trim();
  switch (normalized) {
    case 'IMUNE_IRPJ':
    case 'IMUNE IRPJ':
      return 'IMUNE_IRPJ';
    case 'LUCRO_PRESUMIDO':
    case 'LUCRO PRESUMIDO':
      return 'LUCRO_PRESUMIDO';
    case 'LUCRO_REAL_TRIMESTRAL':
    case 'LUCRO REAL / TRIMESTRAL':
    case 'LUCRO REAL/TRIMESTRAL':
      return 'LUCRO_REAL_TRIMESTRAL';
    case 'LUCRO_REAL_ESTIMATIVA':
    case 'LUCRO REAL / ESTIMATIVA':
    case 'LUCRO REAL/ESTIMATIVA':
      return 'LUCRO_REAL_ESTIMATIVA';
    case 'LUCRO_REAL_ANUAL':
    case 'LUCRO REAL / ANUAL':
    case 'LUCRO REAL/ANUAL':
    case 'LUCRO REAL':
      return 'LUCRO_REAL_ANUAL';
    case 'SIMPLES_NACIONAL':
    case 'SIMPLES NACIONAL':
      return 'SIMPLES_NACIONAL';
    case 'SIMPLES_NACIONAL_HIBRIDO':
    case 'SIMPLES NACIONAL HIBRIDO':
    case 'SIMPLES NACIONAL HÍBRIDO':
    case 'SIMPLES NACIONAL HIDRIDO':
      return 'SIMPLES_NACIONAL_HIBRIDO';
    case 'MEI':
      return 'MEI';
    case 'PESSOA_FISICA':
    case 'PESSOA FÍSICA':
    case 'PESSOA FISICA':
      return 'PESSOA_FISICA';
    case 'CONDOMINIOS':
    case 'CONDOMÍNIOS':
      return 'CONDOMINIOS';
    case 'DOMESTICA':
    case 'DOMÉSTICA':
      return 'DOMESTICA';
    case 'ASSOCIACOES':
    case 'ASSOCIAÇÕES':
      return 'ASSOCIACOES';
    default:
      return normalized;
  }
}

export function getFiscalNaKeysForRegime(
  regime: string | null | undefined,
  customRules?: FiscalRegimeNaMap | null
): string[] {
  const key = normalizeRegimeKey(regime);
  if (!key) return [];
  const rules = customRules || activeRuntimeNaRules || DEFAULT_FISCAL_REGIME_NA_RULES;
  return Array.isArray(rules[key]) ? rules[key] : [];
}

/**
 * Retorna se para aquele regime aquela obrigação específica é dispensada por regra (N/A)
 */
export function isFiscalObligationNA(
  regime: string | null | undefined,
  colKey: string,
  customRules?: FiscalRegimeNaMap | null
): boolean {
  const naKeys = getFiscalNaKeysForRegime(regime, customRules);
  return naKeys.includes(colKey);
}

/**
 * Aplica as regras de N/A no objeto columnsData do fechamento fiscal
 */
export function applyFiscalRegimeRules(
  regime: string | null | undefined,
  columnsData: Record<string, any> = {},
  customRules?: FiscalRegimeNaMap | null
): Record<string, any> {
  const naKeys = new Set(getFiscalNaKeysForRegime(regime, customRules));
  const updated: Record<string, any> = { ...columnsData };

  // Se uma coluna tinha sido autoFilled=true com N/A anteriormente, mas a regra mudou para Obrigatório, libera!
  for (const [key, val] of Object.entries(updated)) {
    if (val && typeof val === 'object' && val.status === 'N/A' && val.autoFilled === true && !naKeys.has(key)) {
      delete updated[key];
    }
  }

  for (const key of naKeys) {
    const existing = updated[key];
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
