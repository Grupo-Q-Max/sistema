import { externalCompaniesExcluded } from '../src/config/installmentCompanies';
import { latestOpenPeriod, normalizePeriod } from '../src/config/competenceCalendar';
import { resolveColumnKey } from '../src/config/payrollColumns';

export function registerPowerPack(app: any, prisma: any, pool?: any) {
  // ==========================================
  // 1. RADAR PREDITIVO DE GARGALOS E SLA
  // ==========================================
  app.get('/api/analytics/bottleneck-forecast', async (req: any, res: any) => {
    try {
      const openPeriod = latestOpenPeriod();
      const sector = req.query.sector ? String(req.query.sector).toUpperCase() : 'FISCAL';
      
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      
      // Prazo legal de referência (Dia 20 do mês corrente)
      const targetDeadline = new Date(curYear, curMonth, 20, 23, 59, 59);
      
      // Calcular dias úteis restantes até o dia 20
      let workdaysRemaining = 0;
      let checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      while (checkDate <= targetDeadline) {
        const dayOfWeek = checkDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          workdaysRemaining++;
        }
        checkDate.setDate(checkDate.getDate() + 1);
      }
      workdaysRemaining = Math.max(1, workdaysRemaining);

      // Calcular dias úteis já transcorridos no mês
      let workdaysElapsed = 0;
      let startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      while (startOfMonth < now) {
        const dayOfWeek = startOfMonth.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          workdaysElapsed++;
        }
        startOfMonth.setDate(startOfMonth.getDate() + 1);
      }
      workdaysElapsed = Math.max(1, workdaysElapsed);

      // Buscar fechamentos da competência aberta para o setor
      const [closings, responsibles, users] = await Promise.all([
        prisma.closing.findMany({
          where: {
            type: sector,
            referencePeriod: openPeriod,
          },
          select: {
            id: true,
            companyId: true,
            status: true,
            columnsData: true,
            updatedAt: true,
          },
        }),
        prisma.companyResponsible.findMany({
          where: {
            OR: [{ sector }, { sector: 'TODOS' }, { sector: null }],
          },
          include: {
            user: {
              select: { id: true, name: true, email: true, active: true },
            },
          },
        }),
        prisma.user.findMany({
          where: { active: true },
          select: { id: true, name: true, email: true },
        }),
      ]);

      // Mapeamento de empresa -> responsável
      const companyUserMap = new Map<string, { id: string; name: string }>();
      for (const r of responsibles) {
        if (r.user && r.user.active) {
          companyUserMap.set(r.companyId, {
            id: r.user.id,
            name: r.user.name || r.user.email.split('@')[0],
          });
        }
      }

      // Agrupar por operador
      const operatorStats = new Map<string, {
        userId: string;
        userName: string;
        assignedCount: number;
        completedCount: number;
        inProgressCount: number;
        pendingCount: number;
      }>();

      for (const u of users) {
        operatorStats.set(u.id, {
          userId: u.id,
          userName: u.name || u.email.split('@')[0],
          assignedCount: 0,
          completedCount: 0,
          inProgressCount: 0,
          pendingCount: 0,
        });
      }

      // Contador para sem responsável atribuído
      const unassignedStats = {
        userId: 'unassigned',
        userName: 'Sem Responsável Atribuído',
        assignedCount: 0,
        completedCount: 0,
        inProgressCount: 0,
        pendingCount: 0,
      };

      for (const cl of closings) {
        const resp = companyUserMap.get(cl.companyId);
        const stats = resp ? operatorStats.get(resp.id) : unassignedStats;
        if (!stats) continue;

        stats.assignedCount++;
        if (cl.status === 'COMPLETED') {
          stats.completedCount++;
        } else if (cl.status === 'IN_PROGRESS') {
          stats.inProgressCount++;
        } else {
          stats.pendingCount++;
        }
      }

      const operatorsForecast: any[] = [];
      for (const stats of operatorStats.values()) {
        if (stats.assignedCount === 0) continue;

        const pendingTotal = stats.pendingCount + stats.inProgressCount;
        // Velocidade observada: concluídos até agora / dias úteis transcorridos
        const dailyRate = Math.max(0.5, Number((stats.completedCount / workdaysElapsed).toFixed(1)));
        // Capacidade prevista para os dias úteis restantes
        const projectedCapacity = Math.round(dailyRate * workdaysRemaining);
        // Déficit projetado (quantas empresas ficarão sem entrega no dia 20 se mantiver o ritmo)
        const projectedDeficit = Math.max(0, pendingTotal - projectedCapacity);
        const projectedCompletionRate = stats.assignedCount > 0
          ? Math.min(100, Math.round(((stats.completedCount + projectedCapacity) / stats.assignedCount) * 100))
          : 100;

        let riskLevel: 'CRITICAL' | 'WARNING' | 'SAFE' = 'SAFE';
        if (projectedDeficit >= 10 || (pendingTotal > 0 && dailyRate <= 0.5 && workdaysRemaining <= 5)) {
          riskLevel = 'CRITICAL';
        } else if (projectedDeficit > 0 || (pendingTotal > 15 && workdaysRemaining <= 4)) {
          riskLevel = 'WARNING';
        }

        operatorsForecast.push({
          ...stats,
          dailyRate,
          workdaysRemaining,
          projectedCapacity,
          projectedDeficit,
          projectedCompletionRate,
          riskLevel,
        });
      }

      // Ordenar por maior risco e maior déficit
      operatorsForecast.sort((a, b) => {
        const riskOrder = { CRITICAL: 3, WARNING: 2, SAFE: 1 };
        return (riskOrder[b.riskLevel as keyof typeof riskOrder] - riskOrder[a.riskLevel as keyof typeof riskOrder]) || (b.projectedDeficit - a.projectedDeficit);
      });

      // Gerar recomendações inteligentes de rebalanceamento
      const criticalOps = operatorsForecast.filter(o => o.riskLevel === 'CRITICAL');
      const surplusOps = operatorsForecast.filter(o => o.riskLevel === 'SAFE' && (o.projectedCapacity - (o.pendingCount + o.inProgressCount)) >= 5);
      
      const suggestions: string[] = [];
      if (criticalOps.length > 0 && surplusOps.length > 0) {
        for (let i = 0; i < Math.min(criticalOps.length, surplusOps.length); i++) {
          const c = criticalOps[i];
          const s = surplusOps[i];
          const toTransfer = Math.min(c.projectedDeficit, 10);
          suggestions.push(`Transfira aproximadamente ${toTransfer} empresas de ${c.userName} para ${s.userName} para nivelar o cumprimento do dia 20.`);
        }
      } else if (criticalOps.length > 0) {
        suggestions.push(`Atenção da Gestão: ${criticalOps.map(c => c.userName).join(', ')} estão com sobrecarga crítica para o dia 20.`);
      } else {
        suggestions.push('Operação equilibrada: todos os operadores estão no ritmo ideal para atingir 100% de entrega no prazo.');
      }

      res.json({
        sector,
        competence: openPeriod,
        workdaysRemaining,
        workdaysElapsed,
        targetDate: targetDeadline.toLocaleDateString('pt-BR'),
        operators: operatorsForecast,
        unassigned: unassignedStats.assignedCount > 0 ? unassignedStats : null,
        suggestions,
      });
    } catch (error: any) {
      console.error('Erro no radar preditivo de gargalos:', error);
      res.status(500).json({ error: error.message || 'Erro ao calcular previsão de gargalos' });
    }
  });

  // ==========================================
  // 2. PAINEL DE PRESENÇA & HISTÓRICO POR PESSOA
  // ==========================================
  app.get('/api/users/activity-history', async (req: any, res: any) => {
    try {
      const users = await prisma.user.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          companyScope: true,
          createdAt: true,
        },
        orderBy: [{ name: 'asc' }, { email: 'asc' }],
      });

      const now = Date.now();
      const fifteenMinAgo = new Date(now - 15 * 60 * 1000);
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Buscar logs recentes dos últimos 30 dias para métricas de produtividade
      const logs = await prisma.systemLog.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          userId: { not: null },
        },
        select: {
          id: true,
          userId: true,
          action: true,
          createdAt: true,
          ipAddress: true,
          details: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Mapeamento por usuário
      const userLogsMap = new Map<string, any[]>();
      for (const log of logs) {
        if (!log.userId) continue;
        const list = userLogsMap.get(log.userId) || [];
        list.push(log);
        userLogsMap.set(log.userId, list);
      }

      // Buscar total histórico vitalício de ações concluídas por usuário
      const lifetimeCounts = await prisma.systemLog.groupBy({
        by: ['userId'],
        where: {
          userId: { not: null },
          action: { in: ['ATUALIZOU_OBRIGACAO', 'BULK_ACTION_OBRIGACAO', 'CONCLUIU_OBRIGACAO'] },
        },
        _count: { id: true },
      });
      const lifetimeMap = new Map<string, number>(lifetimeCounts.map((c: any) => [c.userId, c._count.id]));

      const profiles = users.map((u: any) => {
        const uLogs = userLogsMap.get(u.id) || [];
        const lastLog = uLogs[0] || null;
        const lastActionAt = lastLog ? new Date(lastLog.createdAt) : null;
        const isOnline = lastActionAt ? (now - lastActionAt.getTime()) < 15 * 60 * 1000 : false;

        // Ações de hoje
        const todayActions = uLogs.filter((l: any) => new Date(l.createdAt) >= todayStart);
        // Ações dos últimos 30 dias
        const closuresMonth = uLogs.filter((l: any) => ['ATUALIZOU_OBRIGACAO', 'BULK_ACTION_OBRIGACAO'].includes(l.action)).length;

        // Estimativa de tempo ativo: agrupa logs em janelas de 30 minutos
        const activeHoursEstimate = Number((new Set(
          todayActions.map((l: any) => {
            const d = new Date(l.createdAt);
            return `${d.getHours()}:${d.getMinutes() < 30 ? '00' : '30'}`;
          })
        ).size * 0.5).toFixed(1));

        return {
          id: u.id,
          name: u.name || u.email.split('@')[0],
          email: u.email,
          role: u.role,
          isOnline,
          lastActionAt: lastActionAt ? lastActionAt.toISOString() : null,
          lastIp: lastLog?.ipAddress || null,
          todayActionsCount: todayActions.length,
          activeHoursToday: activeHoursEstimate,
          closuresMonth,
          lifetimeClosures: lifetimeMap.get(u.id) || closuresMonth,
          recentActions: uLogs.slice(0, 10).map((l: any) => ({
            id: l.id,
            action: l.action,
            createdAt: l.createdAt,
            details: l.details,
          })),
        };
      });

      // Ordenar: Online primeiro, depois mais ativos
      profiles.sort((a: any, b: any) => {
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        return b.todayActionsCount - a.todayActionsCount;
      });

      const onlineCount = profiles.filter((p: any) => p.isOnline).length;
      const totalActionsToday = profiles.reduce((sum: number, p: any) => sum + p.todayActionsCount, 0);

      res.json({
        totalUsers: profiles.length,
        onlineCount,
        totalActionsToday,
        users: profiles,
      });
    } catch (error: any) {
      console.error('Erro no painel de atividade por pessoa:', error);
      res.status(500).json({ error: error.message || 'Erro ao carregar histórico por pessoa' });
    }
  });

  // ==========================================
  // 3. EXTRATO DE ENTREGAS DO MÊS PARA O CLIENTE
  // ==========================================
  app.get('/api/companies/:id/delivery-certificate', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const period = req.query.period ? normalizePeriod(new Date(req.query.period)) : latestOpenPeriod();

      const [company, closings, logs] = await Promise.all([
        prisma.company.findUnique({
          where: { id },
          include: {
            responsibles: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        }),
        prisma.closing.findMany({
          where: {
            companyId: id,
            referencePeriod: period,
          },
        }),
        prisma.systemLog.findMany({
          where: {
            entityId: id,
            action: { in: ['ATUALIZOU_OBRIGACAO', 'BULK_ACTION_OBRIGACAO'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
      ]);

      if (!company) {
        return res.status(404).json({ error: 'Empresa não encontrada' });
      }

      const obligations: any[] = [];
      const periodLabel = period.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

      for (const cl of closings) {
        const cData = (cl.columnsData as Record<string, any>) || {};
        for (const [key, value] of Object.entries(cData)) {
          if (key === '_legacy' || !value) continue;

          let status = 'PENDENTE';
          let date = null;
          let obs = '';

          if (typeof value === 'object' && value.status) {
            status = value.status;
            date = value.completionDate || value.data?.dataConclusao || null;
            obs = value.pendingReason || value.data?.motivo || '';
          } else if (typeof value === 'string') {
            if (value.toUpperCase() === 'N/A') {
              status = 'N/A';
            } else if (/\d{4}-\d{2}-\d{2}/.test(value) || /\d{2}\/\d{2}\/\d{4}/.test(value)) {
              status = 'CONCLUIDO';
              date = value;
            } else {
              obs = value;
            }
          }

          if (status === 'CONCLUIDO' || status === 'N/A') {
            obligations.push({
              sector: cl.type,
              obligationKey: key,
              status,
              completedAt: date,
              notes: obs,
            });
          }
        }
      }

      res.json({
        company: {
          id: company.id,
          code: company.code,
          name: company.name,
          tradeName: company.tradeName,
          cnpj: company.cnpj,
          taxRegime: company.taxRegime,
          city: company.city,
        },
        competence: period,
        competenceLabel: periodLabel,
        emissionDate: new Date().toISOString(),
        totalDelivered: obligations.filter(o => o.status === 'CONCLUIDO').length,
        totalNotApplicable: obligations.filter(o => o.status === 'N/A').length,
        obligations,
        responsibles: company.responsibles.map((r: any) => ({
          sector: r.sector || 'Geral',
          name: r.user?.name || r.user?.email.split('@')[0] || 'Equipe Contábil',
        })),
      });
    } catch (error: any) {
      console.error('Erro ao gerar comprovante de entrega do cliente:', error);
      res.status(500).json({ error: error.message || 'Erro ao emitir extrato' });
    }
  });

  // ==========================================
  // 4. STATUS FINANCEIRO / INADIMPLÊNCIA DE HONORÁRIOS
  // ==========================================
  app.get('/api/companies/financial-status', async (_req: any, res: any) => {
    try {
      const companies = await prisma.company.findMany({
        where: externalCompaniesExcluded,
        select: { id: true, legacyData: true },
      });
      const statusMap: Record<string, { status: string; reason?: string; updatedAt?: string }> = {};
      for (const c of companies) {
        const leg = (c.legacyData as any) || {};
        if (leg.financialStatus) {
          statusMap[c.id] = leg.financialStatus;
        }
      }
      res.json(statusMap);
    } catch (error: any) {
      console.error('Erro ao buscar status financeiro:', error);
      res.status(500).json({ error: 'Erro ao carregar status financeiro' });
    }
  });

  app.put('/api/companies/:id/financial-status', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { status, reason } = req.body; // 'REGULAR' | 'PENDING_1M' | 'BLOCKED_2M'
      const company = await prisma.company.findUnique({ where: { id } });
      if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

      const currentLegacy = (company.legacyData as any) || {};
      const updatedLegacy = {
        ...currentLegacy,
        financialStatus: {
          status: status || 'REGULAR',
          reason: reason || '',
          updatedAt: new Date().toISOString(),
        },
      };

      await prisma.company.update({
        where: { id },
        data: { legacyData: updatedLegacy },
      });

      res.json({ success: true, financialStatus: updatedLegacy.financialStatus });
    } catch (error: any) {
      console.error('Erro ao atualizar status financeiro:', error);
      res.status(500).json({ error: 'Erro ao atualizar status financeiro' });
    }
  });

  // ==========================================
  // 5. GAMIFICAÇÃO & RANKING DA EQUIPE (LEADERBOARD)
  // ==========================================
  app.get('/api/gamification/leaderboard', async (_req: any, res: any) => {
    try {
      const users = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, email: true, role: true },
      });

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const logs = await prisma.systemLog.findMany({
        where: {
          createdAt: { gte: startOfMonth },
          action: { in: ['ATUALIZOU_OBRIGACAO', 'BULK_ACTION_OBRIGACAO'] },
          userId: { not: null },
        },
        select: { userId: true, createdAt: true, action: true },
      });

      const userStatsMap = new Map<string, {
        totalActions: number;
        fastActions: number; // Ações realizadas antes das 18h ou dias úteis
        activeDays: Set<string>;
      }>();

      for (const log of logs) {
        if (!log.userId) continue;
        const current = userStatsMap.get(log.userId) || { totalActions: 0, fastActions: 0, activeDays: new Set() };
        current.totalActions++;
        const d = new Date(log.createdAt);
        current.activeDays.add(`${d.getDate()}-${d.getMonth()}`);
        if (d.getDate() <= 20) current.fastActions++;
        userStatsMap.set(log.userId, current);
      }

      const leaderboard = users.map((u: any) => {
        const stats = userStatsMap.get(u.id) || { totalActions: 0, fastActions: 0, activeDays: new Set() };
        // Sistema de Pontuação: 10 pts por baixa + 5 pts bônus por entrega rápida até o dia 20 + 20 pts por dia ativo
        const points = (stats.totalActions * 10) + (stats.fastActions * 5) + (stats.activeDays.size * 20);

        const badges: Array<{ label: string; icon: string; color: string }> = [];
        if (stats.totalActions >= 50) badges.push({ label: 'Top Produtor', icon: '⚡', color: '#f59e0b' });
        if (stats.fastActions >= 30) badges.push({ label: 'Guardião do Prazo', icon: '🎯', color: '#10b981' });
        if (stats.activeDays.size >= 10) badges.push({ label: 'Consistência', icon: '🔥', color: '#ef4444' });

        return {
          userId: u.id,
          name: u.name || u.email.split('@')[0],
          email: u.email,
          role: u.role,
          totalActions: stats.totalActions,
          fastActions: stats.fastActions,
          activeDaysCount: stats.activeDays.size,
          points,
          badges,
        };
      });

      leaderboard.sort((a, b) => b.points - a.points);

      res.json({
        period: startOfMonth.toISOString().slice(0, 7),
        leaderboard,
        totalTeamPoints: leaderboard.reduce((sum, u) => sum + u.points, 0),
      });
    } catch (error: any) {
      console.error('Erro ao gerar ranking da equipe:', error);
      res.status(500).json({ error: 'Erro ao gerar ranking' });
    }
  });

  // ==========================================
  // 6. MONITOR UNIFICADO DE CNDs
  // ==========================================
  app.get('/api/cnd/status', async (_req: any, res: any) => {
    try {
      const companies = await prisma.company.findMany({
        where: externalCompaniesExcluded,
        select: {
          id: true,
          code: true,
          name: true,
          cnpj: true,
          city: true,
          legacyData: true,
        },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
      });

      const list = companies.map((c: any) => {
        const leg = (c.legacyData as any) || {};
        const cnd = leg.cndStatus || {
          federal: { status: 'REGULAR', validUntil: null },
          fgts: { status: 'REGULAR', validUntil: null },
          trabalhista: { status: 'REGULAR', validUntil: null },
          municipal: { status: 'REGULAR', validUntil: null },
        };
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          cnpj: c.cnpj,
          city: c.city,
          cnd,
        };
      });

      res.json(list);
    } catch (error: any) {
      console.error('Erro ao consultar monitor de CNDs:', error);
      res.status(500).json({ error: 'Erro ao carregar CNDs' });
    }
  });

  app.put('/api/companies/:id/cnd-status', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { cnd } = req.body;
      const company = await prisma.company.findUnique({ where: { id } });
      if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

      const currentLegacy = (company.legacyData as any) || {};
      const updatedLegacy = {
        ...currentLegacy,
        cndStatus: cnd,
      };

      await prisma.company.update({
        where: { id },
        data: { legacyData: updatedLegacy },
      });

      res.json({ success: true, cnd: updatedLegacy.cndStatus });
    } catch (error: any) {
      console.error('Erro ao salvar CND:', error);
      res.status(500).json({ error: 'Erro ao salvar CND' });
    }
  });

  // ==========================================
  // 7. CALENDÁRIO DE OBRIGAÇÕES ESPECIAIS (ANUAIS / TRIMESTRAIS)
  // ==========================================
  app.get('/api/special-obligations', async (req: any, res: any) => {
    try {
      const year = Number(req.query.year) || new Date().getFullYear();
      const companies = await prisma.company.findMany({
        where: externalCompaniesExcluded,
        select: { id: true, code: true, name: true, taxRegime: true, legacyData: true },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
      });

      const list = companies.map((c: any) => {
        const leg = (c.legacyData as any) || {};
        const yearData = leg.specialObligations?.[year] || {};
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          taxRegime: c.taxRegime,
          obligations: yearData,
        };
      });

      res.json({ year, companies: list });
    } catch (error: any) {
      console.error('Erro ao consultar obrigações especiais:', error);
      res.status(500).json({ error: 'Erro ao carregar obrigações especiais' });
    }
  });

  app.put('/api/companies/:id/special-obligations', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { year, key, status, date } = req.body;
      const company = await prisma.company.findUnique({ where: { id } });
      if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

      const currentLegacy = (company.legacyData as any) || {};
      const specials = currentLegacy.specialObligations || {};
      const yearSpecials = specials[year] || {};

      yearSpecials[key] = {
        status: status || 'CONCLUIDO',
        date: date || new Date().toISOString(),
      };
      specials[year] = yearSpecials;

      const updatedLegacy = {
        ...currentLegacy,
        specialObligations: specials,
      };

      await prisma.company.update({
        where: { id },
        data: { legacyData: updatedLegacy },
      });

      res.json({ success: true, obligations: yearSpecials });
    } catch (error: any) {
      console.error('Erro ao atualizar obrigação especial:', error);
      res.status(500).json({ error: 'Erro ao salvar obrigação especial' });
    }
  });
}

