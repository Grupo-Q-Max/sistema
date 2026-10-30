export type PopupAction = 'NA' | 'PENDENCIA' | 'SEM_MOV' | 'SALVAR' | 'OK_DATA' | 'LIMPAR';
export type PopupField = { key: string; label: string; type: 'TEXT' | 'NUMBER' | 'DATE' | 'TEXTAREA' | 'SELECT'; placeholder: string; required: boolean; fullWidth: boolean; options: string[] };
export type PopupConfig = {
  version: 1; title: string; description: string; fields: PopupField[];
  actions: { id: PopupAction; label: string; enabled: boolean }[];
  askApiOnSave: boolean; askApiOnNoMovement: boolean; askDate: boolean;
};
const labels: Record<PopupAction, string> = { NA: 'N/A', PENDENCIA: 'Pendência', SEM_MOV: 'OK - SEM MOVIMENTO', SALVAR: 'Salvar', OK_DATA: 'OK - DATA', LIMPAR: 'LIMPAR / VOLTAR PARA PENDENTE' };
export const ACTION_IDS = Object.keys(labels) as PopupAction[];
const field = (key: string, label: string, placeholder = ''): PopupField => ({ key, label, type: 'TEXT', placeholder, required: false, fullWidth: ['icms', 'outros'].includes(key), options: [] });
function preset(title: string, fields: PopupField[], api = false): PopupConfig {
  const active: PopupAction[] = fields.length ? ['NA', 'PENDENCIA', 'SEM_MOV', 'SALVAR'] : ['NA', 'SEM_MOV', 'OK_DATA', 'PENDENCIA', 'LIMPAR'];
  return { version: 1, title, description: '', fields, actions: [...active, ...ACTION_IDS.filter(id => !active.includes(id))].map(id => ({ id, label: labels[id], enabled: active.includes(id) })), askApiOnSave: api, askApiOnNoMovement: api, askDate: true };
}
export const FISCAL_POPUPS: Record<string, PopupConfig> = {
  carne_leao: preset('Carnê Leão', [field('reciboSaude', 'Recibo Saúde'), field('receitasDiversas', 'Receitas Diversas'), field('despesasDedutiveis', 'Despesas Dedutíveis'), field('inss', 'INSS'), field('iss', 'ISS'), field('irrf', 'IRRF')]),
  reinf: preset('Detalhes REINF', [field('irrf1708', 'IRRF 1708', 'Ex: 100,00 ou S/ Mov'), field('crf5952', 'CRF 5952'), field('inssPrestados', 'INSS Prestados'), field('inssTomados', 'INSS Tomados'), field('desoneracao', 'Desoneração'), field('irrf3208', 'IRRF 3208'), field('outros', 'Outros (Opcional)')], true),
  impostos: preset('Detalhes Impostos', [field('faturamento', 'Faturamento'), field('issPrestados', 'ISS Prestados'), field('issTomados', 'ISS Tomados'), field('das', 'DAS'), field('darfPisCofins', 'DARF PIS/COFINS'), field('darfIrpjCsll', 'DARF IRPJ/CSLL'), field('icms', 'ICMS', 'Obrigatório'), field('outros', 'Outros (Opcional)', 'Opcional')], true),
  iss: preset('ISS', []), mit: preset('MIT', [], true), sped_fiscal: preset('Sped Fiscal', []), sped_contribuicao: preset('Sped Contribuição', []), destda: preset('Destda', []),
};
// A chave permanece igual mesmo se o nome da coluna mudar.
export function resolveFiscalKey(column: { columnKey?: string | null; name?: string; department?: string; inputType?: string; id?: string }): string | null {
  if (column.columnKey) return column.columnKey;
  if (column.department === 'FISCAL') {
    if (column.inputType && column.inputType !== 'POPUP') return null;
    const name = (column.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliases: Record<string, string> = { carneleao: 'carne_leao', reinf: 'reinf', impostos: 'impostos', iss: 'iss', mit: 'mit', spedfiscal: 'sped_fiscal', spedcontribuicao: 'sped_contribuicao', spedcontribuicoes: 'sped_contribuicao', spedcontrib: 'sped_contribuicao', destda: 'destda' };
    return aliases[name] || (column.inputType === 'POPUP' && column.id ? column.id : null);
  }
  return column.inputType === 'POPUP' && column.id ? column.id : null;
}
export function defaultPopup(key: string, name = 'Detalhes'): PopupConfig {
  return structuredClone(FISCAL_POPUPS[key] || preset(name, []));
}
export function effectivePopup(column: any, key: string): PopupConfig {
  return column?.popupConfig ? structuredClone(column.popupConfig) : defaultPopup(key, column?.name);
}
export function validatePopup(config: unknown): string | null {
  if (!config || typeof config !== 'object') return 'Configuração do popup inválida.';
  const c = config as PopupConfig;
  if (c.version !== 1 || typeof c.title !== 'string' || !c.title.trim() || c.title.length > 190 || typeof c.description !== 'string') return 'Informe um título válido para o popup.';
  if (!Array.isArray(c.fields) || c.fields.length > 60 || !Array.isArray(c.actions) || c.actions.length !== ACTION_IDS.length) return 'Configuração de campos ou botões inválida.';
  const keys = new Set<string>();
  for (const f of c.fields) {
    if (!f || typeof f.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(f.key) || ['__proto__', 'constructor', 'prototype'].includes(f.key) || keys.has(f.key)) return 'Cada campo precisa de uma chave única válida (letras, números e _).';
    keys.add(f.key);
    if (typeof f.label !== 'string' || !f.label.trim() || !['TEXT', 'NUMBER', 'DATE', 'TEXTAREA', 'SELECT'].includes(f.type) || typeof f.required !== 'boolean' || typeof f.fullWidth !== 'boolean' || typeof f.placeholder !== 'string' || !Array.isArray(f.options) || f.options.some(o => typeof o !== 'string')) return 'Revise o nome, tipo e opções dos campos.';
    if (f.type === 'SELECT' && (!f.options.length || f.options.some(o => !o.trim()) || new Set(f.options).size !== f.options.length)) return 'Informe opções únicas e não vazias para a lista.';
  }
  const ids = new Set<string>();
  for (const a of c.actions) {
    if (!a || !ACTION_IDS.includes(a.id) || ids.has(a.id) || typeof a.enabled !== 'boolean' || typeof a.label !== 'string' || !a.label.trim()) return 'Revise os botões do popup.';
    ids.add(a.id);
  }
  if (!c.actions.some(a => a.enabled)) return 'Habilite pelo menos um botão.';
  if ([c.askApiOnSave, c.askApiOnNoMovement, c.askDate].some(v => typeof v !== 'boolean')) return 'Regras de API/data inválidas.';
  return null;
}
