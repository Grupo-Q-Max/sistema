import {companyExitAllowsPeriod} from './companyExit';
import {canUserEditCompany,canUserViewCompany} from './companyPermissions';
import {defaultPopup,type PopupConfig} from './fiscalPopups';
import {isColumnActive} from './columnVisibility';
export const CUSHMAN_API_VERSION=2;
export const CUSHMAN_COLUMNS=[
 {key:'cush_observacao',name:'Observações Cushman',inputType:'TEXTAREA',countsProgress:false,replicates:true,source:''},
 {key:'cush_iss',name:'ISS Cushman',inputType:'TEXT',countsProgress:true,replicates:false,source:'iss'},
 {key:'cush_devec',name:'DEVEC Cushman',inputType:'TEXT',countsProgress:true,replicates:false,source:''},
 {key:'cush_sped_fiscal',name:'SPED Fiscal Cushman',inputType:'TEXT',countsProgress:true,replicates:false,source:'sped_fiscal'},
 {key:'cush_reinf',name:'REINF Cushman',inputType:'TEXT',countsProgress:true,replicates:false,source:'reinf'},
 {key:'cush_esocial',name:'e-social Cushman',inputType:'TEXT',countsProgress:true,replicates:false,source:''},
];
export const LEGACY_CUSHMAN_COLUMNS=['Validação de Locações','Relatório Despesas & Condomínio','Emissão de Boletos Cushman','Prestação de Contas Mensal','Envio de Relatórios Gerenciais'];
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function resolveCushmanKey(column:any):string|null {
 if(column.department!=='CUSHMAN')return null;
 if(column.columnKey)return column.columnKey;
 return CUSHMAN_COLUMNS.find(template=>normalize(template.name)===normalize(column.name||''))?.key||column.id||null;
}
export function cushmanPopup(key:string,name?:string):PopupConfig {
 const template=CUSHMAN_COLUMNS.find(column=>column.key===key);const popup=defaultPopup(template?.source||'',name||template?.name||'Detalhes Cushman');
 popup.title=name||template?.name||'Detalhes Cushman';
 if(!popup.fields.length)popup.fields=[{key:'observacao',label:'Observação da obrigação',type:'TEXTAREA',placeholder:'Informações desta competência',required:false,fullWidth:true,options:[]}];
 // Todos os modelos oferecem conclusão, pendência, N/A e retorno para pendente.
 popup.actions=popup.actions.map(action=>({...action,enabled:true}));return popup;
}
export function cushmanAccess(user:any,edit=false):boolean {
 if(!user||user.active===false)return false;
 if(['ADMIN','SOCIO'].includes(user.role))return true;
 if(!user.screenPermissions?.some((permission:any)=>permission.screen==='closings'&&permission.allowed))return false;
 const permission=user.sectorPermissions?.find((item:any)=>item.sector==='CUSHMAN');return edit?permission?.access==='EDIT':['VIEW','EDIT'].includes(permission?.access);
}
export function isCushmanCompany(company: any): boolean {
  if (!company) return false;
  const raw = (company.activeSectors || '').split(',').map((item: string) => item.trim().toUpperCase());
  if (!raw.includes('CUSHMAN')) return false;

  // No Cushman só entram Condomínios e Associações (ou empresas explicitamente identificadas como 05xxx ou Cushman)
  const isCondoOrAssoc = company.taxRegime === 'CONDOMINIOS' || company.taxRegime === 'ASSOCIACOES';
  const isCode05 = String(company.code || '').startsWith('05');
  const isCushmanNamed = /cushman/i.test(company.groupName || '') || /cushman/i.test(company.name || '');

  return isCondoOrAssoc || isCode05 || isCushmanNamed;
}
export function cushmanCompanyAllowed(user:any,company:any):boolean {
 return canUserViewCompany(user,company,'CUSHMAN');
}
export function cushmanCompanyEditable(user:any,company:any):boolean {
 return cushmanAccess(user,true)&&canUserEditCompany(user,company,'CUSHMAN');
}
export function cushmanCompanyEligible(company:any,period:Date):boolean {
 if (!isCushmanCompany(company)) return false;
 const next=new Date(Date.UTC(period.getUTCFullYear(),period.getUTCMonth()+1,1));
 return (!company.obligationStartDate||new Date(company.obligationStartDate)<next)&&companyExitAllowsPeriod(company,period);
}
export function cushmanApplicableColumns(columns:any[],period:Date):any[]{return columns.filter(column=>isColumnActive(column,period));}
export const CUSHMAN_COMPANY_FIELDS=[
 {key:'city',label:'Município',group:'Cadastro',type:'text'},
 {key:'hasClientCertificate',label:'Cert. Cliente',group:'Certificado',type:'checkbox'},
 {key:'certificateType',label:'Tipo Cert.',group:'Certificado',type:'certificate'},
 {key:'certificatePassword',label:'Senha Cert.',group:'Certificado',type:'password'},
 {key:'certificateIssue',label:'Emissão Cert.',group:'Certificado',type:'text'},
 {key:'certificateExpiration',label:'Venc. Cert.',group:'Certificado',type:'text'},
 {key:'targetProxyDate',label:'Proc. Target',group:'Datas e procuração',type:'date'},
 {key:'contractDate',label:'Data Contrato',group:'Datas e procuração',type:'date'},
 {key:'obligationStartDate',label:'Data Obrigação',group:'Datas e procuração',type:'date'},
 {key:'exitDate',label:'Data Saída',group:'Datas e procuração',type:'date'},
 {key:'municipalRegistration',label:'Insc. Municipal',group:'Prefeitura e inscrições',type:'text'},
 {key:'cityHallLogin',label:'Login Pref.',group:'Prefeitura e inscrições',type:'text'},
 {key:'ginfessPassword',label:'Senha GINFES',group:'Prefeitura e inscrições',type:'password'},
 {key:'cityHallLink',label:'Link Prefeitura',group:'Prefeitura e inscrições',type:'url'},
 {key:'gissOnlinePassword',label:'Senha GISS',group:'Prefeitura e inscrições',type:'password'},
 {key:'stateRegistration',label:'Insc. Estadual',group:'Prefeitura e inscrições',type:'text'},
] as const;

export const CUSHMAN_LEGACY_VALUES='cushman_preenchimentos_anteriores_v1';
export function cushmanTextValue(value:any,column?:any):string {
 if(value===undefined||value===null||value===false)return '';
 if(typeof value==='string')return value;
 if(value.status==='N/A')return 'N/A';
 if(typeof value==='number'||value===true)return value===true?'Concluído':String(value);
 const labels:Record<string,string>={CONCLUIDO:'Concluído','OK - DATA':'Concluído',SEM_MOVIMENTO:'Sem movimento','OK - SEM MOVIMENTO':'Sem movimento',PENDENCIA:'Pendência','PENDÊNCIA':'Pendência','N/A':'N/A'};
 const details=Object.entries(value.data||{}).filter(([,item])=>item!==null&&item!==undefined&&String(item).trim()!=='').map(([key,item])=>`${column?.popupConfig?.fields?.find((field:any)=>field.key===key)?.label||key}: ${typeof item==='object'?JSON.stringify(item):String(item)}`);
 if(value.completionDate)details.push(`Conclusão: ${value.completionDate}`);
 if(value.pendingReason)details.push(`Motivo: ${value.pendingReason}`);
 if(value.sentWithApi===true)details.push('Envio via API');
 const status=(['PENDENTE','PENDING'].includes(value.status)&&details.length?'Pendente':'')||labels[value.status]||(!['PENDENTE','PENDING',undefined,null].includes(value.status)?String(value.status):'');
 return [status,...details].filter(Boolean).join(' · ');
}
