// Empresa externa: o cadastro não representa contrato contábil nem habilita obrigações.
export const EXTERNAL_INSTALLMENT_SECTOR='PARCELAMENTO_EXTERNO';
export const externalCompaniesExcluded = {
  AND: [
    { OR: [{ activeSectors: null }, { activeSectors: { not: EXTERNAL_INSTALLMENT_SECTOR } }] },
    { deletedAt: null }
  ]
};
export function isExternalInstallmentCompany(company:any):boolean{return company?.activeSectors===EXTERNAL_INSTALLMENT_SECTOR;}
export const INSTALLMENT_COMPANY_REGIMES=[
 {value:'MEI',label:'MEI'},{value:'SIMPLES_NACIONAL',label:'Simples Nacional'},{value:'SIMPLES_NACIONAL_HIBRIDO',label:'Simples Nacional Híbrido'},{value:'LUCRO_PRESUMIDO',label:'Lucro Presumido'},
 {value:'LUCRO_REAL_TRIMESTRAL',label:'Lucro Real Trimestral'},{value:'LUCRO_REAL_ESTIMATIVA',label:'Lucro Real Estimativa'},{value:'LUCRO_REAL_ANUAL',label:'Lucro Real Anual'},
 {value:'IMUNE_IRPJ',label:'Imune IRPJ'},{value:'CONDOMINIOS',label:'Condomínio'},{value:'DOMESTICA',label:'Doméstica'},{value:'ASSOCIACOES',label:'Associação'},{value:'PESSOA_FISICA',label:'Pessoa Física'},
];
export function normalizeCompanyCnpj(value:unknown):string {return typeof value==='string'?value.trim().replace(/[.\/\-\s]/g,'').toUpperCase():'';}
export function validateExternalInstallmentCompany(body:any):string|null {
 if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>191)return 'Informe a razão social (até 191 caracteres).';
 const cnpj=normalizeCompanyCnpj(body.cnpj);
 if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)||/^(.)\1+$/.test(cnpj))return 'Informe um CNPJ completo, com 14 caracteres, sendo os dois últimos numéricos.';
 if(!INSTALLMENT_COMPANY_REGIMES.some(regime=>regime.value===body.taxRegime))return 'Selecione a tributação da empresa.';
 for(const field of ['tradeName','code','city','groupName'])if(body[field]!=null&&(typeof body[field]!=='string'||body[field].trim().length>191))return 'Nome fantasia, código, município e grupo devem ter até 191 caracteres.';
 if(body.notes!=null&&(typeof body.notes!=='string'||body.notes.length>4000))return 'A observação deve ter até 4000 caracteres.';
 return null;
}
