import type express from 'express';
import { resolveAuthenticatedUser } from './installments';

export function registerAutomation(app: express.Express, prisma: any) {

  const requireRobotAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const token = req.headers['authorization'];
    const validToken = process.env.ROBOT_API_SECRET || 'qmax-secret-robot-token-2026';
    if (token !== `Bearer ${validToken}`) {
      return res.status(401).json({ error: 'Acesso negado. Token de robô inválido.' });
    }
    next();
  };

  // 0. Enfileirar automações (Acionado pelo Frontend pelo analista)
  app.post('/api/automation/trigger', async (req, res) => {
    try {
      const actor = await resolveAuthenticatedUser(prisma, req);
      if (!actor || !actor.active) {
        return res.status(401).json({ error: 'Sessão necessária para acionar automações.' });
      }
      const { sector, year, month } = req.body;
      
      const companies = await prisma.company.findMany({
        where: { activeSectors: { contains: 'FISCAL' } },
        select: { id: true, cnpj: true }
      });

      const tasksToCreate = companies.map((c: any) => ({
        taskType: 'DOWNLOAD_DAS',
        companyId: c.id,
        status: 'PENDING',
        payload: { mes_referencia: `${String(month).padStart(2, '0')}/${year}` }
      }));

      if (tasksToCreate.length > 0) {
        await prisma.automationTask.createMany({
          data: tasksToCreate
        });
      }

      res.json({ success: true, count: tasksToCreate.length });
    } catch (error) {
      console.error('Erro ao acionar automações:', error);
      res.status(500).json({ error: 'Erro interno.' });
    }
  });

  // ==========================================
  // SINCRONIZAÇÃO PERFEITA GOB -> Q-MAX
  // ==========================================
  app.post('/api/automation/sync-gob', requireRobotAuth, async (req, res) => {
    try {
      // Exemplo do Payload: { "cnpj": "123...", "name": "Empresa X", "regime": "SIMPLES_NACIONAL", "competencia": "09/2026", "obrigacao": "simples_nacional", "status": "CONCLUIDO" }
      const { cnpj, name, regime, competencia, obrigacao, status } = req.body;
      
      if (!cnpj || !competencia || !obrigacao) {
        return res.status(400).json({ error: 'Faltam dados obrigatórios (cnpj, competencia, obrigacao)' });
      }

      const cleanCnpj = cnpj.replace(/\D/g, '');
      
      // 1. Transforma "09/2026" em Data UTC
      const [mesStr, anoStr] = competencia.split('/');
      const periodDate = new Date(Date.UTC(Number(anoStr), Number(mesStr) - 1, 1));

      // 2. Tenta achar a empresa. Se não achar, CADASTRA AUTOMATICAMENTE!
      let company = await prisma.company.findUnique({ where: { cnpj: cleanCnpj } });
      
      if (!company) {
        company = await prisma.company.create({
          data: {
            cnpj: cleanCnpj,
            name: name || 'Empresa Importada do GOB',
            code: cleanCnpj.substring(0, 6), // Gera um código provisório pelo início do CNPJ
            taxRegime: regime || 'SIMPLES_NACIONAL', 
            activeSectors: 'FISCAL', 
            obligationStartDate: periodDate, // Começa exatamente no mês informado
            contractDate: periodDate // Preenche a data de contrato também
          }
        });
        console.log(`✨ Nova empresa cadastrada automaticamente via GOB: ${company.name}`);
      }

      // 3. Acha ou Cria o Fechamento daquele mês
      let closing = await prisma.closing.findUnique({
        where: {
          companyId_type_referencePeriod: {
            companyId: company.id,
            type: 'FISCAL',
            referencePeriod: periodDate
          }
        }
      });

      if (!closing) {
        closing = await prisma.closing.create({
          data: {
            companyId: company.id,
            type: 'FISCAL',
            referencePeriod: periodDate,
            columnsData: {},
            status: 'IN_PROGRESS'
          }
        });
      }

      // 4. Atualiza a coluna mapeada
      const currentColumns = (closing.columnsData as any) || {};
      const columnKey = obrigacao; 
      
      currentColumns[columnKey] = {
        status: status,
        label: status === 'CONCLUIDO' ? 'GOB (API)' : status,
        sentWithApi: true,
        updatedAt: new Date().toISOString()
      };

      await prisma.closing.update({
        where: { id: closing.id },
        data: { columnsData: currentColumns }
      });

      res.json({ success: true, message: 'Status sincronizado e empresa garantida no banco.' });
    } catch (error) {
      console.error('Erro no sync-gob:', error);
      res.status(500).json({ error: 'Erro interno na sincronização.' });
    }
  });

  // 1. Polling: Robô pede a próxima tarefa pendente
  app.post('/api/automation/tasks/poll', requireRobotAuth, async (req, res) => {
    try {
      const { taskTypes } = req.body; 
      const pendingTask = await prisma.automationTask.findFirst({
        where: {
          status: 'PENDING',
          ...(taskTypes && taskTypes.length > 0 ? { taskType: { in: taskTypes } } : {})
        },
        orderBy: { createdAt: 'asc' },
        include: { company: { select: { cnpj: true, certificatePassword: true, ginfessPassword: true } } }
      });
      if (!pendingTask) return res.json({ task: null });

      const updatedTask = await prisma.automationTask.update({
        where: { id: pendingTask.id },
        data: { status: 'PROCESSING', startedAt: new Date(), attempts: { increment: 1 } }
      });
      res.json({ task: { ...pendingTask, ...updatedTask } });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar tarefas.' });
    }
  });

  app.post('/api/automation/tasks/:id/complete', requireRobotAuth, async (req, res) => {
    try {
      const task = await prisma.automationTask.update({
        where: { id: req.params.id },
        data: { status: 'COMPLETED', completedAt: new Date(), result: req.body.result || {} }
      });
      res.json({ success: true, task });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao concluir tarefa.' });
    }
  });

  app.post('/api/automation/tasks/:id/fail', requireRobotAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const currentTask = await prisma.automationTask.findUnique({ where: { id } });
      if (!currentTask) return res.status(404).json({ error: 'Task not found' });
      const newStatus = currentTask.attempts >= currentTask.maxAttempts ? 'FAILED' : 'PENDING';
      const task = await prisma.automationTask.update({
        where: { id },
        data: { status: newStatus, errorMessage: req.body.errorMessage, ...(newStatus === 'FAILED' ? { completedAt: new Date() } : {}) }
      });
      res.json({ success: true, task, willRetry: newStatus === 'PENDING' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao reportar falha.' });
    }
  });
}
