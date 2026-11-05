import { resolveAuthenticatedUser } from './installments';
import { logAction, getClientIp } from './index';

export function registerDominioStaging(app: any, prisma: any) {
  // ==========================================
  // 1. RESUMO DE PENDÊNCIAS (Badge do Header)
  // ==========================================
  app.get('/api/dominio-staging/summary', async (_req: any, res: any) => {
    try {
      const pendingItems = await prisma.dominioStagingChange.groupBy({
        by: ['sector'],
        where: { status: 'PENDING' },
        _count: { id: true }
      });

      let total = 0;
      const bySector: Record<string, number> = {
        CONTABIL: 0,
        FISCAL: 0,
        DP: 0,
        CADASTRO: 0
      };

      for (const item of pendingItems) {
        bySector[item.sector] = item._count.id;
        total += item._count.id;
      }

      res.json({
        pendingCount: total,
        bySector
      });
    } catch (error: any) {
      console.error('Erro ao buscar resumo de staging do Domínio:', error);
      res.status(500).json({ error: 'Erro ao buscar resumo de pendências' });
    }
  });

  // ==========================================
  // 2. LISTAGEM DE ITENS DA FILA DE STAGING
  // ==========================================
  app.get('/api/dominio-staging', async (req: any, res: any) => {
    try {
      const status = req.query.status ? String(req.query.status).toUpperCase() : 'PENDING';
      const sector = req.query.sector ? String(req.query.sector).toUpperCase() : null;

      const where: any = {};
      if (status !== 'ALL') {
        where.status = status;
      }
      if (sector) {
        where.sector = sector;
      }

      const items = await prisma.dominioStagingChange.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100
      });

      res.json(items);
    } catch (error: any) {
      console.error('Erro ao listar itens de staging do Domínio:', error);
      res.status(500).json({ error: 'Erro ao buscar lista de alterações' });
    }
  });

  // ==========================================
  // 3. APROVAÇÃO DE ITENS (Aplica no Fechamento Pro)
  // ==========================================
  app.post('/api/dominio-staging/approve', async (req: any, res: any) => {
    try {
      const authUser = await resolveAuthenticatedUser(prisma, req);
      const userLabel = authUser?.name || authUser?.email || 'Usuário';
      const { ids, all, sector } = req.body || {};

      let whereClause: any = { status: 'PENDING' };
      if (Array.isArray(ids) && ids.length > 0) {
        whereClause.id = { in: ids };
      } else if (all) {
        if (sector) whereClause.sector = String(sector).toUpperCase();
      } else {
        return res.status(400).json({ error: 'Informe os IDs a serem aprovados.' });
      }

      const itemsToApprove = await prisma.dominioStagingChange.findMany({
        where: whereClause
      });

      if (itemsToApprove.length === 0) {
        return res.json({ success: true, count: 0, message: 'Nenhuma alteração pendente encontrada.' });
      }

      let approvedCount = 0;

      for (const item of itemsToApprove) {
        try {
          // ==========================================
          // CASO A: CADASTRO DE NOVA EMPRESA DO DOMÍNIO
          // ==========================================
          if (item.sector === 'CADASTRO' || item.columnKey === 'nova_empresa') {
            let companyData: any = {};
            try {
              companyData = JSON.parse(item.proposedValue);
            } catch {
              companyData = {
                code: item.companyCode,
                name: item.companyName
              };
            }

            const codeToUse = String(companyData.code || item.companyCode || '').trim();
            const rawCnpj = String(companyData.cnpj || '').trim();
            const formattedCnpj = rawCnpj || `TMP${Date.now()}`;

            // Checa se já existe por código ou CNPJ
            let existing = await prisma.company.findFirst({
              where: {
                OR: [
                  { cnpj: formattedCnpj },
                  ...(codeToUse ? [{ code: codeToUse }] : [])
                ]
              }
            });

            if (!existing) {
              const validRegimes = [
                'MEI',
                'SIMPLES_NACIONAL',
                'LUCRO_PRESUMIDO',
                'LUCRO_REAL_TRIMESTRAL',
                'LUCRO_REAL_ESTIMATIVA',
                'LUCRO_REAL_ANUAL',
                'IMUNE_IRPJ',
                'CONDOMINIOS'
              ];
              const taxRegime = validRegimes.includes(companyData.taxRegime)
                ? companyData.taxRegime
                : 'SIMPLES_NACIONAL';

              existing = await prisma.company.create({
                data: {
                  code: codeToUse || null,
                  name: companyData.name || item.companyName,
                  tradeName: companyData.tradeName || companyData.name || item.companyName,
                  cnpj: formattedCnpj,
                  taxRegime: taxRegime as any,
                  city: companyData.city || 'São Paulo',
                  stateRegistration: companyData.stateRegistration || null,
                  municipalRegistration: companyData.municipalRegistration || null,
                  activeSectors: 'CONTABIL,FISCAL,DP',
                  obligationStartDate: new Date()
                }
              });
            }

            await prisma.dominioStagingChange.update({
              where: { id: item.id },
              data: {
                companyId: existing.id,
                status: 'APPROVED',
                approvedBy: userLabel,
                approvedAt: new Date()
              }
            });

            approvedCount++;
            continue;
          }

          // ==========================================
          // CASO B: ATUALIZAÇÃO DE COLUNA DE FECHAMENTO
          // ==========================================
          // Localiza a empresa pelo id ou pelo código do Domínio
          let company: any = null;
          if (item.companyId) {
            company = await prisma.company.findUnique({ where: { id: item.companyId } });
          }
          if (!company && item.companyCode) {
            company = await prisma.company.findFirst({
              where: {
                OR: [
                  { code: String(item.companyCode) },
                  { code: String(Number(item.companyCode)) }
                ]
              }
            });
          }

          if (company) {
            // Normaliza o período de referência (ex: "2026-10-01T00:00:00.000Z")
            let refDate = new Date();
            if (item.referencePeriod.includes('/')) {
              const [m, y] = item.referencePeriod.split('/');
              refDate = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
            } else if (item.referencePeriod.includes('-')) {
              const parts = item.referencePeriod.split('-');
              if (parts.length >= 2) {
                refDate = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, 1));
              }
            } else if (/^\d{4}$/.test(item.referencePeriod)) {
              refDate = new Date(Date.UTC(Number(item.referencePeriod), 0, 1));
            }

            const closingType = item.sector === 'FISCAL' ? 'FISCAL' : item.sector === 'DP' ? 'DP' : 'CONTABIL';

            // Localiza ou cria o registro de fechamento correspondente
            const existingClosing = await prisma.closing.findFirst({
              where: {
                companyId: company.id,
                type: closingType,
                referencePeriod: refDate
              }
            });

            let currentCols = (existingClosing?.columnsData as any) || {};
            if (typeof currentCols !== 'object') currentCols = {};

            // Atualiza a coluna proposta
            if (item.sector === 'FISCAL') {
              const todayBr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
              const dateFound = item.proposedValue.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || todayBr;
              currentCols[item.columnKey] = {
                status: 'CONCLUIDO',
                completionDate: dateFound,
                label: dateFound,
                updatedAt: new Date().toISOString()
              };
            } else {
              currentCols[item.columnKey] = item.proposedValue;
            }

            if (existingClosing) {
              await prisma.closing.update({
                where: { id: existingClosing.id },
                data: {
                  columnsData: currentCols
                }
              });
            } else {
              await prisma.closing.create({
                data: {
                  companyId: company.id,
                  type: closingType,
                  referencePeriod: refDate,
                  status: 'PENDING',
                  columnsData: currentCols
                }
              });
            }
          }

          // Marca o registro do staging como aprovado
          await prisma.dominioStagingChange.update({
            where: { id: item.id },
            data: {
              status: 'APPROVED',
              approvedBy: userLabel,
              approvedAt: new Date()
            }
          });

          approvedCount++;
        } catch (innerErr) {
          console.warn(`Falha ao processar item de staging ${item.id}:`, innerErr);
        }
      }

      // Registra no log de auditoria
      await logAction(
        prisma,
        authUser?.id,
        authUser?.email,
        userLabel,
        'DOMINIO_STAGING_APPROVED',
        'DominioStagingChange',
        null,
        { count: approvedCount, ids: itemsToApprove.map((i: any) => i.id) },
        getClientIp(req)
      );

      res.json({
        success: true,
        count: approvedCount,
        message: `${approvedCount} alteração(ões) aprovada(s) e integradas com sucesso!`
      });
    } catch (error: any) {
      console.error('Erro ao aprovar alterações do Domínio:', error);
      res.status(500).json({ error: 'Erro ao processar aprovação' });
    }
  });

  // ==========================================
  // 4. REJEIÇÃO DE ITENS (Descarta proposta)
  // ==========================================
  app.post('/api/dominio-staging/reject', async (req: any, res: any) => {
    try {
      const authUser = await resolveAuthenticatedUser(prisma, req);
      const userLabel = authUser?.name || authUser?.email || 'Usuário';
      const { ids, all, sector } = req.body || {};

      let whereClause: any = { status: 'PENDING' };
      if (Array.isArray(ids) && ids.length > 0) {
        whereClause.id = { in: ids };
      } else if (all) {
        if (sector) whereClause.sector = String(sector).toUpperCase();
      } else {
        return res.status(400).json({ error: 'Informe os IDs a serem rejeitados.' });
      }

      const updateResult = await prisma.dominioStagingChange.updateMany({
        where: whereClause,
        data: {
          status: 'REJECTED',
          rejectedAt: new Date()
        }
      });

      await logAction(
        prisma,
        authUser?.id,
        authUser?.email,
        userLabel,
        'DOMINIO_STAGING_REJECTED',
        'DominioStagingChange',
        null,
        { count: updateResult.count },
        getClientIp(req)
      );

      res.json({
        success: true,
        count: updateResult.count,
        message: `${updateResult.count} alteração(ões) rejeitada(s).`
      });
    } catch (error: any) {
      console.error('Erro ao rejeitar alterações do Domínio:', error);
      res.status(500).json({ error: 'Erro ao processar rejeição' });
    }
  });

  // ==========================================
  // LIMPEZA DE DADOS DE TESTE DO STAGING
  // ==========================================
  app.post('/api/dominio-staging/clean-tests', async (_req: any, res: any) => {
    try {
      const deletedStaging = await prisma.dominioStagingChange.deleteMany({
        where: {
          OR: [
            { companyName: { contains: 'EXEMPLO' } },
            { columnKey: 'nova_empresa' },
            { status: 'PENDING' }
          ]
        }
      });

      const deletedCompany = await prisma.company.deleteMany({
        where: {
          OR: [
            { name: { contains: 'EXEMPLO' } },
            { code: '1099' }
          ]
        }
      });

      res.json({
        success: true,
        message: `Limpeza concluída! ${deletedStaging.count} itens de teste removidos do staging e ${deletedCompany.count} empresas de teste removidas.`
      });
    } catch (error: any) {
      console.error('Erro ao limpar testes do staging:', error);
      res.status(500).json({ error: 'Erro ao limpar dados de teste.' });
    }
  });

  // ==========================================
  // 5. SEED DE TESTE / SIMULAÇÃO DE ALTERAÇÕES
  // ==========================================
  app.post('/api/dominio-staging/seed-sample', async (_req: any, res: any) => {
    try {
      const sampleCompanies = await prisma.company.findMany({
        take: 5,
        select: { id: true, code: true, name: true }
      });

      if (sampleCompanies.length === 0) {
        return res.status(404).json({ error: 'Nenhuma empresa cadastrada para teste.' });
      }

      const samples = [
        {
          company: sampleCompanies[0],
          sector: 'CONTABIL',
          columnKey: 'fechamento_doc',
          columnLabel: 'Fechamento Documentos',
          currentValue: 'PENDENTE',
          proposedValue: '10/2026',
          referencePeriod: '2026'
        },
        {
          company: sampleCompanies[0],
          sector: 'CONTABIL',
          columnKey: 'cobranca_doc',
          columnLabel: 'Cobrança Documentos',
          currentValue: null,
          proposedValue: '04/11/2026',
          referencePeriod: '2026'
        },
        {
          company: sampleCompanies[1] || sampleCompanies[0],
          sector: 'FISCAL',
          columnKey: 'das',
          columnLabel: 'DAS / Apuração',
          currentValue: 'EM ABERTO',
          proposedValue: 'CONCLUÍDO',
          referencePeriod: '10/2026'
        },
        {
          company: sampleCompanies[2] || sampleCompanies[0],
          sector: 'DP',
          columnKey: 'calcular_folha',
          columnLabel: 'Cálculo de Folha',
          currentValue: 'NÃO CALCULADO',
          proposedValue: 'FOLHA CALCULADA',
          referencePeriod: '10/2026'
        },
        {
          company: { id: null, code: '1099', name: 'NOVA EMPRESA EXEMPLO DOMÍNIO LTDA' },
          sector: 'CADASTRO',
          columnKey: 'nova_empresa',
          columnLabel: 'Cadastro de Nova Empresa',
          currentValue: 'NÃO CADASTRADA',
          proposedValue: JSON.stringify({
            code: '1099',
            name: 'NOVA EMPRESA EXEMPLO DOMÍNIO LTDA',
            tradeName: 'EXEMPLO DOMÍNIO',
            cnpj: '45.987.654/0001-23',
            taxRegime: 'SIMPLES_NACIONAL',
            city: 'São Paulo'
          }),
          referencePeriod: '2026'
        }
      ];

      for (const s of samples) {
        await prisma.dominioStagingChange.create({
          data: {
            companyId: s.company.id || undefined,
            companyCode: s.company.code || '1',
            companyName: s.company.name,
            sector: s.sector,
            referencePeriod: s.referencePeriod,
            columnKey: s.columnKey,
            columnLabel: s.columnLabel,
            currentValue: s.currentValue,
            proposedValue: s.proposedValue,
            status: 'PENDING',
            sourceFile: '50110_20261104_1000M.dom'
          }
        });
      }

      res.json({ success: true, message: 'Dados de teste criados no Staging com sucesso!' });
    } catch (error: any) {
      console.error('Erro ao gerar seed de teste:', error);
      res.status(500).json({ error: 'Erro ao gerar dados de teste' });
    }
  });
}

