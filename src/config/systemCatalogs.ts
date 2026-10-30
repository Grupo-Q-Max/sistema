export interface CompanyCatalogConfig {
  companyTypes: string[];
  deliveryMethods: string[];
  certificateTypes: string[];
  nfAccessTypes: string[];
  groupSuggestions: string[];
}

export const DEFAULT_COMPANY_CATALOG: CompanyCatalogConfig = {
  companyTypes: [
    'Comércio',
    'Holding',
    'Igreja',
    'Indústria',
    'Serv/Com',
    'Serviço',
    'Transporte',
  ],
  deliveryMethods: [
    'E-mail',
    'Nibo',
    'Nibo/WhatsApp',
    'Nibo/E-mail',
    'Nibo/Onvio',
    'Onvio',
    'WhatsApp',
  ],
  certificateTypes: [
    'A1',
    'A3 CARTÃO',
    'A3 TOKEN',
  ],
  nfAccessTypes: [
    'Senha GOV',
    'Senha Própria',
    'Certificado A1',
    'Certificado A3',
    'Outro',
  ],
  groupSuggestions: [],
};

function sanitizeStringList(input: any, fallback: string[]): string[] {
  if (!Array.isArray(input)) return [...fallback];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function normalizeCompanyCatalog(raw: any): CompanyCatalogConfig {
  if (!raw || typeof raw !== 'object') {
    return {
      companyTypes: [...DEFAULT_COMPANY_CATALOG.companyTypes],
      deliveryMethods: [...DEFAULT_COMPANY_CATALOG.deliveryMethods],
      certificateTypes: [...DEFAULT_COMPANY_CATALOG.certificateTypes],
      nfAccessTypes: [...DEFAULT_COMPANY_CATALOG.nfAccessTypes],
      groupSuggestions: [...DEFAULT_COMPANY_CATALOG.groupSuggestions],
    };
  }
  const companyTypes = sanitizeStringList(raw.companyTypes, DEFAULT_COMPANY_CATALOG.companyTypes);
  const deliveryMethods = sanitizeStringList(raw.deliveryMethods, DEFAULT_COMPANY_CATALOG.deliveryMethods);
  const certificateTypes = sanitizeStringList(raw.certificateTypes, DEFAULT_COMPANY_CATALOG.certificateTypes);
  const nfAccessTypes = sanitizeStringList(raw.nfAccessTypes, DEFAULT_COMPANY_CATALOG.nfAccessTypes);
  const groupSuggestions = sanitizeStringList(raw.groupSuggestions, []);
  return {
    companyTypes: companyTypes.length ? companyTypes : [...DEFAULT_COMPANY_CATALOG.companyTypes],
    deliveryMethods: deliveryMethods.length ? deliveryMethods : [...DEFAULT_COMPANY_CATALOG.deliveryMethods],
    certificateTypes: certificateTypes.length ? certificateTypes : [...DEFAULT_COMPANY_CATALOG.certificateTypes],
    nfAccessTypes: nfAccessTypes.length ? nfAccessTypes : [...DEFAULT_COMPANY_CATALOG.nfAccessTypes],
    groupSuggestions,
  };
}

export function mergeOptionsWithCurrent(options: string[], currentValue?: string | null): string[] {
  const val = (currentValue || '').trim();
  if (!val) return options;
  const exists = options.some((opt) => opt.toLocaleLowerCase('pt-BR') === val.toLocaleLowerCase('pt-BR'));
  return exists ? options : [val, ...options];
}

