import { parseFlexibleDate } from './dateUtils';

export type QualityIssue={key:string;label:string;severity:'ERROR'|'WARNING'};
const empty=(value:any)=>value===null||value===undefined||String(value).trim()==='';
export function certificateDate(value:any):Date|null {
 return parseFlexibleDate(value);
}
export function companyQuality(company:any,now=new Date()):QualityIssue[]{
 const issues:QualityIssue[]=[];const add=(key:string,label:string,severity:QualityIssue['severity']='ERROR')=>issues.push({key,label,severity});
 if(empty(company.name))add('name','Razão social ausente');
 const digits=String(company.cnpj||'').replace(/\D/g,'');if(![11,14].includes(digits.length))add('document','Documento ausente ou incompleto');
 if(empty(company.taxRegime))add('taxRegime','Tributação ausente');
 if(empty(company.contractDate))add('contractDate','Data de contrato ausente');
 if(empty(company.obligationStartDate))add('obligationStartDate','Data de obrigação ausente');
 if(company.contractDate&&company.obligationStartDate&&new Date(company.contractDate)>new Date(company.obligationStartDate))add('dateOrder','Obrigação anterior ao contrato','WARNING');
 if(company.exitDate&&company.obligationStartDate&&new Date(company.exitDate)<new Date(company.obligationStartDate))add('exitDate','Saída anterior à obrigação');
 if(!company.hasClientCertificate)add('noCertificate','Empresa sem certificado','WARNING');
 else {
  if(empty(company.certificateType))add('certificateType','Tipo do certificado ausente');
  if(empty(company.certificateExpiration))add('certificateExpiration','Vencimento do certificado ausente');
  else {const expiration=certificateDate(company.certificateExpiration);if(!expiration)add('certificateInvalid','Vencimento do certificado inválido');else if(expiration<now)add('certificateExpired','Certificado vencido','WARNING');else if(expiration.getTime()-now.getTime()<=30*86400000)add('certificateSoon','Certificado vence em até 30 dias','WARNING');}
  if(empty(company.certificatePassword))add('certificatePassword','Senha do certificado ausente','WARNING');
 }
 if(empty(company.code))add('code','Código não informado','WARNING');
 if(empty(company.city))add('city','Município não informado','WARNING');
 return issues;
}
