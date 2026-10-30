import {externalCompaniesExcluded} from '../src/config/installmentCompanies';
import {companyExitAllowsPeriod} from '../src/config/companyExit';
import {latestOpenPeriod} from '../src/config/competenceCalendar';

// Painel analítico: séries mensais e distribuições calculadas a partir do cadastro e dos fechamentos.
const SECTORS = ['FISCAL', 'DP', 'CONTABIL', 'CUSHMAN'];
const CLOSING_SECTORS = ['FISCAL', 'DP', 'CUSHMAN', 'PARCELAMENTO'];

const monthStartUTC = (y: number, m: number) => new Date(Date.UTC(y, m, 1));
const label = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

function parseMonthYear(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2})\s*[/-]\s*(\d{4})$/);
  if (!match) {
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : monthStartUTC(parsed.getUTCFullYear(), parsed.getUTCMonth());
  }
  const month = Number(match[1]) - 1;
  if (month < 0 || month > 11) return null;
  return monthStartUTC(Number(match[2]), month);
}

function companySectors(company: any): string[] {
  const raw = (company.activeSectors || '').trim();
  if (!raw || raw === 'TODOS') return SECTORS;
  return raw.split(',').map((s: string) => s.trim()).filter((s: string) => SECTORS.includes(s));
}

function topEntries(map: Map<string, number>, limit: number) {
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit).map(([name, value]) => ({name, value}));
  const rest = sorted.slice(limit).reduce((sum, [, v]) => sum + v, 0);
  if (rest > 0) top.push({name: 'Outros', value: rest});
  return top;
}

const bump = (map: Map<string, number>, key: string | null | undefined, fallback = 'Não informado') => {
  const k = (key || '').trim() || fallback;
  map.set(k, (map.get(k) || 0) + 1);
};

const analyticsCache = new Map<string, { ts: number; payload: any }>();
export function invalidateAnalyticsCache() {
  analyticsCache.clear();
}

export function registerAnalytics(app: any, prisma: any) {
  app.get('/api/analytics', async (req: any, res: any) => {
    try {
      const monthsBack = Math.min(Math.max(Number(req.query.months) || 12, 3), 36);
      const rawUserId = req.query.userId;
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
      const cacheKey = `${monthsBack}:${userId || 'all'}`;
      const cached = analyticsCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 60_000) {
        return res.json(cached.payload);
      }

      const last = latestOpenPeriod();
      const lastY = last.getUTCFullYear();
      const lastM = last.getUTCMonth();
      const periods = Array.from({length: monthsBack}, (_, i) => monthStartUTC(lastY, lastM - (monthsBack - 1 - i)));
      const rangeStart = periods[0];
      const rangeEnd = monthStartUTC(lastY, lastM + 1);

      let userFilter: any = {};
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, include: { companyAccess: true } });
        if (user && user.role !== 'ADMIN' && user.role !== 'SOCIO') {
          if (['FISCAL', 'DP', 'CONTABIL'].includes(user.role)) {
            userFilter = { responsibles: { some: { userId } } };
          } else if (user.companyScope === 'CUSTOM') {
            userFilter = { id: { in: user.companyAccess.map((a: any) => a.companyId) } };
          } else if (user.companyScope === 'ALL') {
            userFilter = {};
          } else {
            userFilter = { responsibles: { some: { userId } } };
          }
        }
      }

      const whereClause: any = { AND: [externalCompaniesExcluded] };
      if (Object.keys(userFilter).length > 0) {
        whereClause.AND.push(userFilter);
      }

      const [companies, closings, plans, activeUsersCount, formerUsersCount] = await Promise.all([
        prisma.company.findMany({
          where: whereClause,
          select: {
            id: true, code: true, name: true, taxRegime: true, city: true, groupName: true, companyType: true,
            deliveryMethod: true, activeSectors: true, obligationStartDate: true, exitDate: true, exitMonthHasObligations: true,
            hasClientCertificate: true, certificateType: true, certificateExpiration: true, targetProxyDate: true,
            responsibles: {select: {sector: true, user: {select: {id: true, name: true, email: true, active: true, leftAt: true}}}},
          },
        }),
        prisma.closing.findMany({
          where: {type: {in: CLOSING_SECTORS}, referencePeriod: {gte: rangeStart, lt: rangeEnd}},
          select: {companyId: true, type: true, status: true, referencePeriod: true, dashboardMetrics: true},
        }),
        prisma.installmentPlan.findMany({select: {status: true, totalAmount: true, typeName: true}}).catch(() => []),
        prisma.user.count({ where: { active: true } }),
        prisma.user.count({ where: { leftAt: { not: null } } }),
      ]);

      // Fechamentos agrupados por mês
      const closingsByMonth = new Map<string, any[]>();
      for (const c of closings) {
        const d = new Date(c.referencePeriod);
        const key = label(monthStartUTC(d.getUTCFullYear(), d.getUTCMonth()));
        if (!closingsByMonth.has(key)) closingsByMonth.set(key, []);
        closingsByMonth.get(key)!.push(c);
      }
      const companyById = new Map(companies.map((c: any) => [c.id, c]));

      // Série histórica
      const timeline = periods.map((start) => {
        const next = monthStartUTC(start.getUTCFullYear(), start.getUTCMonth() + 1);
        const key = label(start);
        const monthClosings = closingsByMonth.get(key) || [];
        const withClosing = new Set(monthClosings.map((c: any) => c.companyId));
        const activeIds = new Set<string>();
        const regimes: Record<string, number> = {};
        let entries = 0, exits = 0;
        for (const c of companies) {
          const startDate = c.obligationStartDate ? new Date(c.obligationStartDate) : null;
          const exitDate = c.exitDate ? new Date(c.exitDate) : null;
          if (startDate && startDate >= start && startDate < next) entries++;
          if (exitDate && exitDate >= start && exitDate < next) exits++;
          const started = (startDate && startDate < next) || withClosing.has(c.id);
          if (started && companyExitAllowsPeriod(c, start)) {
            activeIds.add(c.id);
            regimes[c.taxRegime] = (regimes[c.taxRegime] || 0) + 1;
          }
        }
        const sectors: Record<string, {completed: number; inProgress: number; pending: number; total: number; percent: number}> = {};
        for (const type of CLOSING_SECTORS) {
          const list = monthClosings.filter((c: any) => c.type === type && c.status !== 'NOT_APPLICABLE' && companyById.has(c.companyId));
          const completed = list.filter((c: any) => c.status === 'COMPLETED').length;
          const inProgress = list.filter((c: any) => c.status === 'IN_PROGRESS').length;
          sectors[type] = {completed, inProgress, pending: list.length - completed - inProgress, total: list.length, percent: list.length ? Math.round((completed / list.length) * 100) : 0};
        }
        const employees = monthClosings
          .filter((c: any) => c.type === 'DP')
          .reduce((sum: number, c: any) => sum + (Number(c.dashboardMetrics?.employees) || 0), 0);
        return {period: key, iso: start.toISOString(), active: activeIds.size, entries, exits, net: entries - exits, employees, regimes, sectors};
      });

      // Carteira atual (última competência aberta)
      const current = companies.filter((c: any) => {
        const startDate = c.obligationStartDate ? new Date(c.obligationStartDate) : null;
        return startDate && startDate < rangeEnd && companyExitAllowsPeriod(c, last);
      });

      const regimeMap = new Map<string, number>();
      const typeMap = new Map<string, number>();
      const cityMap = new Map<string, number>();
      const groupMap = new Map<string, number>();
      const deliveryMap = new Map<string, number>();
      const sectorCount: Record<string, number> = {FISCAL: 0, DP: 0, CONTABIL: 0, CUSHMAN: 0};
      const workload = new Map<string, {name: string; total: number; FISCAL: number; DP: number; CONTABIL: number; CUSHMAN: number; GERAL: number}>();
      let withoutResponsible = 0;

      const now = new Date();
      const thisMonth = monthStartUTC(now.getUTCFullYear(), now.getUTCMonth());
      const cert = {with: 0, without: 0, expired: 0, thisMonth: 0, next90: 0, valid: 0, invalidDate: 0};
      const certTypes = new Map<string, number>();
      const certExpirations = new Map<string, number>();
      const proxy = {with: 0, without: 0, expired: 0, next30: 0, valid: 0};

      for (const c of current) {
        bump(regimeMap, c.taxRegime);
        bump(typeMap, c.companyType);
        bump(cityMap, c.city);
        if (c.groupName?.trim()) bump(groupMap, c.groupName);
        bump(deliveryMap, c.deliveryMethod);
        for (const s of companySectors(c)) sectorCount[s]++;

        if (!c.responsibles?.length) withoutResponsible++;
        for (const r of c.responsibles || []) {
          if (!r.user) continue;
          const id = r.user.id;
          const isFormer = !r.user.active || Boolean(r.user.leftAt);
          const name = isFormer ? `${r.user.name || r.user.email} (Desligado)` : (r.user.name || r.user.email);
          if (!workload.has(id)) workload.set(id, {name, total: 0, FISCAL: 0, DP: 0, CONTABIL: 0, CUSHMAN: 0, GERAL: 0, isFormer} as any);
          const w = workload.get(id)!;
          const sector = r.sector && r.sector in w ? r.sector : 'GERAL';
          (w as any)[sector]++;
          w.total++;
        }

        if (c.hasClientCertificate) {
          cert.with++;
          bump(certTypes, c.certificateType);
          const exp = parseMonthYear(c.certificateExpiration);
          if (!exp) cert.invalidDate++;
          else {
            const diff = (exp.getUTCFullYear() - thisMonth.getUTCFullYear()) * 12 + (exp.getUTCMonth() - thisMonth.getUTCMonth());
            if (diff < 0) cert.expired++;
            else if (diff === 0) cert.thisMonth++;
            else if (diff <= 3) cert.next90++;
            else cert.valid++;
            if (diff >= 0 && diff < 12) {
              const k = label(exp);
              certExpirations.set(k, (certExpirations.get(k) || 0) + 1);
            }
          }
        } else cert.without++;

        if (c.targetProxyDate) {
          proxy.with++;
          const days = (new Date(c.targetProxyDate).getTime() - now.getTime()) / 86_400_000;
          if (days < 0) proxy.expired++;
          else if (days <= 30) proxy.next30++;
          else proxy.valid++;
        } else proxy.without++;
      }

      const expirationSeries = Array.from({length: 12}, (_, i) => {
        const k = label(monthStartUTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() + i));
        return {period: k, value: certExpirations.get(k) || 0};
      });

      const planStatus = new Map<string, {count: number; amount: number}>();
      for (const p of plans) {
        const k = p.status || 'ATIVO';
        if (!planStatus.has(k)) planStatus.set(k, {count: 0, amount: 0});
        const s = planStatus.get(k)!;
        s.count++;
        s.amount += Number(p.totalAmount) || 0;
      }

      const first = timeline[0];
      const lastPoint = timeline[timeline.length - 1];
      const prevPoint = timeline[timeline.length - 2] || lastPoint;
      const yearAgo = timeline.length >= 13 ? timeline[timeline.length - 13] : first;

      const payload = {
        generatedAt: now.toISOString(),
        referencePeriod: label(last),
        months: monthsBack,
        kpis: {
          active: lastPoint.active,
          activePrev: prevPoint.active,
          activeFirst: first.active,
          activeYearAgo: yearAgo.active,
          entriesPeriod: timeline.reduce((s, t) => s + t.entries, 0),
          exitsPeriod: timeline.reduce((s, t) => s + t.exits, 0),
          employees: lastPoint.employees,
          employeesPrev: prevPoint.employees,
          withoutResponsible,
          totalRegistered: companies.length,
          inactiveTotal: companies.filter((c: any) => c.exitDate && new Date(c.exitDate) <= now).length,
          activeTeamMembers: activeUsersCount,
          formerTeamMembers: formerUsersCount,
        },
        timeline,
        distribution: {
          regimes: [...regimeMap.entries()].map(([name, value]) => ({name, value})).sort((a, b) => b.value - a.value),
          companyTypes: topEntries(typeMap, 8),
          cities: topEntries(cityMap, 10),
          groups: topEntries(groupMap, 10),
          delivery: topEntries(deliveryMap, 8),
          sectors: Object.entries(sectorCount).map(([name, value]) => ({name, value})),
        },
        workload: [...workload.values()].sort((a, b) => b.total - a.total),
        certificates: {...cert, types: topEntries(certTypes, 6), expirations: expirationSeries},
        proxies: proxy,
        installments: [...planStatus.entries()].map(([status, v]) => ({status, ...v})),
      };

      analyticsCache.set(cacheKey, { ts: Date.now(), payload });
      res.json(payload);
    } catch (error) {
      console.error('Erro ao gerar analytics:', error);
      res.status(500).json({error: 'Erro ao gerar os gráficos'});
    }
  });
}
