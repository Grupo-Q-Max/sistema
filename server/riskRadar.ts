import { externalCompaniesExcluded } from '../src/config/installmentCompanies';
import { companyExitWhere } from '../src/config/companyExit';
import { latestOpenPeriod } from '../src/config/competenceCalendar';
import { buildUserCompanyPrismaFilter } from '../src/config/companyPermissions';

export interface RiskTrigger {
  type: 'CERTIFICATE' | 'PROXY' | 'DOCUMENTATION' | 'DEADLINE' | 'WORKLOAD';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
}

export interface RiskRadarCompany {
  id: string;
  code: string | null;
  name: string;
  cnpj: string;
  taxRegime: string;
  score: number;
  level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  triggers: RiskTrigger[];
  pendingSectors: string[];
  completedSectors: string[];
  responsibles: Array<{
    sector: string;
    name: string;
    email: string;
    userId: string;
    pendingCount?: number;
    isOverloaded?: boolean;
  }>;
  notesSnippet?: string;
  certificateExpiration?: string | null;
}

const riskRadarCache = new Map<string, { ts: number; payload: any }>();

export function invalidateRiskRadarCache() {
  riskRadarCache.clear();
}

function parseCertExpiration(exp: string | null | undefined): { date: Date | null; raw: string | null } {
  if (!exp) return { date: null, raw: null };
  const s = String(exp).trim();
  if (!s) return { date: null, raw: null };

  const match = s.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    let year = parseInt(match[2], 10);
    if (year < 100) year += 2000;
    return {
      date: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59)),
      raw: s
    };
  }

  const d = new Date(s);
  return {
    date: isNaN(d.getTime()) ? null : d,
    raw: s
  };
}

export function registerRiskRadar(app: any, prisma: any) {
  app.get('/api/dashboard/risk-radar', async (req: any, res: any) => {
    try {
      const year = parseInt(req.query.year, 10);
      const month = parseInt(req.query.month, 10); // 1-12

      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: 'Parâmetros year e month inválidos.' });
      }

      const sectorFilter = req.query.sector ? String(req.query.sector).toUpperCase() : 'ALL';
      const rawUserId = req.query.userId;
      const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

      const cacheKey = `${year}-${month}:${sectorFilter}:${userId || 'all'}`;
      const cached = riskRadarCache.get(cacheKey);
      const nowMs = Date.now();
      if (cached && nowMs - cached.ts < 45_000) {
        return res.json(cached.payload);
      }

      const monthStart = new Date(Date.UTC(year, month - 1, 1));
      const nextMonthStart = new Date(Date.UTC(year, month, 1));

      let userFilter: any = {};
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { companyAccess: true }
        });
        if (user) {
          userFilter = buildUserCompanyPrismaFilter(user);
        }
      }

      const activeWhere: any = {
        AND: [externalCompaniesExcluded, companyExitWhere(monthStart)],
        OR: [
          {
            obligationStartDate: { lt: nextMonthStart },
            OR: [{ exitDate: null }, { exitDate: { gte: monthStart } }],
          },
          {
            closings: {
              some: {
                referencePeriod: { gte: monthStart, lt: nextMonthStart },
              },
            },
          },
        ],
      };

      if (Object.keys(userFilter).length > 0) {
        activeWhere.AND.push(userFilter);
      }

      const [companies, closings] = await Promise.all([
        prisma.company.findMany({
          where: activeWhere,
          select: {
            id: true,
            code: true,
            name: true,
            cnpj: true,
            taxRegime: true,
            activeSectors: true,
            notes: true,
            hasClientCertificate: true,
            certificateType: true,
            certificateExpiration: true,
            targetProxyDate: true,
            fgtsProxyDate: true,
            decProxyDate: true,
            empregadorProxyDate: true,
            responsibles: {
              select: {
                id: true,
                sector: true,
                userId: true,
                user: {
                  select: { id: true, name: true, email: true, role: true }
                }
              }
            }
          },
          orderBy: { name: 'asc' }
        }),
        prisma.closing.findMany({
          where: {
            referencePeriod: { gte: monthStart, lt: nextMonthStart }
          },
          select: {
            id: true,
            companyId: true,
            type: true,
            status: true,
            columnsData: true,
            dashboardMetrics: true
          }
        })
      ]);

      const closingMap = new Map<string, any[]>();
      for (const cl of closings) {
        const list = closingMap.get(cl.companyId) || [];
        list.push(cl);
        closingMap.set(cl.companyId, list);
      }

      // Analisar analistas e carga de trabalho
      const analystWorkloadMap = new Map<string, {
        userId: string;
        userName: string;
        sector: string;
        pendingCount: number;
        completedCount: number;
        totalCount: number;
      }>();

      // Mapear pendências por responsável para alimentar detecção de sobrecarga
      for (const comp of companies) {
        const companyClosings = closingMap.get(comp.id) || [];
        const activeSectorsList = (comp.activeSectors && comp.activeSectors !== 'TODOS')
          ? comp.activeSectors.split(',').map((s: string) => s.trim().toUpperCase())
          : ['FISCAL', 'DP', 'CONTABIL'];

        for (const resp of comp.responsibles) {
          const respSector = resp.sector || 'GERAL';
          const key = `${resp.userId}:${respSector}`;
          if (!analystWorkloadMap.has(key)) {
            analystWorkloadMap.set(key, {
              userId: resp.userId,
              userName: resp.user.name || resp.user.email.split('@')[0],
              sector: respSector,
              pendingCount: 0,
              completedCount: 0,
              totalCount: 0
            });
          }

          const wl = analystWorkloadMap.get(key)!;
          wl.totalCount++;

          const relatedClosing = companyClosings.find((c: any) => c.type === respSector);
          if (relatedClosing && relatedClosing.status === 'COMPLETED') {
            wl.completedCount++;
          } else {
            wl.pendingCount++;
          }
        }
      }

      const today = new Date();
      const currentDay = today.getUTCDate();
      const isPastOrCurrentComp = monthStart.getTime() <= today.getTime();

      let expiredCertsCount = 0;
      let expiringCertsCount = 0;
      let expiredProxiesCount = 0;
      let docFrictionCount = 0;
      let urgentDeadlinesCount = 0;
      let overloadedAnalystsCount = 0;

      const scoredCompanies: RiskRadarCompany[] = [];

      for (const comp of companies) {
        const companyClosings = closingMap.get(comp.id) || [];
        const activeSectorsList = (comp.activeSectors && comp.activeSectors !== 'TODOS')
          ? comp.activeSectors.split(',').map((s: string) => s.trim().toUpperCase())
          : ['FISCAL', 'DP', 'CONTABIL'];

        // Se há filtro por setor e a empresa não participa dele, pula
        if (sectorFilter !== 'ALL' && !activeSectorsList.includes(sectorFilter)) {
          continue;
        }

        const pendingSectors: string[] = [];
        const completedSectors: string[] = [];

        for (const s of activeSectorsList) {
          const cl = companyClosings.find((c: any) => c.type === s);
          if (cl && cl.status === 'COMPLETED') {
            completedSectors.push(s);
          } else {
            pendingSectors.push(s);
          }
        }

        let score = 0;
        const triggers: RiskTrigger[] = [];

        // 1. FATOR: CERTIFICADO DIGITAL
        if (comp.hasClientCertificate && comp.certificateExpiration) {
          const { date: certExpDate, raw: rawExp } = parseCertExpiration(comp.certificateExpiration);
          if (certExpDate) {
            const diffDays = Math.ceil((certExpDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 0) {
              score += 35;
              expiredCertsCount++;
              triggers.push({
                type: 'CERTIFICATE',
                severity: 'CRITICAL',
                title: 'Certificado Digital Expirado',
                description: `Certificado expirou em ${rawExp} (${Math.abs(diffDays)} dias atrás). Bloqueia envio de guias e declarações.`
              });
            } else if (diffDays <= 15) {
              score += 20;
              expiringCertsCount++;
              triggers.push({
                type: 'CERTIFICATE',
                severity: 'WARNING',
                title: 'Certificado Vencendo em Breve',
                description: `Certificado vence em ${diffDays} dias (${rawExp}). Requer renovação urgente.`
              });
            }
          }
        }

        // 2. FATOR: PROCURAÇÕES
        const proxies = [
          { name: 'Receita / Target', date: comp.targetProxyDate },
          { name: 'FGTS', date: comp.fgtsProxyDate },
          { name: 'DEC', date: comp.decProxyDate },
          { name: 'Empregador Web', date: comp.empregadorProxyDate },
        ];

        for (const p of proxies) {
          if (p.date) {
            const pDate = new Date(p.date);
            if (!isNaN(pDate.getTime())) {
              const diffDays = Math.ceil((pDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays <= 0) {
                score += 20;
                expiredProxiesCount++;
                triggers.push({
                  type: 'PROXY',
                  severity: 'WARNING',
                  title: `Procuração ${p.name} Expirada`,
                  description: `Procuração venceu há ${Math.abs(diffDays)} dias. Pode bloquear acessos aos portais de entrega.`
                });
                break; // Não soma mais de 1 vez para não inflar desproporcionalmente
              }
            }
          }
        }

        // 3. FATOR: DOCUMENTAÇÃO & HISTÓRICO DE COBRANÇA
        let notesSnippet: string | undefined;
        if (comp.notes) {
          const notesText = String(comp.notes).trim();
          const lowerNotes = notesText.toLowerCase();
          const frictionKeywords = [
            'cobrança', 'cobranca', 'pendencia', 'pendência', 'aguardando',
            'doc. rede', 'doc rede', 'extrato', 'não enviou', 'nao enviou',
            'não mandou', 'nao mandou', 'atraso', 'documento pendente'
          ];
          const hasFriction = frictionKeywords.some(kw => lowerNotes.includes(kw));
          if (hasFriction) {
            score += 25;
            docFrictionCount++;
            notesSnippet = notesText.length > 95 ? `${notesText.slice(0, 95)}...` : notesText;
            triggers.push({
              type: 'DOCUMENTATION',
              severity: 'WARNING',
              title: 'Gargalo Documental Ativo',
              description: `Anotação de pendência ou cobrança em aberto: "${notesSnippet}".`
            });
          }
        }

        // 4. FATOR: PRAZOS LEGAIS & STATUS DOS SETORES
        if (pendingSectors.length > 0 && isPastOrCurrentComp) {
          // Se for Simples Nacional e Fiscal estiver pendente
          if (comp.taxRegime === 'SIMPLES_NACIONAL' && pendingSectors.includes('FISCAL')) {
            if (currentDay >= 15 && currentDay <= 20) {
              score += 30;
              urgentDeadlinesCount++;
              triggers.push({
                type: 'DEADLINE',
                severity: 'CRITICAL',
                title: 'PGDAS / DAS Simples Nacional Iminente',
                description: 'Faltam poucos dias para o vencimento legal (dia 20) e a apuração fiscal está pendente.'
              });
            } else if (currentDay > 20) {
              score += 45;
              urgentDeadlinesCount++;
              triggers.push({
                type: 'DEADLINE',
                severity: 'CRITICAL',
                title: 'PGDAS / DAS em Atraso Legal',
                description: 'Data limite do dia 20 ultrapassada com o setor Fiscal ainda não concluído.'
              });
            }
          }

          // DP / FGTS / Folha
          if (pendingSectors.includes('DP')) {
            if (currentDay >= 4 && currentDay <= 7) {
              score += 25;
              urgentDeadlinesCount++;
              triggers.push({
                type: 'DEADLINE',
                severity: 'WARNING',
                title: 'Fechamento de Folha / FGTS Iminente',
                description: 'Marco do dia 07 próximo e as rotinas de Departamento Pessoal continuam pendentes.'
              });
            }
          }

          // Inércia acumulada (mês passado ainda aberto)
          const isPreviousMonth = monthStart.getTime() < new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).getTime();
          if (isPreviousMonth) {
            score += 35;
            triggers.push({
              type: 'DEADLINE',
              severity: 'CRITICAL',
              title: 'Competência Passada em Atraso',
              description: `Competência anterior ainda possui ${pendingSectors.join(', ')} não concluído(s).`
            });
          }
        }

        // 5. FATOR: SOBRECARGA DO ANALISTA
        const formattedResponsibles = comp.responsibles.map((r: any) => {
          const wl = analystWorkloadMap.get(`${r.userId}:${r.sector || 'GERAL'}`);
          const isOverloaded = !!(wl && wl.pendingCount >= 30);
          return {
            sector: r.sector || 'Geral',
            name: r.user.name || r.user.email.split('@')[0],
            email: r.user.email,
            userId: r.userId,
            pendingCount: wl?.pendingCount,
            isOverloaded
          };
        });

        const overloadedResp = formattedResponsibles.find(r => r.isOverloaded && pendingSectors.includes(r.sector.toUpperCase()));
        if (overloadedResp) {
          score += 15;
          overloadedAnalystsCount++;
          triggers.push({
            type: 'WORKLOAD',
            severity: 'INFO',
            title: 'Analista Responsável com Fila Alta',
            description: `${overloadedResp.name} (${overloadedResp.sector}) possui ${overloadedResp.pendingCount} empresas pendentes neste mês.`
          });
        }

        // Se todos os setores ativos já estão concluídos, o fechamento desta competência está seguro!
        if (pendingSectors.length === 0) {
          score = Math.min(score, 15); // Risco cai para residual (apenas para apontar certificado se houver)
        }

        // Normalização do Score (0 - 100)
        const finalScore = Math.min(100, Math.max(0, score));
        let level: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' = 'LOW';

        if (finalScore >= 70) level = 'CRITICAL';
        else if (finalScore >= 45) level = 'HIGH';
        else if (finalScore >= 25) level = 'MODERATE';

        scoredCompanies.push({
          id: comp.id,
          code: comp.code,
          name: comp.name,
          cnpj: comp.cnpj,
          taxRegime: comp.taxRegime,
          score: finalScore,
          level,
          triggers,
          pendingSectors,
          completedSectors,
          responsibles: formattedResponsibles,
          notesSnippet,
          certificateExpiration: comp.certificateExpiration
        });
      }

      // Ordenar: mais críticas primeiro
      scoredCompanies.sort((a, b) => b.score - a.score);

      const criticalCount = scoredCompanies.filter(c => c.level === 'CRITICAL').length;
      const highCount = scoredCompanies.filter(c => c.level === 'HIGH').length;
      const moderateCount = scoredCompanies.filter(c => c.level === 'MODERATE').length;
      const lowCount = scoredCompanies.filter(c => c.level === 'LOW').length;
      const totalCount = scoredCompanies.length;

      const healthIndex = totalCount > 0
        ? Math.round(((lowCount + moderateCount * 0.5) / totalCount) * 100)
        : 100;

      // Ranking de analistas por carga
      const analystWorkload = Array.from(analystWorkloadMap.values())
        .map(wl => ({
          ...wl,
          isOverloaded: wl.pendingCount >= 30
        }))
        .sort((a, b) => b.pendingCount - a.pendingCount);

      const payload = {
        referencePeriod: monthStart.toISOString(),
        monthCode: `${String(month).padStart(2, '0')}/${year}`,
        totalCompanies: totalCount,
        healthIndex,
        distribution: {
          critical: criticalCount,
          high: highCount,
          moderate: moderateCount,
          low: lowCount
        },
        bottlenecks: {
          expiredCertificates: expiredCertsCount,
          expiringCertificates: expiringCertsCount,
          expiredProxies: expiredProxiesCount,
          documentFrictionNotes: docFrictionCount,
          urgentDeadlines: urgentDeadlinesCount,
          overloadedAnalysts: analystWorkload.filter(a => a.isOverloaded).length
        },
        analystWorkload: analystWorkload.slice(0, 10),
        companies: scoredCompanies
      };

      riskRadarCache.set(cacheKey, { ts: nowMs, payload });
      res.json(payload);
    } catch (error) {
      console.error('Erro ao calcular Termômetro de Risco:', error);
      res.status(500).json({ error: 'Erro ao processar análise preditiva de risco.' });
    }
  });
}
