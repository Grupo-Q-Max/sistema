export type SectorKey = 'FISCAL' | 'DP' | 'CONTABIL' | 'CUSHMAN' | 'PARCELAMENTO';

export function isPrivilegedUser(user: any): boolean {
  return Boolean(user && (user.role === 'ADMIN' || user.role === 'SOCIO'));
}

export function hasSectorPermission(user: any, sector: SectorKey, requireEdit = false): boolean {
  if (!user || user.active === false) return false;
  if (isPrivilegedUser(user)) return true;
  const perm = user.sectorPermissions?.find((p: any) => p.sector === sector);
  if (!perm) {
    if (user.role === sector) return true;
    return false;
  }
  return requireEdit ? perm.access === 'EDIT' : perm.access === 'VIEW' || perm.access === 'EDIT';
}

export function isUserResponsibleForCompany(
  user: any,
  company: any,
  sector?: SectorKey | null,
  extraPlanResponsibleIds?: string[]
): boolean {
  if (!user?.id) return false;
  const uid = user.id;

  if (Array.isArray(extraPlanResponsibleIds) && extraPlanResponsibleIds.includes(uid)) {
    return true;
  }

  const matchesSector = (entrySector?: string | null) => {
    if (!sector) return true; // Qualquer setor (ex: tela geral de Empresas)
    if (!entrySector) return true; // Responsável geral
    if (sector === 'PARCELAMENTO') return entrySector === 'PARCELAMENTO' || entrySector === 'FISCAL';
    if (sector === 'CUSHMAN') return entrySector === 'CUSHMAN' || entrySector === 'FISCAL';
    return entrySector === sector;
  };

  if (company) {
    if (company.responsibleId && company.responsibleId === uid) return true;
    if (Array.isArray(company.responsibles)) {
      const hit = company.responsibles.some((r: any) => {
        const rUid = r?.userId || r?.user?.id;
        return rUid === uid && matchesSector(r?.sector);
      });
      if (hit) return true;
    }
  }

  if (company?.id && Array.isArray(user.responsibleAssignments)) {
    const hit = user.responsibleAssignments.some(
      (r: any) => r?.companyId === company.id && matchesSector(r?.sector)
    );
    if (hit) return true;
  }

  return false;
}

export function canUserViewCompany(
  user: any,
  company: any,
  sector?: SectorKey | null,
  extraPlanResponsibleIds?: string[]
): boolean {
  if (!user) return false;
  if (isPrivilegedUser(user)) return true;

  const scope = user.companyScope || (user.canViewAllCompanies === false ? 'CUSTOM' : 'ALL');
  if (scope === 'ALL') return true;
  if (scope === 'CUSTOM') {
    return Boolean(user.companyAccess?.some((a: any) => a.companyId === company?.id));
  }
  // RESPONSIBLE
  return isUserResponsibleForCompany(user, company, sector, extraPlanResponsibleIds);
}

export function canUserEditCompany(
  user: any,
  company: any,
  sector?: SectorKey | null,
  extraPlanResponsibleIds?: string[]
): boolean {
  if (!user || user.active === false) return false;
  if (isPrivilegedUser(user)) return true;

  if (sector && !hasSectorPermission(user, sector, true)) {
    return false;
  }

  if (!canUserViewCompany(user, company, sector, extraPlanResponsibleIds)) {
    return false;
  }

  const scope = user.companyScope || (user.canViewAllCompanies === false ? 'CUSTOM' : 'ALL');
  if (scope === 'RESPONSIBLE' || Boolean(user.editOnlyResponsible)) {
    return isUserResponsibleForCompany(user, company, sector, extraPlanResponsibleIds);
  }

  // scope === 'ALL' ou 'CUSTOM' com editOnlyResponsible === false
  return true;
}

/**
 * Determina com precisão se uma empresa pertence a um determinado setor operacional.
 * - 'CUSHMAN': apenas se CUSHMAN estiver explicitamente listado em activeSectors.
 * - 'PARCELAMENTO': apenas para empresas com escopo de parcelamento.
 * - 'FISCAL' | 'DP' | 'CONTABIL': se activeSectors for nulo, vazio ou 'TODOS', pertence a todos os 3.
 *   Se for uma lista específica (ex: 'FISCAL,DP' ou 'CONTABIL'), valida se contém o setor.
 */
export function companyBelongsToSector(
  company: { activeSectors?: string | null; taxRegime?: string | null; code?: string | null; groupName?: string | null; name?: string | null } | null | undefined,
  sector: SectorKey
): boolean {
  if (!company) return false;
  const raw = (company.activeSectors || '').trim();

  // Setor CUSHMAN: apenas se 'CUSHMAN' estiver expressamente marcado e for entidade legítima de condomínio/associação/cushman
  if (sector === 'CUSHMAN') {
    if (!raw) return false;
    const parts = raw.split(',').map(s => s.trim().toUpperCase());
    if (!parts.includes('CUSHMAN')) return false;

    const isCondoOrAssoc = company.taxRegime === 'CONDOMINIOS' || company.taxRegime === 'ASSOCIACOES';
    const isCode05 = String(company.code || '').startsWith('05');
    const isCushmanNamed = /cushman/i.test(company.groupName || '') || /cushman/i.test(company.name || '');

    return isCondoOrAssoc || isCode05 || isCushmanNamed;
  }

  // Se for empresa de parcelamento externo, não pertence aos fechamentos operacionais padrão
  if (raw.toUpperCase() === 'PARCELAMENTO' || raw.includes('PARCELAMENTO')) {
    return sector === 'PARCELAMENTO';
  }

  // Se for empresa marcada exclusivamente para CUSHMAN
  if (raw.toUpperCase() === 'CUSHMAN') {
    return false;
  }

  // Se não tem activeSectors ou é TODOS: pertence aos 3 setores operacionais padrão
  if (!raw || raw.toUpperCase() === 'TODOS') {
    return sector === 'FISCAL' || sector === 'DP' || sector === 'CONTABIL';
  }

  // Lista com múltiplos setores (ex: 'FISCAL,DP', 'CONTABIL', etc.)
  const parts = raw.split(',').map(s => s.trim().toUpperCase());
  if (parts.includes('TODOS')) {
    return sector === 'FISCAL' || sector === 'DP' || sector === 'CONTABIL';
  }

  return parts.includes(sector);
}

/**
 * Filtro Prisma para consultas agregadas (Dashboard / Analytics) respeitando fielmente companyScope
 */
export function buildUserCompanyPrismaFilter(user: any): Record<string, any> {
  if (!user || isPrivilegedUser(user)) return {};
  const scope = user.companyScope || (user.canViewAllCompanies === false ? 'CUSTOM' : 'ALL');
  if (scope === 'ALL') return {};
  if (scope === 'CUSTOM') {
    const ids = (user.companyAccess || []).map((a: any) => a.companyId).filter(Boolean);
    return { id: { in: ids } };
  }
  return { responsibles: { some: { userId: user.id } } };
}

