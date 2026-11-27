import { companyExitAllowsPeriod } from '../src/config/companyExit';
import { resolveAuthenticatedUser } from './installments';
import { queryClosingsBySectorAndRange } from './cleanClosingsSql';
import { formatCompanyCode } from '../src/utils/codeSort';

const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};

export function bpoAccess(user: any, edit = false): boolean {
  if (!user || user.active === false) return false;
  if (['ADMIN', 'SOCIO'].includes(user.role)) return true;
  if (user.role === 'FINANCEIRO') return true;

  const perm = user.sectorPermissions?.find((item: any) => item.sector === 'BPO');
  if (perm) {
    return edit ? perm.access === 'EDIT' : ['VIEW', 'EDIT'].includes(perm.access);
  }
  return false;
}

export function registerBpo(
  app: any,
  prisma: any,
  options: {
    pool?: any;
    onCompanyUpdated?: () => void;
    onClosingUpdated?: () => void;
    encrypt: (val: any) => any;
    decrypt: (val: any) => any;
  }
) {
  const endpoint = (handler: any) => async (req: any, res: any) => {
    try {
      const user = await resolveAuthenticatedUser(prisma, req);
      if (!user) fail(401, 'Sua sessão expirou. Saia e entre novamente.');
      if (!user.active) fail(403, 'Usuário inativo.');
      if (!bpoAccess(user)) fail(403, 'Sem acesso ao fechamento BPO Financeiro.');
      await handler(req, res, user);
    } catch (error: any) {
      if (!error.status) console.error('Erro no BPO:', error);
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Não foi possível concluir a operação no BPO.' });
    }
  };

  const getPeriod = (query: any) => {
    const now = new Date();
    // BPO é sempre por padrão o MÊS ATUAL!
    const defaultYear = now.getUTCFullYear();
    const defaultMonth = now.getUTCMonth() + 1;

    const year = query.year ? Number(query.year) : defaultYear;
    const month = query.month ? Number(query.month) : defaultMonth;

    if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
      fail(400, 'Competência inválida.');
    }
    return new Date(Date.UTC(year, month - 1, 1));
  };

  // GET /api/bpo-closings
  app.get(
    '/api/bpo-closings',
    endpoint(async (req: any, res: any, user: any) => {
      const period = getPeriod(req.query);
      const nextPeriod = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));

      // Buscar empresas que possuem BPO ou activeSectors contém BPO
      const allCompanies = await prisma.company.findMany({
        where: {
          deletedAt: null,
          OR: [
            { hasBpo: true },
            { activeSectors: { contains: 'BPO' } },
          ],
        },
        include: {
          responsibles: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
      });

      // Filtrar empresas elegíveis para a competência
      const eligibleCompanies = allCompanies.filter((company: any) => {
        const nextMonth = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
        const startOk = !company.obligationStartDate || new Date(company.obligationStartDate) < nextMonth;
        const exitOk = companyExitAllowsPeriod(company, period);
        return startOk && exitOk;
      });

      // Buscar fechamentos BPO existentes para este período
      const companyIds = eligibleCompanies.map((c: any) => c.id);
      let closings = await prisma.closing.findMany({
        where: {
          type: 'BPO',
          referencePeriod: period,
          companyId: { in: companyIds },
        },
      });

      const closingMap = new Map<string, any>(closings.map((cl: any) => [cl.companyId, cl]));
      const toCreate: any[] = [];

      // Inicializa fechamentos para empresas que ainda não possuem registro nesta competência
      for (const comp of eligibleCompanies) {
        if (!closingMap.has(comp.id)) {
          const cfg = (comp.bpoConfig as any) || {};
          const initialColumnsData = {
            system: cfg.system || { name: '', user: '', pass: '' },
            bankPhone: cfg.bankPhone || '',
            banks: Array.isArray(cfg.banks) ? cfg.banks : [],
            implementation: cfg.implementation || 'SIM',
            implementationNotes: cfg.implementationNotes || '',
            costCenter: cfg.costCenter || 'SIM',
            reconciliationTasks: [],
            finalization: { gerencial: '', fluxoCaixa: '', analiseCategoria: '' },
          };

          toCreate.push({
            companyId: comp.id,
            type: 'BPO',
            referencePeriod: period,
            status: 'PENDING',
            columnsData: initialColumnsData,
          });
        }
      }

      if (toCreate.length > 0) {
        await prisma.closing.createMany({ data: toCreate });
        closings = await prisma.closing.findMany({
          where: {
            type: 'BPO',
            referencePeriod: period,
            companyId: { in: companyIds },
          },
        });
      }

      // Usuários para atribuição de responsável
      const users = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' },
      });

      // Formatar dados de resposta
      const closingsByCompany = new Map<string, any>(closings.map((cl: any) => [cl.companyId, cl]));
      const rows = eligibleCompanies.map((company: any) => {
        const closing = closingsByCompany.get(company.id) || null;
        const respBpo = company.responsibles?.find((r: any) => r.sector === 'BPO')?.user ||
          company.responsibles?.find((r: any) => !r.sector)?.user || null;

        return {
          id: closing?.id || company.id,
          closingId: closing?.id,
          companyId: company.id,
          company: {
            ...company,
            code: formatCompanyCode(company.code) || null,
          },
          responsible: respBpo,
          status: closing?.status || 'PENDING',
          columnsData: closing?.columnsData || {},
          isSuspended: Boolean(company.isSuspended),
          suspendedReason: company.suspendedReason,
        };
      });

      res.json({
        period: period.toISOString(),
        year: period.getUTCFullYear(),
        month: period.getUTCMonth() + 1,
        total: rows.length,
        rows,
        users,
      });
    })
  );

  // PUT /api/bpo-closings/:id/column
  app.put(
    '/api/bpo-closings/:id/column',
    endpoint(async (req: any, res: any, user: any) => {
      if (!bpoAccess(user, true)) {
        fail(403, 'Você não possui permissão para editar o fechamento do BPO Financeiro.');
      }

      const { id } = req.params;
      const { columnKey, value } = req.body;

      if (!columnKey) fail(400, 'columnKey é obrigatório.');

      const closing = await prisma.closing.findUnique({
        where: { id },
        include: { company: true },
      });

      if (!closing || closing.type !== 'BPO') {
        fail(404, 'Fechamento BPO não encontrado.');
      }

      if (closing.company.isSuspended) {
        fail(403, 'Esta empresa está com os serviços suspensos e seu fechamento está bloqueado.');
      }

      const currentData = (closing.columnsData as any) || {};
      const updatedData = { ...currentData, [columnKey]: value };

      // Se for dado cadastral/configuracional, sincroniza com o Company.bpoConfig
      if (['system', 'bankPhone', 'banks', 'implementation', 'implementationNotes', 'costCenter'].includes(columnKey)) {
        const existingCfg = (closing.company.bpoConfig as any) || {};
        const updatedCfg = { ...existingCfg, [columnKey]: value };
        await prisma.company.update({
          where: { id: closing.companyId },
          data: { bpoConfig: updatedCfg },
        });
      }

      // Calcula status do fechamento
      let calculatedStatus = closing.status;
      if (columnKey === 'status' && typeof value === 'string') {
        calculatedStatus = value;
      } else {
        const finalization = updatedData.finalization || {};
        const isFinFilled = Boolean(finalization.gerencial || finalization.fluxoCaixa || finalization.analiseCategoria);
        if (isFinFilled) {
          calculatedStatus = 'COMPLETED';
        } else if (updatedData.reconciliationTasks && updatedData.reconciliationTasks.length > 0) {
          const allDone = updatedData.reconciliationTasks.every((t: any) => t.done);
          calculatedStatus = allDone ? 'COMPLETED' : 'IN_PROGRESS';
        }
      }

      const updatedClosing = await prisma.closing.update({
        where: { id },
        data: {
          columnsData: updatedData,
          status: calculatedStatus,
        },
      });

      if (options.onClosingUpdated) options.onClosingUpdated();

      res.json({
        success: true,
        closing: updatedClosing,
      });
    })
  );
}
