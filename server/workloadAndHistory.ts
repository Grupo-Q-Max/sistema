import { externalCompaniesExcluded } from '../src/config/installmentCompanies';
import { companyExitWhere } from '../src/config/companyExit';
import { logAction, getClientIp } from './index';

export function registerWorkloadAndHistory(app: any, prisma: any) {
  // ==========================================
  // 1. BUSCA GLOBAL / SPOTLIGHT
  // ==========================================
  app.get('/api/spotlight', async (req: any, res: any) => {
    try {
      const q = String(req.query.q || '').trim();
      const where: any = {
        AND: [externalCompaniesExcluded],
      };

      if (q) {
        const clean = q.replace(/[.\-/]/g, '');
        where.AND.push({
          OR: [
            { name: { contains: q } },
            { tradeName: { contains: q } },
            { code: { contains: q } },
            { cnpj: { contains: clean || q } },
            { city: { contains: q } },
          ],
        });
      }

      const companies = await prisma.company.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          tradeName: true,
          cnpj: true,
          taxRegime: true,
          city: true,
          activeSectors: true,
          exitDate: true,
          hasClientCertificate: true,
          certificateExpiration: true,
          responsibles: {
            select: {
              sector: true,
              user: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
        },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        take: 25,
      });

      res.json({
        results: companies.map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          tradeName: c.tradeName,
          cnpj: c.cnpj,
          taxRegime: c.taxRegime,
          city: c.city,
          activeSectors: c.activeSectors,
          isActive: !c.exitDate || new Date(c.exitDate) >= new Date(),
          hasCertificate: c.hasClientCertificate,
          certificateExpiration: c.certificateExpiration,
          responsibles: c.responsibles.map((r: any) => ({
            sector: r.sector || 'Geral',
            name: r.user.name || r.user.email.split('@')[0],
            role: r.user.role,
          })),
        })),
      });
    } catch (error) {
      console.error('Erro na busca do spotlight:', error);
      res.status(500).json({ error: 'Erro ao buscar empresas.' });
    }
  });

  // ==========================================
  // 2. RAIO-X HISTÓRICO ANUAL 360° DA EMPRESA
  // ==========================================
  app.get('/api/companies/:id/history-360', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const year = parseInt(req.query.year, 10) || new Date().getUTCFullYear();

      const company = await prisma.company.findUnique({
        where: { id },
        include: {
          responsibles: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
      });

      if (!company) {
        return res.status(404).json({ error: 'Empresa não encontrada.' });
      }

      // Buscar todos os fechamentos da empresa neste ano
      const yearStart = new Date(Date.UTC(year, 0, 1));
      const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

      const closings = await prisma.closing.findMany({
        where: {
          companyId: id,
          referencePeriod: { gte: yearStart, lt: yearEnd },
        },
        select: {
          id: true,
          type: true,
          referencePeriod: true,
          status: true,
          columnsData: true,
          dashboardMetrics: true,
          updatedAt: true,
        },
        orderBy: { referencePeriod: 'asc' },
      });

      // Mapear os 12 meses
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];

      let totalExpectedClosings = 0;
      let totalCompletedClosings = 0;

      const months = monthNames.map((label, monthIndex) => {
        const periodDate = new Date(Date.UTC(year, monthIndex, 1));
        const periodStr = `${String(monthIndex + 1).padStart(2, '0')}/${year}`;

        // Fechamentos desse mês
        const monthClosings = closings.filter((c: any) => {
          const d = new Date(c.referencePeriod);
          return d.getUTCFullYear() === year && d.getUTCMonth() === monthIndex;
        });

        const fiscal = monthClosings.find((c: any) => c.type === 'FISCAL');
        const dp = monthClosings.find((c: any) => c.type === 'DP');
        const contabil = monthClosings.find((c: any) => c.type === 'CONTABIL');
        const cushman = monthClosings.find((c: any) => c.type === 'CUSHMAN');

        if (fiscal && fiscal.status !== 'NOT_APPLICABLE') totalExpectedClosings++;
        if (fiscal && fiscal.status === 'COMPLETED') totalCompletedClosings++;

        if (dp && dp.status !== 'NOT_APPLICABLE') totalExpectedClosings++;
        if (dp && dp.status === 'COMPLETED') totalCompletedClosings++;

        if (contabil && contabil.status !== 'NOT_APPLICABLE') totalExpectedClosings++;
        if (contabil && contabil.status === 'COMPLETED') totalCompletedClosings++;

        return {
          month: monthIndex + 1,
          label,
          periodStr,
          periodDate: periodDate.toISOString(),
          sectors: {
            fiscal: fiscal ? { status: fiscal.status, updatedAt: fiscal.updatedAt } : null,
            dp: dp ? {
              status: dp.status,
              employees: (dp.dashboardMetrics as any)?.employees || 0,
              updatedAt: dp.updatedAt,
            } : null,
            contabil: contabil ? { status: contabil.status, updatedAt: contabil.updatedAt } : null,
            cushman: cushman ? { status: cushman.status, updatedAt: cushman.updatedAt } : null,
          },
        };
      });

      const complianceRate = totalExpectedClosings > 0
        ? Math.round((totalCompletedClosings / totalExpectedClosings) * 100)
        : 100;

      res.json({
        company: {
          id: company.id,
          code: company.code,
          name: company.name,
          tradeName: company.tradeName,
          cnpj: company.cnpj,
          taxRegime: company.taxRegime,
          groupName: company.groupName,
          city: company.city,
          contractDate: company.contractDate,
          obligationStartDate: company.obligationStartDate,
          exitDate: company.exitDate,
          hasClientCertificate: company.hasClientCertificate,
          certificateType: company.certificateType,
          certificateExpiration: company.certificateExpiration,
          activeSectors: company.activeSectors,
          notes: company.notes,
          responsibles: company.responsibles.map((r: any) => ({
            sector: r.sector || 'Geral',
            name: r.user.name || r.user.email.split('@')[0],
            email: r.user.email,
            role: r.user.role,
          })),
        },
        year,
        complianceRate,
        totalExpectedClosings,
        totalCompletedClosings,
        months,
      });
    } catch (error) {
      console.error('Erro ao buscar histórico 360 da empresa:', error);
      res.status(500).json({ error: 'Erro ao buscar histórico anual da empresa.' });
    }
  });

  // ==========================================
  // 3. BALANCEADOR DE CARGA DA EQUIPE
  // ==========================================
  app.get('/api/workload/balance', async (req: any, res: any) => {
    try {
      const targetSector = req.query.sector ? String(req.query.sector).toUpperCase() : 'FISCAL';
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      // Buscar todos os usuários ativos
      const users = await prisma.user.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
        orderBy: { name: 'asc' },
      });

      // Buscar vínculos ativos de responsabilidade no setor correspondente
      const responsibles = await prisma.companyResponsible.findMany({
        where: {
          ...(targetSector !== 'ALL' ? { sector: targetSector } : {}),
          company: {
            AND: [
              externalCompaniesExcluded,
              companyExitWhere(monthStart),
            ],
          },
        },
        include: {
          company: {
            select: {
              id: true,
              code: true,
              name: true,
              cnpj: true,
              taxRegime: true,
              activeSectors: true,
            },
          },
        },
      });

      // Mapear por usuário
      const userWorkloadMap = new Map<string, {
        userId: string;
        userName: string;
        userEmail: string;
        role: string;
        totalCompanies: number;
        regimes: Record<string, number>;
        companies: Array<{ id: string; code: string | null; name: string; cnpj: string; taxRegime: string }>;
      }>();

      // Inicializa usuários do setor ou todos
      for (const u of users) {
        if (targetSector !== 'ALL' && u.role !== targetSector && !['ADMIN', 'SOCIO'].includes(u.role)) {
          // Mantém apenas os do papel relevante a menos que já tenham empresas
        }
        userWorkloadMap.set(u.id, {
          userId: u.id,
          userName: u.name || u.email.split('@')[0],
          userEmail: u.email,
          role: u.role,
          totalCompanies: 0,
          regimes: {},
          companies: [],
        });
      }

      for (const resp of responsibles) {
        let entry = userWorkloadMap.get(resp.userId);
        if (!entry) {
          const userObj = users.find((u: any) => u.id === resp.userId);
          entry = {
            userId: resp.userId,
            userName: userObj ? (userObj.name || userObj.email.split('@')[0]) : 'Usuário',
            userEmail: userObj?.email || '',
            role: userObj?.role || 'OUTRO',
            totalCompanies: 0,
            regimes: {},
            companies: [],
          };
          userWorkloadMap.set(resp.userId, entry);
        }

        entry.totalCompanies++;
        const regime = resp.company.taxRegime || 'OUTRO';
        entry.regimes[regime] = (entry.regimes[regime] || 0) + 1;
        entry.companies.push({
          id: resp.company.id,
          code: resp.company.code,
          name: resp.company.name,
          cnpj: resp.company.cnpj,
          taxRegime: regime,
        });
      }

      const analysts = Array.from(userWorkloadMap.values())
        .filter(a => a.totalCompanies > 0 || (targetSector !== 'ALL' && a.role === targetSector))
        .sort((a, b) => b.totalCompanies - a.totalCompanies);

      const totalAssigned = analysts.reduce((acc, cur) => acc + cur.totalCompanies, 0);
      const activeAnalystCount = analysts.filter(a => a.totalCompanies > 0).length || 1;
      const averagePerAnalyst = Math.round(totalAssigned / activeAnalystCount);

      const enrichedAnalysts = analysts.map(a => {
        let status: 'OVERLOAD' | 'BALANCED' | 'LIGHT' = 'BALANCED';
        if (a.totalCompanies > averagePerAnalyst * 1.25 && a.totalCompanies >= 25) {
          status = 'OVERLOAD';
        } else if (a.totalCompanies < averagePerAnalyst * 0.75) {
          status = 'LIGHT';
        }

        return {
          ...a,
          status,
          deviationFromAverage: a.totalCompanies - averagePerAnalyst,
        };
      });

      res.json({
        sector: targetSector,
        totalAssigned,
        averagePerAnalyst,
        analysts: enrichedAnalysts,
      });
    } catch (error) {
      console.error('Erro ao buscar dados do balanceador de carga:', error);
      res.status(500).json({ error: 'Erro ao calcular balanceamento de carga.' });
    }
  });

  // Rebalanceamento / Transferência em lote com filtro
  app.post('/api/workload/transfer-batch', async (req: any, res: any) => {
    try {
      const {
        fromUserId,
        toUserId,
        sector,
        regimeFilter,
        companyIds,
        quantity,
        actorId,
      } = req.body;

      if (!fromUserId || !toUserId) {
        return res.status(400).json({ error: 'Origem e destino são obrigatórios.' });
      }

      if (fromUserId === toUserId) {
        return res.status(400).json({ error: 'Origem e destino não podem ser iguais.' });
      }

      const fromUser = await prisma.user.findUnique({ where: { id: fromUserId } });
      const toUser = await prisma.user.findUnique({ where: { id: toUserId } });

      if (!fromUser || !toUser) {
        return res.status(404).json({ error: 'Usuários não encontrados.' });
      }

      const normSector = sector && sector !== 'ALL' ? String(sector).toUpperCase() : null;

      // Buscar vínculos elegíveis do usuário de origem
      const where: any = {
        userId: fromUserId,
        ...(normSector ? { sector: normSector } : {}),
      };

      if (Array.isArray(companyIds) && companyIds.length > 0) {
        where.companyId = { in: companyIds };
      }

      if (regimeFilter && regimeFilter !== 'ALL') {
        where.company = { taxRegime: regimeFilter };
      }

      let assignments = await prisma.companyResponsible.findMany({
        where,
        include: { company: true },
      });

      if (quantity && quantity > 0 && assignments.length > quantity) {
        assignments = assignments.slice(0, quantity);
      }

      if (assignments.length === 0) {
        return res.json({
          success: true,
          transferredCount: 0,
          message: 'Nenhuma empresa correspondente aos filtros foi encontrada para transferir.',
        });
      }

      let transferredCount = 0;

      for (const item of assignments) {
        const alreadyExists = await prisma.companyResponsible.findFirst({
          where: {
            companyId: item.companyId,
            userId: toUserId,
            sector: item.sector,
          },
        });

        if (!alreadyExists) {
          await prisma.companyResponsible.update({
            where: { id: item.id },
            data: { userId: toUserId },
          });
          transferredCount++;
        } else {
          // Se já tem o vínculo, deleta o do usuário de origem para não duplicar
          await prisma.companyResponsible.delete({ where: { id: item.id } });
          transferredCount++;
        }

        // Se o novo responsável tiver escopo CUSTOM, garante o acesso à empresa
        if (toUser.companyScope === 'CUSTOM') {
          const accessExists = await prisma.userCompanyAccess.findUnique({
            where: {
              userId_companyId: {
                userId: toUserId,
                companyId: item.companyId,
              },
            },
          });
          if (!accessExists) {
            await prisma.userCompanyAccess.create({
              data: { userId: toUserId, companyId: item.companyId },
            });
          }
        }
      }

      // Log de Auditoria
      const actorUser = actorId ? await prisma.user.findUnique({ where: { id: actorId } }) : null;
      await logAction(
        actorId || null,
        actorUser?.email || '',
        actorUser?.name || 'Administrador',
        'BALANCEAMENTO_CARGA_TRANSFERENCIA',
        normSector || 'GERAL',
        null,
        {
          totalTransferred: transferredCount,
          fromUserId: fromUser.id,
          fromUserName: fromUser.name || fromUser.email,
          toUserId: toUser.id,
          toUserName: toUser.name || toUser.email,
          sector: normSector || 'TODOS',
          regimeFilter: regimeFilter || 'TODOS',
        },
        getClientIp(req)
      );

      res.json({
        success: true,
        transferredCount,
        message: `${transferredCount} empresas transferidas com sucesso de ${fromUser.name || fromUser.email} para ${toUser.name || toUser.email}!`,
      });
    } catch (error) {
      console.error('Erro ao transferir em lote:', error);
      res.status(500).json({ error: 'Erro ao executar rebalanceamento em lote.' });
    }
  });
}
