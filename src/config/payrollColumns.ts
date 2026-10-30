import {resolveCushmanKey} from './cushmanColumns';
import { ACCOUNTING_COLUMNS, resolveAccountingKey } from './accountingColumns';
export const PAYROLL_API_VERSION = 2;
import { resolveFiscalKey } from './fiscalPopups';
export type PayrollInputType = 'TEXT' | 'NUMBER' | 'SELECT' | 'TEXTAREA' | 'PASSWORD' | 'READONLY';
export type FieldConfig = { version: 1; placeholder: string; options: string[]; pendingOptions?: string[] };
export const MONTH_OPTIONS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', 'N/A'];
export const PAYROLL_COLUMNS: { key: string; name: string; inputType: PayrollInputType; options: string[]; replicates: boolean; countsProgress: boolean; isEditable: boolean; aliases: string[] }[] = [
  { key:'dp_observacao',name:'Observação do DP',inputType:'TEXTAREA',options:[],replicates:true,countsProgress:false,isEditable:true,aliases:['Observações DP','Observacao DP'] },
  { key:'dp_adto',name:'Adiantamento',inputType:'TEXT',options:[],replicates:false,countsProgress:false,isEditable:true,aliases:['ADTO'] },
  { key:'dp_folha_pagto',name:'Data de Pagamento Folha',inputType:'SELECT',options:['N/A','5º dia útil','Último dia'],replicates:true,countsProgress:false,isEditable:true,aliases:['Folha Pagto'] },
  { key:'dp_data_calc_folha',name:'Data Calc Folha',inputType:'TEXT',options:[],replicates:false,countsProgress:true,isEditable:true,aliases:[] },
  { key:'dp_data_envio_folha',name:'Data Envio Folha',inputType:'TEXT',options:[],replicates:false,countsProgress:true,isEditable:true,aliases:[] },
  { key:'dp_tipo_folha',name:'Tipo Folha',inputType:'SELECT',options:['Sem Movimento','MEI','Doméstico','Normal','Pró Labore'],replicates:true,countsProgress:false,isEditable:true,aliases:[] },
  { key:'dp_data_pagto',name:'Data pagamento Adiantamento',inputType:'SELECT',options:['Dia 15','Dia 20','N/A'],replicates:true,countsProgress:false,isEditable:true,aliases:['Data Pagto'] },
  { key:'dp_qtde_funcionarios',name:'Qtde Funcionários',inputType:'NUMBER',options:[],replicates:true,countsProgress:false,isEditable:true,aliases:['Número de Funcionários (Vidas)','Quantidade de Funcionários'] },
  { key:'dp_guias_sindicato',name:'Guias Sindicato',inputType:'TEXT',options:[],replicates:false,countsProgress:true,isEditable:true,aliases:[] },
  { key:'dp_fgts_dig',name:'FGTS Digital',inputType:'TEXT',options:[],replicates:false,countsProgress:true,isEditable:true,aliases:['FGTS Dig'] },
  { key:'dp_esocial',name:'E-Social',inputType:'TEXT',options:[],replicates:false,countsProgress:true,isEditable:true,aliases:[] },
  { key:'dp_dctf_web',name:'DCTF Web',inputType:'TEXT',options:[],replicates:false,countsProgress:true,isEditable:true,aliases:[] },
  { key:'dp_sd_login',name:'SD Login',inputType:'TEXT',options:[],replicates:false,countsProgress:false,isEditable:true,aliases:[] },
  { key:'dp_sd_senha',name:'SD Senha',inputType:'PASSWORD',options:[],replicates:false,countsProgress:false,isEditable:true,aliases:[] },
  { key:'dp_reinf_fiscal',name:'Reinf',inputType:'READONLY',options:[],replicates:false,countsProgress:false,isEditable:false,aliases:['REINF Fiscal'] },
];
export const LEGACY_DP_DEFAULTS = ['Cálculo de Folha','eSocial / DCTFWeb','FGTS Digital / DAE','Envio de Holerites & Guias','Férias / Rescisões','Fechamento de Ponto','Dissídio'];
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function resolveColumnKey(column: any): string | null {
  if (column.columnKey) return column.columnKey;
  if (column.department === 'CUSHMAN') return resolveCushmanKey(column);
  if (column.department === 'CONTABIL') return resolveAccountingKey(column);
  if (column.department === 'FISCAL') return resolveFiscalKey(column);
  if (column.department !== 'DP') return null;
  const name=normalize(column.name || '');
  return PAYROLL_COLUMNS.find(c=>[c.name,...c.aliases].some(n=>normalize(n)===name))?.key || column.id || null;
}
export function effectiveFieldConfig(column: any): FieldConfig {
  const normName = normalize(column?.name || '');
  const isDissidio = normName.includes('dissidio') || (column?.columnKey && column.columnKey.includes('dissidio'));

  if (column?.fieldConfig && typeof column.fieldConfig === 'object') {
    const rawOpts = Array.isArray(column.fieldConfig.options) ? column.fieldConfig.options : [];
    const options = rawOpts.length === 0 && isDissidio ? [...MONTH_OPTIONS] : [...rawOpts];
    const placeholder = typeof column.fieldConfig.placeholder === 'string' ? column.fieldConfig.placeholder : '';
    const pendingOptions = Array.isArray(column.fieldConfig.pendingOptions) ? [...column.fieldConfig.pendingOptions] : undefined;
    return pendingOptions ? { version: 1, placeholder, options, pendingOptions } : { version: 1, placeholder, options };
  }
  const template = [...PAYROLL_COLUMNS, ...ACCOUNTING_COLUMNS].find(c => c.key === resolveColumnKey(column));
  const options = template && Array.isArray(template.options) && template.options.length > 0 
    ? [...template.options] 
    : isDissidio ? [...MONTH_OPTIONS] : [];
  return { version: 1, placeholder: '', options };
}
export function validateFieldConfig(value: unknown): string | null {
  if(!value || typeof value!=='object') return 'Configuração de campo inválida.';
  const c=value as FieldConfig;
  if(c.version!==1 || typeof c.placeholder!=='string' || !Array.isArray(c.options) || c.options.some(o=>typeof o!=='string'||!o.trim()) || new Set(c.options).size!==c.options.length) return 'Informe opções únicas e não vazias.';
  if(c.pendingOptions !== undefined && (!Array.isArray(c.pendingOptions) || c.pendingOptions.some(o=>typeof o!=='string'||!o.trim()))) return 'Opções pendentes inválidas.';
  return null;
}
export function validatePayrollValue(column:any,value:any):string|null {
  const key=resolveColumnKey(column);
  if(key==='dp_reinf_fiscal' || column.inputType==='READONLY') return 'REINF é somente leitura e vem do Fiscal da mesma competência.';
  if(column.isEditable===false) return 'Esta coluna está configurada como somente leitura.';
  if(column.inputType==='NUMBER') {
    if(value===''||value===null) return null;
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||!Number.isInteger(value)) return 'Informe uma quantidade inteira, maior ou igual a zero.';
  } else if(column.inputType==='CHECKBOX') {
    if(typeof value!=='boolean') return 'Valor de checkbox inválido.';
  } else if(column.inputType==='SELECT') {
    if (value === null || value === undefined || value === '') return null;
    const cfg = effectiveFieldConfig(column);
    const allowed = new Set([...cfg.options, ...(cfg.pendingOptions || []), 'N/A']);
    if(typeof value!=='string'||!allowed.has(value)) return 'Escolha uma das opções configuradas.';
  } else if(['TEXT','TEXTAREA','PASSWORD','DATE'].includes(column.inputType)) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' && (typeof value !== 'object' || value === null)) return 'Informe um texto ou status válido.';
  }
  return null;
}
