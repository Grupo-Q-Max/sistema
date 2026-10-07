export interface UserSectorPermission {
  id?: string;
  userId?: string;
  sector: 'CONTABIL' | 'FISCAL' | 'PARCELAMENTO' | 'DP' | 'CUSHMAN';
  access: 'NONE' | 'VIEW' | 'EDIT';
}

export interface UserScreenPermission {
  id?: string;
  userId?: string;
  screen: string;
  allowed: boolean;
}

export interface UserCompanyAccess {
  userId?: string;
  companyId: string;
  company?: {
    id: string;
    name: string;
    cnpj: string;
    taxRegime?: string;
  };
}

export interface CurrentUser {
  sessionToken?: string;
  id: string;
  name?: string | null;
  email: string;
  role: 'ADMIN' | 'SOCIO' | 'FISCAL' | 'DP' | 'CONTABIL' | 'FINANCEIRO' | 'CADASTRO';
  active: boolean;
  leftAt?: string | null;
  exitReason?: string | null;
  companyScope: 'ALL' | 'RESPONSIBLE' | 'CUSTOM';
  canViewAllCompanies?: boolean;
  sectorPermissions?: UserSectorPermission[];
  screenPermissions?: UserScreenPermission[];
  companyAccess?: UserCompanyAccess[];
  responsibleAssignments?: Array<{
    id?: string;
    companyId: string;
    sector?: string | null;
    company?: {
      id: string;
      name: string;
      cnpj: string;
    };
  }>;
}
