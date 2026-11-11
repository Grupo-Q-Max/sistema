import {companyExitWhere,companyExitAllowsPeriod,exitDecisionError,exitDecisionValue} from '../src/config/companyExit';
import {registerCompanyQuality,invalidateCompanyQualityCache} from './companyQuality';
import {registerCushman} from './cushman';
import {registerAnalytics,invalidateAnalyticsCache} from './analytics';
import {registerRiskRadar,invalidateRiskRadarCache} from './riskRadar';
import {registerWorkloadAndHistory} from './workloadAndHistory';
import {registerDeploy} from './deploy';
import {registerAutomation} from './automation';
import {registerDominioStaging} from './dominioStaging';
import {registerPowerPack} from './powerPack';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {externalCompaniesExcluded} from '../src/config/installmentCompanies';
import { normalizeLoginEmail, verifyLoginPassword } from './authPassword';
import { issueSession, getSessionSecret, resolveAuthenticatedUser, invalidateAuthUserCache, registerInstallments } from './installments';
import { queryClosingsBySectorAndRange, queryClosingsForDashboard, queryFiscalReinfMap, queryFallbackClosingsForPeriods } from './cleanClosingsSql';
import { createAccountingYearEngine } from './accountingYear';
import { ACCOUNTING_COLUMNS, ACCOUNTING_API_VERSION, accountingYear, accountingMonth, annualColumnActive, annualValues, accountingProgress } from '../src/config/accountingColumns';
import { createRolloverEngine, replicatedData, isColumnReplicable, propagateReplicableColumnToFutureMonths, syncAllFutureClosingsWithAnteriorReplicables } from './monthRollover';
import { formatCompanyCode } from '../src/utils/codeSort';
import { latestOpenPeriod, periodIsOpen, blockedPeriodMessage, setManualLatestPeriod, normalizePeriod } from '../src/config/competenceCalendar';
import { PAYROLL_API_VERSION, resolveColumnKey, effectiveFieldConfig, validateFieldConfig, validatePayrollValue } from '../src/config/payrollColumns';
import { isColumnActive, validateVisibility, calculateColumnProgress, isColumnComplete } from '../src/config/columnVisibility';
import { validatePopup, effectivePopup, FISCAL_POPUPS } from '../src/config/fiscalPopups';
import { applyFiscalRegimeRules, normalizeFiscalRegimeRules, setActiveFiscalRegimeRules, type FiscalRegimeNaMap } from '../src/config/fiscalRegimeRules';
import { computeInstallmentsProgress } from '../src/config/installments';
import { buildUserCompanyPrismaFilter, canUserEditCompany, isPrivilegedUser, companyBelongsToSector } from '../src/config/companyPermissions';
import { normalizeCompanyCatalog, type CompanyCatalogConfig } from '../src/config/systemCatalogs';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const app = express();

// Compressão Gzip/Deflate para acelerar tráfego de rede (reduz consumo em até 80%)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

const connectionString = process.env.DATABASE_URL || '';
const url = new URL(connectionString);
const useSsl = url.hostname.includes('azure') || url.searchParams.get('ssl') === 'true';
const pool = mariadb.createPool({
  host: url.hostname,
  port: parseInt(url.port, 10) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  dateStrings: true,
  connectionLimit: 15,
  connectTimeout: 10000,
  idleTimeout: 60000,
  keepAliveDelay: 30000,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

const adapter = new PrismaMariaDb(pool as any);
const prisma = new PrismaClient({ adapter }) as any;

export function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '0.0.0.0';
}

export async function logAction(
  userId: string | null | undefined,
  userEmail: string | null | undefined,
  userName: string | null | undefined,
  action: string,
  entity: string | null | undefined,
  entityId: string | null | undefined,
  details: any,
  ipAddress: string = '0.0.0.0'
) {
  try {
    await prisma.systemLog.create({
      data: {
        userId: userId || null,
        userEmail: userEmail || null,
        userName: userName || null,
        action,
        entity: entity || null,
        entityId: entityId || null,
        details: details || {},
        ipAddress: ipAddress || '0.0.0.0'
      }
    });
  } catch (error) {
    console.error('Erro ao salvar log:', error);
  }
}

app.use(cors());

// Cabeçalhos de Proteção HTTP (Anti-Clickjacking, Anti-MIME-Sniffing e Referrer Policy)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json());

// Controle de Força Bruta no Login (Sliding Window em Memória)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
function checkLoginRateLimit(ip: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return { allowed: true };
  }
  if (entry.count >= 5) {
    const waitSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, waitSeconds };
  }
  entry.count++;
  return { allowed: true };
}
function resetLoginRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

const KNOWN_API_PREFIXES = [
  '/closings',
  '/companies',
  '/columns',
  '/accounting-closings',
  '/cushman-closings',
  '/cushman-companies',
  '/installments',
  '/admin',
  '/app-config',
  '/session',
  '/plans',
  '/company',
  '/competences',
  '/dashboard',
  '/analytics',
  '/users',
  '/logs',
  '/login',
  '/logout',
  '/dominio-staging',
  '/events',
  '/health',
  '/presence',
  '/notifications',
  '/competence',
  '/billing',
  '/gamification',
  '/cnd',
  '/special-obligations',
];

// Normaliza requisições vindas com prefixo legado /sistema ou sem /api ou com /api duplicado
app.use((req, res, next) => {
  if (req.url.startsWith('/api/api/')) {
    req.url = req.url.substring('/api'.length);
  } else if (req.url.startsWith('/sistema/api')) {
    req.url = req.url.substring('/sistema'.length);
  } else if (req.url.startsWith('/sistema/')) {
    req.url = req.url.substring('/sistema'.length);
  }

  for (const prefix of KNOWN_API_PREFIXES) {
    if (req.url === prefix || req.url.startsWith(prefix + '/') || req.url.startsWith(prefix + '?')) {
      req.url = '/api' + req.url;
      break;
    }
  }

  next();
});

// ========================
// REAL-TIME COLLABORATION (SSE - Server-Sent Events)
// ========================
const sseClients = new Set<any>();

export function broadcastRealtimeEvent(type: string, payload: any) {
  if (sseClients.size === 0) return;
  const data = `data: ${JSON.stringify({ type, payload, timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

app.get('/api/events', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', clientId: Date.now() })}\n\n`);
  sseClients.add(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 25000);

  _req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Endpoint de saúde detalhado para monitoramento e auto-healing no Azure
app.get('/api/health', async (_req, res) => {
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startTime;
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: 'connected',
        latencyMs,
      },
      realtimeClients: sseClients.size,
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      version: '1.0.0',
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        status: 'disconnected',
        error: error.message || 'Falha de conexão com o banco',
      },
    });
  }
});

// ========================
// 1. PRESENÇA EM TEMPO REAL ("Quem está editando agora?")
// ========================
interface ActivePresence {
  userId: string;
  userName: string;
  userEmail: string;
  sector: string;
  companyId?: string;
  closingId?: string;
  columnKey?: string;
  lastSeen: number;
}

const activePresenceMap = new Map<string, ActivePresence>();

export function getActivePresenceList(): ActivePresence[] {
  const now = Date.now();
  const list: ActivePresence[] = [];
  for (const [key, p] of activePresenceMap.entries()) {
    if (now - p.lastSeen > 35000) {
      activePresenceMap.delete(key);
    } else {
      list.push(p);
    }
  }
  return list;
}

// Limpeza e sincronização de presenças expiradas
setInterval(() => {
  const beforeCount = activePresenceMap.size;
  const list = getActivePresenceList();
  if (list.length !== beforeCount) {
    broadcastRealtimeEvent('PRESENCE_SYNC', list);
  }
}, 15000);

app.post('/api/presence', async (req, res) => {
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { sector = 'GERAL', companyId, closingId, columnKey } = req.body || {};
    const presenceKey = `${actor.id}_${sector}`;

    activePresenceMap.set(presenceKey, {
      userId: actor.id,
      userName: actor.name || actor.email.split('@')[0],
      userEmail: actor.email,
      sector,
      companyId: companyId || undefined,
      closingId: closingId || undefined,
      columnKey: columnKey || undefined,
      lastSeen: Date.now(),
    });

    const activeList = getActivePresenceList();
    broadcastRealtimeEvent('PRESENCE_SYNC', activeList);

    res.json({ success: true, activeUsers: activeList });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar presença' });
  }
});

app.get('/api/presence', (_req, res) => {
  res.json({ activeUsers: getActivePresenceList() });
});

// ========================
// 2. CENTRO DE NOTIFICAÇÕES & ALERTAS PROATIVOS
// ========================
let cachedNotifications: { ts: number; payload: any } | null = null;

app.get('/api/notifications', async (_req, res) => {
  try {
    const now = Date.now();
    if (cachedNotifications && now - cachedNotifications.ts < 45000) {
      return res.json(cachedNotifications.payload);
    }

    const today = new Date();
    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        cnpj: true,
        hasClientCertificate: true,
        certificateExpiration: true,
        certificateType: true,
        responsibles: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const alerts: Array<{
      id: string;
      type: 'CERTIFICATE_EXPIRED' | 'CERTIFICATE_EXPIRING' | 'FISCAL_DEADLINE' | 'UNASSIGNED_RESPONSIBLE';
      severity: 'CRITICAL' | 'WARNING' | 'INFO';
      title: string;
      message: string;
      companyId?: string;
      companyName?: string;
      companyCode?: string | null;
      daysRemaining?: number;
      date?: string;
      responsibleName?: string;
    }> = [];

    for (const c of companies) {
      if (c.hasClientCertificate && c.certificateExpiration) {
        const parts = c.certificateExpiration.trim().split('/');
        let expDate: Date | null = null;
        if (parts.length === 2) {
          const month = parseInt(parts[0], 10);
          const year = parseInt(parts[1], 10);
          if (month >= 1 && month <= 12 && year > 2000) {
            expDate = new Date(year, month, 0, 23, 59, 59);
          }
        } else {
          const parsed = new Date(c.certificateExpiration);
          if (!isNaN(parsed.getTime())) expDate = parsed;
        }

        if (expDate) {
          const diffMs = expDate.getTime() - today.getTime();
          const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          const fiscalResp = c.responsibles.find((r: any) => r.sector === 'FISCAL')?.user?.name;

          if (daysRemaining < 0) {
            alerts.push({
              id: `cert_exp_${c.id}`,
              type: 'CERTIFICATE_EXPIRED',
              severity: 'CRITICAL',
              title: 'Certificado Vencido',
              message: `O certificado de ${c.name} venceu há ${Math.abs(daysRemaining)} dias (${c.certificateExpiration}).`,
              companyId: c.id,
              companyName: c.name,
              companyCode: c.code,
              daysRemaining,
              date: c.certificateExpiration,
              responsibleName: fiscalResp,
            });
          } else if (daysRemaining <= 15) {
            alerts.push({
              id: `cert_warn_${c.id}`,
              type: 'CERTIFICATE_EXPIRING',
              severity: 'CRITICAL',
              title: 'Certificado Vencendo (Urgente)',
              message: `Certificado de ${c.name} vence em ${daysRemaining} dia(s) (${c.certificateExpiration})!`,
              companyId: c.id,
              companyName: c.name,
              companyCode: c.code,
              daysRemaining,
              date: c.certificateExpiration,
              responsibleName: fiscalResp,
            });
          } else if (daysRemaining <= 30) {
            alerts.push({
              id: `cert_info_${c.id}`,
              type: 'CERTIFICATE_EXPIRING',
              severity: 'WARNING',
              title: 'Certificado Próximo do Vencimento',
              message: `Certificado de ${c.name} vence em ${daysRemaining} dias (${c.certificateExpiration}). Solicite a renovação.`,
              companyId: c.id,
              companyName: c.name,
              companyCode: c.code,
              daysRemaining,
              date: c.certificateExpiration,
              responsibleName: fiscalResp,
            });
          }
        }
      }
    }

    const currentDay = today.getDate();
    if (currentDay >= 15 && currentDay <= 20) {
      const daysTo20 = 20 - currentDay;
      alerts.unshift({
        id: 'tax_deadline_20',
        type: 'FISCAL_DEADLINE',
        severity: daysTo20 <= 2 ? 'CRITICAL' : 'WARNING',
        title: `Vencimento DCTFWeb / DAS em ${daysTo20 === 0 ? 'HOJE' : daysTo20 + ' dia(s)'}!`,
        message: `Faltam ${daysTo20} dia(s) para o vencimento do dia 20. Revise obrigações com pendência no Fiscal e DP.`,
        daysRemaining: daysTo20,
      });
    }

    const payload = {
      timestamp: new Date().toISOString(),
      totalAlerts: alerts.length,
      criticalCount: alerts.filter(a => a.severity === 'CRITICAL').length,
      warningCount: alerts.filter(a => a.severity === 'WARNING').length,
      alerts: alerts.slice(0, 50),
    };

    cachedNotifications = { ts: now, payload };
    res.json(payload);
  } catch (error) {
    console.error('Erro ao buscar notificações:', error);
    res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
});

// ========================
// 3. CONGELAMENTO / SNAPSHOT IMUTÁVEL DE COMPETÊNCIA
// ========================
app.post('/api/competence/freeze', async (req, res) => {
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Apenas Administradores e Sócios podem congelar competências.' });
    }

    const { referencePeriod, sector = 'GERAL', summaryNotes } = req.body;
    if (!referencePeriod) {
      return res.status(400).json({ error: 'referencePeriod é obrigatório (ex: 2026-10-01).' });
    }

    const periodDate = new Date(referencePeriod);
    if (isNaN(periodDate.getTime())) {
      return res.status(400).json({ error: 'Data de competência inválida.' });
    }

    const nextPeriodDate = new Date(Date.UTC(periodDate.getUTCFullYear(), periodDate.getUTCMonth() + 1, 1));

    const [companies, closings] = await Promise.all([
      prisma.company.findMany({
        where: { deletedAt: null },
        omit: { legacyData: true, certificatePassword: true, ginfessPassword: true, gissOnlinePassword: true, sdPassword: true, nfPassword: true },
        include: { responsibles: { include: { user: { select: { id: true, name: true, email: true } } } } },
      }),
      prisma.closing.findMany({
        where: {
          referencePeriod: { gte: periodDate, lt: nextPeriodDate },
          ...(sector !== 'GERAL' ? { type: sector } : {}),
        },
      }),
    ]);

    const totalCompanies = companies.length;
    const totalClosings = closings.length;
    const completedClosings = closings.filter((c: any) => c.status === 'CONCLUIDO').length;
    const pendingClosings = closings.filter((c: any) => c.status === 'PENDENTE' || c.status === 'PENDENCIA').length;

    const summary = {
      period: periodDate.toISOString().slice(0, 7),
      sector,
      frozenAt: new Date().toISOString(),
      closedByUserId: actor.id,
      closedByName: actor.name || actor.email,
      totalCompanies,
      totalClosings,
      completedClosings,
      pendingClosings,
      completionRate: totalClosings > 0 ? Math.round((completedClosings / totalClosings) * 100) : 0,
      notes: summaryNotes || null,
    };

    const snapshotPayload = {
      summary,
      companiesCount: companies.length,
      closingsCount: closings.length,
      closings: closings.map((cl: any) => ({
        id: cl.id,
        companyId: cl.companyId,
        type: cl.type,
        status: cl.status,
        columnsData: cl.columnsData,
        updatedAt: cl.updatedAt,
      })),
    };

    const snapshot = await prisma.competenceSnapshot.create({
      data: {
        referencePeriod: periodDate,
        sector,
        snapshotData: JSON.stringify(snapshotPayload),
        summary: JSON.stringify(summary),
        closedByUserId: actor.id,
        closedByName: actor.name || actor.email,
      },
    });

    void logAction(
      actor.id,
      actor.email,
      actor.name || actor.email,
      'CONGELOU_COMPETENCIA',
      'COMPETENCIA',
      snapshot.id,
      summary,
      getClientIp(req)
    );

    broadcastRealtimeEvent('COMPETENCE_FROZEN', { snapshotId: snapshot.id, summary });

    res.json({
      success: true,
      message: 'Competência congelada e homologada com sucesso!',
      snapshot: {
        id: snapshot.id,
        referencePeriod: snapshot.referencePeriod,
        sector: snapshot.sector,
        summary,
        createdAt: snapshot.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Erro ao congelar competência:', error);
    res.status(500).json({ error: error.message || 'Erro ao congelar competência' });
  }
});

app.get('/api/competence/snapshots', async (_req, res) => {
  try {
    const snapshots = await prisma.competenceSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        referencePeriod: true,
        sector: true,
        summary: true,
        closedByName: true,
        createdAt: true,
      },
    });

    res.json({
      snapshots: snapshots.map((s: any) => ({
        id: s.id,
        referencePeriod: s.referencePeriod,
        sector: s.sector,
        summary: s.summary ? JSON.parse(s.summary) : null,
        closedByName: s.closedByName,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Erro ao listar snapshots:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico de competências congeladas' });
  }
});

// ========================
// 4. RADAR DE REAJUSTE DE HONORÁRIOS & DESVIO DE ESCOPO
// ========================
app.get('/api/billing/drift-radar', async (req, res) => {
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Acesso restrito a Sócios e Administradores.' });
    }

    const companies = await prisma.company.findMany({
      where: { deletedAt: null, exitDate: null },
      select: {
        id: true,
        code: true,
        name: true,
        tradeName: true,
        cnpj: true,
        taxRegime: true,
        city: true,
        contractDate: true,
        closings: {
          where: { type: 'DP' },
          orderBy: { referencePeriod: 'desc' },
          take: 1,
          select: { dashboardMetrics: true, columnsData: true },
        },
        responsibles: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });

    const suggestions: Array<{
      companyId: string;
      code: string | null;
      name: string;
      cnpj: string;
      taxRegime: string;
      city: string | null;
      employees: number;
      reasons: string[];
      suggestedAdjustmentMonthly: number;
      priority: 'HIGH' | 'MEDIUM' | 'LOW';
      responsibleDP?: string;
    }> = [];

    for (const c of companies) {
      const latestDp = c.closings[0];
      const metrics = (latestDp?.dashboardMetrics as any) || {};
      const cols = (latestDp?.columnsData as any) || {};

      let employees = 0;
      if (typeof metrics.employees === 'number') {
        employees = metrics.employees;
      } else if (cols.dp_qtde_funcionarios) {
        employees = parseInt(String(cols.dp_qtde_funcionarios).replace(/\D/g, ''), 10) || 0;
      }

      const reasons: string[] = [];
      let adjustment = 0;

      if (employees >= 50) {
        reasons.push(`Operação robusta com ${employees} funcionários ativos no DP.`);
        adjustment += Math.round((employees - 10) * 35);
      } else if (employees >= 20) {
        reasons.push(`Equipe expandida para ${employees} funcionários (esforço eSocial/FGTS elevado).`);
        adjustment += Math.round((employees - 8) * 35);
      } else if (employees >= 10) {
        reasons.push(`Superou 10 funcionários (${employees} ativos).`);
        adjustment += Math.round((employees - 5) * 30);
      }

      if (c.taxRegime === 'LUCRO_REAL') {
        reasons.push('Lucro Real: apuração de alta complexidade contábil e fiscal.');
        adjustment += 800;
      } else if (c.taxRegime === 'LUCRO_PRESUMIDO' && employees >= 15) {
        reasons.push('Lucro Presumido com folha volumosa (obrigações acessórias EFD/DCTFWeb dobradas).');
        adjustment += 450;
      }

      if (reasons.length > 0 && adjustment > 0) {
        adjustment = Math.ceil(adjustment / 50) * 50;
        const priority = adjustment >= 800 || employees >= 30 ? 'HIGH' : adjustment >= 400 ? 'MEDIUM' : 'LOW';
        const dpResp = c.responsibles.find((r: any) => r.sector === 'DP')?.user?.name;

        suggestions.push({
          companyId: c.id,
          code: c.code,
          name: c.name,
          cnpj: c.cnpj,
          taxRegime: c.taxRegime,
          city: c.city,
          employees,
          reasons,
          suggestedAdjustmentMonthly: adjustment,
          priority,
          responsibleDP: dpResp,
        });
      }
    }

    suggestions.sort((a, b) => b.suggestedAdjustmentMonthly - a.suggestedAdjustmentMonthly);

    const totalOpportunityMonthly = suggestions.reduce((acc, s) => acc + s.suggestedAdjustmentMonthly, 0);

    res.json({
      timestamp: new Date().toISOString(),
      totalOpportunityMonthly,
      totalOpportunityAnnual: totalOpportunityMonthly * 12,
      companiesAffected: suggestions.length,
      suggestions,
    });
  } catch (error: any) {
    console.error('Erro no radar de honorários:', error);
    res.status(500).json({ error: 'Erro ao calcular oportunidades de reajuste de honorários' });
  }
});

registerInstallments(app, prisma, { onChanged: () => invalidateDashboardCache() });
registerCompanyQuality(app,prisma,decryptPassword);
registerAnalytics(app,prisma);
registerRiskRadar(app,prisma);
registerWorkloadAndHistory(app,prisma);
registerDeploy(app);
registerAutomation(app,prisma);
registerDominioStaging(app,prisma);
registerPowerPack(app,prisma,pool);

let appConfigCache: {
  ts: number;
  fiscalRegimeRules: FiscalRegimeNaMap;
  companyCatalog: CompanyCatalogConfig;
} | null = null;

function invalidateAppConfigCache() {
  appConfigCache = null;
}

async function getAppConfigPayload() {
  const now = Date.now();
  if (appConfigCache && now - appConfigCache.ts < 300_000) {
    setActiveFiscalRegimeRules(appConfigCache.fiscalRegimeRules);
    return {
      fiscalRegimeRules: appConfigCache.fiscalRegimeRules,
      companyCatalog: appConfigCache.companyCatalog,
    };
  }
  const rows = await prisma.appConfig.findMany().catch(() => []);
  const map = new Map<string, any>((rows || []).map((r: any) => [r.id, r.value]));
  const fiscalRegimeRules = normalizeFiscalRegimeRules(map.get('fiscal_regime_rules'));
  const companyCatalog = normalizeCompanyCatalog(map.get('company_catalog'));
  setActiveFiscalRegimeRules(fiscalRegimeRules);
  appConfigCache = { ts: now, fiscalRegimeRules, companyCatalog };
  return { fiscalRegimeRules, companyCatalog };
}

app.get('/api/app-config', async (_req, res) => {
  try {
    const payload = await getAppConfigPayload();
    res.json(payload);
  } catch (error) {
    console.error('Erro ao carregar app-config:', error);
    res.status(500).json({ error: 'Erro ao carregar configurações do sistema' });
  }
});

app.put('/api/app-config/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (actor && !isPrivilegedUser(actor) && !actor.screenPermissions?.some((p: any) => p.screen === 'settings-columns' && p.allowed)) {
      return res.status(403).json({ error: 'Sem permissão para alterar configurações do sistema.' });
    }

    let normalizedValue: any;
    if (key === 'fiscal_regime_rules') {
      normalizedValue = normalizeFiscalRegimeRules(req.body?.value ?? req.body);
      setActiveFiscalRegimeRules(normalizedValue);
    } else if (key === 'company_catalog') {
      normalizedValue = normalizeCompanyCatalog(req.body?.value ?? req.body);
    } else {
      return res.status(400).json({ error: 'Chave de configuração inválida.' });
    }

    await prisma.appConfig.upsert({
      where: { id: key },
      create: { id: key, value: normalizedValue },
      update: { value: normalizedValue },
    });

    invalidateAppConfigCache();
    invalidateAllDataCaches();
    const payload = await getAppConfigPayload();

    if (actor) {
      void logAction(
        actor.id,
        actor.email,
        actor.name || actor.email,
        'ATUALIZOU_CONFIGURACAO',
        'CONFIGURACAO',
        key,
        { key },
        getClientIp(req)
      );
    }

    res.json({ success: true, ...payload });
  } catch (error) {
    console.error('Erro ao salvar app-config:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações do sistema' });
  }
});

const ALL_SECTORS = ['CONTABIL', 'FISCAL', 'PARCELAMENTO', 'DP', 'CUSHMAN'];
const ALL_SCREENS = [
  { id: 'dashboard', label: 'Visão Geral' },
  { id: 'analytics', label: 'Gráficos e Indicadores' },
  { id: 'closings', label: 'Fechamentos' },
  { id: 'companies', label: 'Empresas' },
  { id: 'certificates', label: 'Certificados e Procurações' },
  { id: 'installments-create', label: 'Criar parcelamentos na tela Fiscal' },
  { id: 'settings-data-quality', label: 'Avisos de Cadastro' },
  { id: 'logs', label: 'Logs de Auditoria do Sistema' },
  { id: 'settings-permissions', label: 'Configurações: Permissões' },
  { id: 'settings-columns', label: 'Configurações: Colunas, Regras e Cadastros' },
];

// ========================
// 1. AUTENTICAÇÃO
// ========================
app.post('/api/login', async (req, res) => {
  const clientIp = getClientIp(req);
  try {
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: `Muitas tentativas de login incorretas. Tente novamente em ${rateCheck.waitSeconds} segundos.` });
    }

    const { password } = req.body;
    const email = normalizeLoginEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ error: 'E-mail ou usuário é obrigatório' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { email: `${email}@grupoqmax.com.br` },
          { email: `${email.replace(/_/g, '.')}@grupoqmax.com.br` },
          { email: `${email}@fechamento.com.br` },
          { email: `${email}@qmax.com` }
        ]
      },
      include: {
        sectorPermissions: true,
        screenPermissions: true,
        responsibleAssignments: { select: { companyId: true, sector: true } },
        companyAccess: {
          include: { company: { select: { id: true, name: true, cnpj: true } } },
        },
      },
    });

    if (!user) {
      await logAction(
        null,
        email,
        'Desconhecido',
        'LOGIN_FALHA',
        'AUTENTICACAO',
        null,
        { motivo: 'Credenciais inválidas' },
        clientIp
      );
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    if (!user.active) {
      await logAction(
        user.id,
        user.email,
        user.name || 'Usuário Inativo',
        'LOGIN_FALHA',
        'AUTENTICACAO',
        user.id,
        { motivo: 'Usuário inativo' },
        clientIp
      );
      return res.status(403).json({ error: 'Usuário inativo. Contate o administrador.' });
    }

    if(typeof password!=='string'||!password) {
      await logAction(
        user.id,
        user.email,
        user.name || 'Usuário',
        'LOGIN_FALHA',
        'AUTENTICACAO',
        user.id,
        { motivo: 'Senha não informada' },
        clientIp
      );
      return res.status(401).json({ error: 'Informe sua senha.' });
    }

    const valid=verifyLoginPassword(user.password,password);
    if(!valid) {
      await logAction(
        user.id,
        user.email,
        user.name || 'Usuário',
        'LOGIN_FALHA',
        'AUTENTICACAO',
        user.id,
        { motivo: 'Credenciais inválidas' },
        clientIp
      );
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    }

    // Sucesso no Login: zera contador de rate-limit
    resetLoginRateLimit(clientIp);

    void logAction(
      user.id,
      user.email,
      user.name || 'Usuário',
      'LOGIN',
      'AUTENTICACAO',
      user.id,
      { motivo: 'Login realizado com sucesso', role: user.role },
      clientIp
    );

    const { password: _, ...userSafe } = user;
    res.json({ ...userSafe, sessionToken: issueSession(user.id, getSessionSecret()) });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao processar login' });
  }
});

app.post('/api/session/refresh', async (req, res) => {
  try {
    const resolved = await resolveAuthenticatedUser(prisma, req);
    if (!resolved) {
      return res.status(401).json({ error: 'Sessão inválida.' });
    }
    if (!resolved.active) {
      return res.status(403).json({ error: 'Usuário inativo.' });
    }
    const fullUser = await prisma.user.findUnique({
      where: { id: resolved.id },
      include: {
        sectorPermissions: true,
        screenPermissions: true,
        responsibleAssignments: { select: { companyId: true, sector: true } },
        companyAccess: {
          include: { company: { select: { id: true, name: true, cnpj: true } } },
        },
      },
    });
    if (!fullUser || !fullUser.active) {
      return res.status(401).json({ error: 'Usuário não disponível.' });
    }
    const { password: _, ...userSafe } = fullUser;
    res.json({ ...userSafe, sessionToken: issueSession(fullUser.id, getSessionSecret()) });
  } catch (error) {
    console.error('Erro ao renovar sessão:', error);
    res.status(500).json({ error: 'Erro ao renovar sessão' });
  }
});

app.post('/api/logout', async (req, res) => {
  const clientIp = getClientIp(req);
  try {
    const { userId, userEmail, userName } = req.body;
    if (userId || userEmail) {
      void logAction(
        userId || null,
        userEmail || null,
        userName || 'Usuário',
        'LOGOUT',
        'AUTENTICACAO',
        userId || null,
        { motivo: 'Logout efetuado com sucesso' },
        clientIp
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ error: 'Erro ao registrar logout' });
  }
});

// Endpoint seguro para troca de senha pelo próprio usuário ou admin autenticado
app.post('/api/user/change-password', async (req, res) => {
  const clientIp = getClientIp(req);
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor) {
      return res.status(401).json({ error: 'Sessão necessária para alterar a senha. Faça login novamente.' });
    }

    const { userId, currentPassword, newPassword } = req.body;
    const targetUserId = userId || actor.id;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const isSelf = actor.id === targetUserId;
    if (isSelf) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Informe sua senha atual para continuar.' });
      }
      const valid = verifyLoginPassword(targetUser.password, currentPassword);
      if (!valid) {
        return res.status(401).json({ error: 'A senha atual digitada está incorreta.' });
      }
    } else {
      if (!isPrivilegedUser(actor)) {
        return res.status(403).json({ error: 'Permissão negada. Apenas Administradores e Sócios podem alterar senhas de outros usuários.' });
      }
      if (actor.role === 'SOCIO' && targetUser.role === 'ADMIN') {
        return res.status(403).json({ error: 'Sócios não podem alterar a senha de administradores.' });
      }
    }

    const hashedPassword = bcrypt.hashSync(newPassword.trim(), 10);
    await prisma.user.update({
      where: { id: targetUserId },
      data: { password: hashedPassword },
    });

    await logAction(
      actor.id,
      actor.email,
      actor.name || actor.email,
      'ALTEROU_SENHA',
      'USUARIO',
      targetUser.id,
      {
        alvoEmail: targetUser.email,
        alvoNome: targetUser.name,
        alteradoPorAdmin: !isSelf,
      },
      clientIp
    );

    res.json({ success: true, message: 'Senha alterada com sucesso!' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro ao alterar a senha.' });
  }
});

// ========================
// 2. DASHBOARD METRICS & ROLLOVER ENGINE
// ========================

// Retorna a competência de referência (padrão: 1 mês antes da data atual no calendário, ex: Setembro quando estamos em Outubro)
function getTargetReferencePeriod(query: any): Date {
  if (query.referencePeriod) {
    const parsed = new Date(String(query.referencePeriod));
    if (!isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), 1));
    }
  }
  if (query.year && query.month) {
    const y = parseInt(String(query.year));
    const m = parseInt(String(query.month)) - 1;
    if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) {
      return new Date(Date.UTC(y, m, 1));
    }
  }
  return latestOpenPeriod();
}

const rolloverEngine = createRolloverEngine(prisma, undefined, pool);
const accountingEngine = createAccountingYearEngine(prisma, undefined, pool);
const syncMonthClosingsAndReplicate = rolloverEngine.sync;
registerCushman(app,prisma,{
  sync:syncMonthClosingsAndReplicate,
  encrypt:encryptPassword,
  decrypt:decryptPassword,
  pool,
  onCompanyUpdated: () => {
    invalidateAllDataCaches();
    broadcastRealtimeEvent('COMPANY_UPDATED', {});
  },
  onClosingUpdated: () => {
    invalidateDashboardCache();
    broadcastRealtimeEvent('CUSHMAN_CLOSING_UPDATED', {});
  },
});
let lastCompetenceBgSync = 0;
async function syncLatestCompetenceFromDb() {
  try {
    const maxClosing = await prisma.closing.findFirst({
      orderBy: { referencePeriod: 'desc' },
      select: { referencePeriod: true },
    });
    if (maxClosing?.referencePeriod) {
      setManualLatestPeriod(new Date(maxClosing.referencePeriod));
    }
  } catch (err) {
    console.error('Erro ao sincronizar competência do banco:', err);
  }
}

function triggerBackgroundRolloverCheck() {
  const now = Date.now();
  if (now - lastCompetenceBgSync < 5 * 60 * 1000) return;
  lastCompetenceBgSync = now;
  void syncLatestCompetenceFromDb();
  void rolloverEngine.ensureAutomatic();
  void accountingEngine.ensureAutomatic();
}

function requireOpenPeriod(period: Date, res: any): boolean {
  if (periodIsOpen(period)) return true;
  res.status(423).json({error:blockedPeriodMessage(period),code:'COMPETENCE_NOT_RELEASED',latestOpenPeriod:latestOpenPeriod()});
  return false;
}
app.get('/api/competences', async (_req, res) => {
  try {
    res.json({latestOpenPeriod:latestOpenPeriod(),timeZone:'America/Sao_Paulo',automatic:true});
    triggerBackgroundRolloverCheck();
  } catch(error) { console.error('Erro no calendário automático:',error); res.status(500).json({error:'Não foi possível sincronizar as competências.'}); }
});

// Logs endpoint
app.get('/api/logs', async (req, res) => {
  try {
    const { action, entity, userId, limit } = req.query;
    const where: any = {};
    if (action && typeof action === 'string') where.action = action;
    if (entity && typeof entity === 'string') where.entity = entity;
    if (userId && typeof userId === 'string') where.userId = userId;

    const take = limit ? Math.min(Number(limit) || 500, 5000) : 500;

    const logs = await prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take
    });
    res.json(logs);
  } catch (error) {
    console.error('Erro ao buscar logs:', error);
    res.status(500).json({ error: 'Erro ao buscar logs' });
  }
});

function sanitizeColumnsData(raw: any): Record<string, any> {
  const clean = { ...((raw && typeof raw === 'object' ? raw : {}) as Record<string, any>) };
  delete clean._legacy;
  return clean;
}

const sectorUsersCache = new Map<string, { ts: number; users: any[] }>();
function invalidateSectorUsersCache() {
  sectorUsersCache.clear();
}

async function getCachedBaseSectorUsers(sector: 'FISCAL' | 'DP' | 'CONTABIL'): Promise<any[]> {
  const now = Date.now();
  const hit = sectorUsersCache.get(sector);
  if (hit && now - hit.ts < 120_000) return hit.users;
  const baseUsers = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: sector as any },
        { role: 'ADMIN' as any },
        { role: 'SOCIO' as any },
        { role: 'CADASTRO' as any },
        {
          sectorPermissions: { some: { sector: sector as any, access: { in: ['EDIT', 'VIEW'] } } },
        },
        {
          responsibleAssignments: { some: { sector: sector as any } },
        },
      ],
    },
    select: { id: true, name: true, email: true, role: true, active: true },
    orderBy: { name: 'asc' },
  });
  sectorUsersCache.set(sector, { ts: now, users: baseUsers });
  return baseUsers;
}

async function getSectorResponsibleUsers(sector: 'FISCAL' | 'DP' | 'CONTABIL', companies: any[] = [], preloadedBaseUsers?: any[]) {
  const baseUsers = preloadedBaseUsers || await getCachedBaseSectorUsers(sector);

  const userMap = new Map<string, any>();
  for (const u of baseUsers) {
    if (!u.name && !u.email) continue;
    userMap.set(u.id, u);
  }
  for (const c of companies) {
    for (const r of (c.responsibles || [])) {
      if (r.sector !== sector) continue;
      if (r.user && !userMap.has(r.user.id)) {
        const isInactive = r.user.active === false;
        const baseName = (r.user.name || r.user.email || '').trim();
        userMap.set(r.user.id, {
          ...r.user,
          name: isInactive && baseName && !baseName.includes('(Inativo)') ? `${baseName} (Inativo)` : baseName,
          active: !isInactive,
        });
      }
    }
  }

  return Array.from(userMap.values()).sort((a, b) => {
    if ((a.active !== false) !== (b.active !== false)) return a.active !== false ? -1 : 1;
    return (a.name || a.email || '').localeCompare(b.name || b.email || '', 'pt-BR');
  });
}

// Fechamento contábil anual: mantém empresas que saíram dentro do ano histórico.
app.get('/api/accounting-closings', async (req,res)=>{
  try {
    const year=req.query.year===undefined?accountingYear():Number(req.query.year);
    if(!Number.isInteger(year)||year<1900||year>accountingYear())return res.status(400).json({error:'Ano contábil inválido ou ainda não liberado.'});
    const result=await accountingEngine.sync(year);
    const MONTH_NAMES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const columns=result.columns.filter((column:any)=>annualColumnActive(column,year)).map((col:any)=>{
      const match=String(col.columnKey||'').match(/^cont_mes_(\d{2})$/);
      if(match){
        const idx=Number(match[1])-1;
        if(idx>=0&&idx<12)return {...col,name:MONTH_NAMES_PT[idx]};
      }
      return col;
    });
    // Garante que o banco também fique com o nome correto para Janeiro
    prisma.departmentColumn.updateMany({
      where: { department: 'CONTABIL', columnKey: 'cont_mes_01', NOT: { name: 'Janeiro' } },
      data: { name: 'Janeiro' }
    }).catch(()=>{});
    const contabilCompanies = (result.companies || []).filter((c: any) => companyBelongsToSector(c, 'CONTABIL'));
    const map=new Map<string,any>(result.closings.map((closing:any)=>[closing.companyId,closing]));
    const rows=contabilCompanies.map((company:any)=>{
      const closing=map.get(company.id);const data=sanitizeColumnsData(annualValues(company,year,result.columns,closing?.columnsData||{}));
      for(const column of result.columns)if(column.inputType==='PASSWORD'){const key=resolveColumnKey(column)||column.id;if(data[key])data[key]=decryptPassword(data[key]);}
      if ((!data.cont_observacao || data.cont_observacao === '') && (company.notesScope === 'CONTABIL' || company.notesScope === 'GERAL' || !company.notesScope)) {
        data.cont_observacao = company.notes || '';
      }
      return {company:{...company,code:formatCompanyCode(company.code)||null,certificatePasswordDecrypted:decryptPassword(company.certificatePassword),ginfessPasswordDecrypted:decryptPassword(company.ginfessPassword),gissOnlinePasswordDecrypted:decryptPassword(company.gissOnlinePassword),sdPasswordDecrypted:decryptPassword(company.sdPassword),nfPasswordDecrypted:decryptPassword(company.nfPassword)},closingId:closing?.id,columnsData:data,...accountingProgress(company,year,result.columns,data)};
    });
    const users=await getSectorResponsibleUsers('CONTABIL',contabilCompanies);
    res.json({accountingApiVersion:ACCOUNTING_API_VERSION,year,latestYear:accountingYear(),rows,columns,users,configured:result.columns.some((column:any)=>column.columnKey?.startsWith('cont_'))});
  }catch(error){console.error('Erro no Contábil anual:',error);res.status(500).json({error:'Não foi possível carregar o Contábil anual.'});}
});
async function saveAccountingColumn(existing:any,columnKey:string,columnValue:any,res:any,req?:any){
  const year=new Date(existing.referencePeriod).getUTCFullYear();
  if(new Date(existing.referencePeriod).getUTCMonth()!==0)return res.status(400).json({error:'Este registro antigo é mensal. Use a tela Contábil anual.'});
  if(year>accountingYear())return res.status(423).json({error:'Este ano contábil ainda não foi liberado.'});
  const company=await prisma.company.findUnique({where:{id:existing.companyId},include:{responsibles:true}});
  if(req){
    const actor=await resolveAuthenticatedUser(prisma,req);
    if(actor&&!canUserEditCompany(actor,company,'CONTABIL')){
      return res.status(403).json({error:'Você só pode editar fechamentos das empresas sob sua responsabilidade no Contábil.'});
    }
  }
  const columns=await prisma.departmentColumn.findMany({where:{department:'CONTABIL'}});
  const column=columns.find((item:any)=>(resolveColumnKey(item)||item.id)===columnKey);
  if(!column||!annualColumnActive(column,year))return res.status(400).json({error:'Coluna indisponível neste ano.'});
  const values=annualValues(company,year,columns,existing.columnsData||{});
  const month=accountingMonth(column);
  if(month){
    if(values[columnKey]==='Não é cliente')return res.status(403).json({error:'Não é cliente é definido automaticamente pelas datas da empresa.'});
    if(!requireOpenPeriod(new Date(Date.UTC(year,month-1,1)),res))return;
  }
  const error=validatePayrollValue(column,columnValue);if(error)return res.status(400).json({error});
  const stored={...(existing.columnsData||{}),[columnKey]:column.inputType==='PASSWORD'?(encryptPassword(columnValue)||''):columnValue};
  const projected=sanitizeColumnsData(annualValues(company,year,columns,stored));const progress=accountingProgress(company,year,columns,projected);
  const updated=await prisma.closing.update({where:{id:existing.id},data:{columnsData:stored,status:progress.calculatedStatus}});
  for(const item of columns)if(item.inputType==='PASSWORD'){const key=resolveColumnKey(item)||item.id;if(projected[key])projected[key]=decryptPassword(projected[key]);}
  broadcastRealtimeEvent('CLOSING_UPDATED', {
    closingId: updated.id,
    companyId: existing.companyId,
    sector: 'CONTABIL',
    columnKey,
    columnValue,
    columnsData: projected,
    calculatedStatus: progress.calculatedStatus,
    progress,
    updatedAt: updated.updatedAt,
  });
  return res.json({success:true,closing:{...updated,columnsData:projected},...progress});
}

// Endpoint explícito de virada de mês / replicação (manual ou automática)
app.post('/api/closings/rollover', async (req, res) => {
  try {
    const target = getTargetReferencePeriod(req.body);
    const isManual = Boolean(req.body.manual || req.body.force);
    if (isManual) {
      setManualLatestPeriod(target);
    } else {
      if (!requireOpenPeriod(target, res)) return;
    }
    await rolloverEngine.ensureAutomatic();
    await accountingEngine.ensureAutomatic();
    const result = await syncMonthClosingsAndReplicate(target, isManual);
    setManualLatestPeriod(target);
    await syncAllFutureClosingsWithAnteriorReplicables(prisma, pool);

    const monthLabel = target.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    res.json({
      success: true,
      referencePeriod: target,
      monthLabel,
      createdCount: result.createdCount,
      replicatedColsCount: result.replicatedColsCount,
      latestOpenPeriod: latestOpenPeriod(),
      message: `Competência de ${monthLabel} aberta com sucesso! ${result.createdCount} fechamentos gerados com replicação de colunas ativas.`,
    });
  } catch (error: any) {
    console.error('Erro na abertura da competência:', error);
    res.status(500).json({ error: error.message || 'Erro ao executar abertura de competência e replicação de colunas' });
  }
});

// ========================
// FECHAMENTO FISCAL & OPERACIONAL (TABELA COMPLETA COM 8 OBRIGAÇÕES)
// ========================
app.get('/api/closings', async (req, res) => {
  try {
    const sector = (req.query.sector as string) || 'FISCAL';
    if(sector==='CUSHMAN')return res.status(400).json({error:'Use a tela autenticada Cushman e a rota /api/cushman-closings.'});
    if(sector==='CONTABIL')return res.status(400).json({error:'O Contábil usa a tela anual e a rota /api/accounting-closings.'});
    const monthStart = getTargetReferencePeriod(req.query);
    if (!requireOpenPeriod(monthStart, res)) return;
    const y = monthStart.getUTCFullYear();
    const m = monthStart.getUTCMonth();
    const nextMonthStart = new Date(Date.UTC(y, m + 1, 1));
    const prevMonthStart = new Date(Date.UTC(y, m - 1, 1));
    const openLatest = latestOpenPeriod();

    triggerBackgroundRolloverCheck();

    const sectorCondition = {
      OR: [
        { activeSectors: null },
        { activeSectors: 'TODOS' },
        { activeSectors: '' },
        { activeSectors: { contains: sector } },
      ],
    };

    const activeWhere = {
      AND: [
        externalCompaniesExcluded,
        companyExitWhere(monthStart),
        sectorCondition,
      ],
      OR: [
        { obligationStartDate: { lt: nextMonthStart }, OR: [{ exitDate: null }, { exitDate: { gte: monthStart } }] },
        { closings: { some: { type: sector as any, referencePeriod: monthStart } } },
      ],
    };

    let [companies, closings, allColumns, distinctPeriods, baseSectorUsers, fiscalReinfMap, appCfg] = await Promise.all([
      prisma.company.findMany({
        where: activeWhere,
        omit: { legacyData: true },
        include: {
          responsibles: {
            where: { sector: sector as any },
            include: {
              user: { select: { id: true, name: true, email: true, role: true, active: true } },
            },
          },
        },
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
      }),
      queryClosingsBySectorAndRange(pool, prisma, sector, monthStart, nextMonthStart),
      cachedDepartmentColumns(),
      cachedDistinctPeriods(),
      getCachedBaseSectorUsers(sector as 'FISCAL' | 'DP'),
      sector === 'DP' ? queryFiscalReinfMap(pool, prisma, monthStart, nextMonthStart) : Promise.resolve(new Map<string, any>()),
      getAppConfigPayload(),
    ]);

    companies = companies.filter((c: any) => companyBelongsToSector(c, sector as any));

    if (closings.length === 0) {
      await syncMonthClosingsAndReplicate(monthStart);
      closings = await queryClosingsBySectorAndRange(pool, prisma, sector, monthStart, nextMonthStart);
    } else {
      void syncMonthClosingsAndReplicate(monthStart);
    }

    const configuredColumns = (allColumns || [])
      .filter((col: any) => col.department === sector)
      .sort((a: any, b: any) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    const fiscalUsers = await getSectorResponsibleUsers(sector as 'FISCAL' | 'DP', companies, baseSectorUsers);

    const closingMap = new Map<string, any>(closings.map((c: any) => [c.companyId, c]));
    const activeColumns = configuredColumns.filter((col: any) => isColumnActive(col, monthStart));
    const progressColumns = configuredColumns.length ? activeColumns.filter((col: any) => col.countsProgress) : Object.keys(FISCAL_POPUPS).map(columnKey => ({ columnKey, inputType: 'POPUP' }));
    const replicatingCols = activeColumns.filter((col: any) => col.replicates);

    const missingCompanies = companies.filter((c: any) => !closingMap.has(c.id));
    const companiesNeedingFallbackIds = new Set<string>(missingCompanies.map((c: any) => c.id));
    // Busca fallback de colunas replicáveis quando ausentes no fechamento (mesmo se o mês já tiver sido criado)
    if (replicatingCols.length > 0) {
      for (const c of companies) {
        const cl = closingMap.get(c.id);
        if (!cl) continue;
        const cData = (cl.columnsData as Record<string, any>) || {};
        for (const col of replicatingCols) {
          const key = resolveColumnKey(col) || col.id;
          if (cData[key] === undefined || cData[key] === null || cData[key] === '') {
            companiesNeedingFallbackIds.add(c.id);
            break;
          }
        }
      }
    }

    const latestByCompany = new Map<string, Record<string, any>>();
    if (companiesNeedingFallbackIds.size > 0) {
      const p1 = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
      const p2 = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 2, 1));
      const p3 = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 3, 1));
      const refPeriods = Array.from(new Set([p1, p2, p3, openLatest].filter(p => p.getTime() !== monthStart.getTime())));
      const refClosings = await queryFallbackClosingsForPeriods(
        pool,
        prisma,
        sector,
        refPeriods,
        Array.from(companiesNeedingFallbackIds)
      );
      for (const rc of refClosings) {
        if (!rc.columnsData || typeof rc.columnsData !== 'object') continue;
        const prev = latestByCompany.get(rc.companyId) || {};
        for (const [k, v] of Object.entries(rc.columnsData as Record<string, any>)) {
          if (k === '_legacy') continue;
          if (prev[k] === undefined && v !== undefined && v !== null && v !== '') {
            prev[k] = v;
          }
        }
        latestByCompany.set(rc.companyId, prev);
      }
    }

    if (missingCompanies.length > 0) {
      const toCreate = missingCompanies.map((comp: any) => {
        const refData = latestByCompany.get(comp.id) || {};
        let seeded = replicatedData(configuredColumns, refData, {}, monthStart);
        if (sector === 'FISCAL') seeded = applyFiscalRegimeRules(comp.taxRegime, seeded);
        const prog = calculateColumnProgress(progressColumns, seeded, col => resolveColumnKey(col) || col.columnKey || col.id);
        const dashboardMetrics = sector === 'DP' && seeded.dp_qtde_funcionarios !== undefined
          ? { employees: Number(seeded.dp_qtde_funcionarios) || 0 }
          : undefined;
        return {
          companyId: comp.id,
          type: sector as any,
          referencePeriod: monthStart,
          status: prog.calculatedStatus as any,
          columnsData: seeded,
          ...(dashboardMetrics ? { dashboardMetrics } : {}),
        };
      });
      await prisma.closing.createMany({ data: toCreate, skipDuplicates: true });
      const createdClosings = await queryClosingsBySectorAndRange(
        pool,
        prisma,
        sector,
        monthStart,
        nextMonthStart,
        { companyIds: missingCompanies.map((c: any) => c.id) }
      );
      for (const cl of createdClosings) closingMap.set(cl.companyId, cl);
    }

    const reinfColumn = sector === 'DP'
      ? (allColumns || []).find((col: any) => col.department === 'FISCAL' && (col.columnKey === 'reinf' || /^reinf$/i.test(col.name || ''))) || null
      : null;
    const rows = companies.map((c: any) => {
      const closing = closingMap.get(c.id) || null;
      let columnsData = sanitizeColumnsData(closing?.columnsData);
      if (replicatingCols.length > 0) {
        const fallback = latestByCompany.get(c.id);
        for (const col of replicatingCols) {
          const key = resolveColumnKey(col) || col.id;
          if (columnsData[key] === undefined || columnsData[key] === null || columnsData[key] === '') {
            if (fallback && fallback[key] !== undefined && fallback[key] !== null && fallback[key] !== '') {
              columnsData[key] = fallback[key];
            } else if (/dissidio/i.test(col.name || '') && c.dissidioMonthYear) {
              columnsData[key] = c.dissidioMonthYear;
            }
          }
        }
      }
      if (sector === 'FISCAL') {
        columnsData = applyFiscalRegimeRules(c.taxRegime, columnsData);
        for (const column of configuredColumns) {
          const key = resolveColumnKey(column) || column.id;
          if (column.inputType === 'PASSWORD' && typeof columnsData[key] === 'string' && columnsData[key]) columnsData[key] = decryptPassword(columnsData[key]) ?? columnsData[key];
        }
      }
      if (sector === 'DP') {
        for (const column of configuredColumns) {
          const key = resolveColumnKey(column) || column.id;
          if (column.inputType === 'PASSWORD' && columnsData[key]) columnsData[key] = decryptPassword(columnsData[key]);
        }
        if (columnsData.dp_qtde_funcionarios === undefined && closing?.dashboardMetrics?.employees !== undefined) columnsData.dp_qtde_funcionarios = Number(closing.dashboardMetrics.employees);
        if ((!columnsData.dp_observacao || columnsData.dp_observacao === '') && (c.notesScope === 'DP' || c.notesScope === 'GERAL' || !c.notesScope)) columnsData.dp_observacao = c.notes || '';
      }

      const progress = calculateColumnProgress(progressColumns, columnsData, col => resolveColumnKey(col) || col.columnKey || col.id);
      const {calculatedStatus, progressPercent: percent} = progress;

      return {
        ...(sector === 'DP' ? { fiscalReinf: fiscalReinfMap.get(c.id) || null } : {}),
        company: {
          ...c,
          code: formatCompanyCode(c.code) || null,
          certificatePasswordDecrypted: decryptPassword(c.certificatePassword),
          ginfessPasswordDecrypted: decryptPassword(c.ginfessPassword),
          gissOnlinePasswordDecrypted: decryptPassword(c.gissOnlinePassword),
          sdPasswordDecrypted: decryptPassword(c.sdPassword),
          nfPasswordDecrypted: decryptPassword(c.nfPassword),
        },
        closingId: closing?.id || null,
        closingStatus: closing?.status || calculatedStatus,
        ...progress,
        progressPercent: percent,
        columnsData,
        dashboardMetrics: closing?.dashboardMetrics || null,
        updatedAt: closing?.updatedAt || null,
      };
    });

    const seenMonths = new Set<string>();
    const availableMonths: any[] = [];
    for (const p of (distinctPeriods || [])) {
      const d = new Date(p.referencePeriod);
      if (!periodIsOpen(d)) continue;
      const yr = d.getUTCFullYear();
      const mo = d.getUTCMonth();
      const key = `${yr}-${mo}`;
      if (!seenMonths.has(key)) {
        seenMonths.add(key);
        availableMonths.push({
          year: yr,
          month: mo + 1,
          label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          iso: new Date(Date.UTC(yr, mo, 1)).toISOString(),
        });
      }
    }

    const totalCompanies = rows.length;
    const completedCount = rows.filter((r: any) => r.calculatedStatus === 'COMPLETED').length;
    const inProgressCount = rows.filter((r: any) => r.calculatedStatus === 'IN_PROGRESS').length;
    const pendingCount = totalCompanies - completedCount - inProgressCount;
    const progressTotal = rows.reduce((sum: number, row: any) => sum + row.progressTotal, 0);
    const progressDone = rows.reduce((sum: number, row: any) => sum + row.progressDone, 0);
    const overallPercent = progressTotal ? Math.round(progressDone / progressTotal * 100) : 0;

    res.json({
      sector,
      referencePeriod: monthStart,
      rows,
      fiscalUsers,
      popupColumns: configuredColumns.length ? activeColumns.map((col: any) => ({ ...col, columnKey: resolveColumnKey(col) || col.id })) : Object.entries(FISCAL_POPUPS).map(([columnKey, config]) => ({ columnKey, name: config.title.replace('Detalhes ', ''), isEditable: true })),
      availableMonths,
      ...(sector === 'FISCAL' ? { fiscalRegimeRules: appCfg.fiscalRegimeRules } : {}),
      ...(sector === 'DP' ? { payrollApiVersion: PAYROLL_API_VERSION, payrollConfigured: configuredColumns.some((col: any) => col.columnKey?.startsWith('dp_')), payrollColumns: activeColumns.map((col: any) => ({ ...col, columnKey: resolveColumnKey(col) || col.id })), reinfDefinition: effectivePopup(reinfColumn, 'reinf') } : {}),
      summary: {
        total: totalCompanies,
        completed: completedCount,
        inProgress: inProgressCount,
        pending: pendingCount,
        overallPercent,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar fechamentos:', error);
    res.status(500).json({ error: 'Erro ao buscar dados de fechamento' });
  }
});

// Atualizar valor de uma obrigação específica do fechamento
app.put('/api/closings/:id/column', async (req, res) => {
  try {
    const { id } = req.params;
    const { columnKey, columnValue } = req.body;

    if (!columnKey) {
      return res.status(400).json({ error: 'columnKey é obrigatório' });
    }

    const existing = await prisma.closing.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Fechamento não encontrado' });
    }

    if(existing.type==='CUSHMAN')return res.status(400).json({error:'Use a edição autenticada da tela Cushman.'});
    if(existing.type==='CONTABIL')return await saveAccountingColumn(existing,columnKey,columnValue,res,req);
    if (!requireOpenPeriod(new Date(existing.referencePeriod), res)) return;
    const [closingCompany, allCols, actor] = await Promise.all([
      prisma.company.findUnique({ where: { id: existing.companyId }, include: { responsibles: true } }),
      cachedDepartmentColumns(),
      resolveAuthenticatedUser(prisma, req),
    ]);
    if (!closingCompany || !companyExitAllowsPeriod(closingCompany, new Date(existing.referencePeriod))) return res.status(403).json({error:'A empresa não tem obrigações nesta competência conforme sua saída.'});
    if (actor && !canUserEditCompany(actor, closingCompany, existing.type as any)) {
      return res.status(403).json({ error: 'Você só pode editar fechamentos das empresas em que é responsável.' });
    }

    const configuredColumns = (allCols || [])
      .filter((col: any) => col.department === existing.type)
      .sort((a: any, b: any) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    const sectorColumns = configuredColumns;
    const popupColumn = sectorColumns.find((col: any) => (resolveColumnKey(col) || col.id) === columnKey);
    if (existing.type === 'DP') {
      if (!popupColumn) return res.status(400).json({ error: 'Coluna DP não configurada.' });
      const error = validatePayrollValue(popupColumn, columnValue);
      if (error) return res.status(400).json({ error });
    }
    if (popupColumn && !isColumnActive(popupColumn, new Date(existing.referencePeriod))) return res.status(400).json({ error: 'Esta coluna não está disponível nesta competência.' });
    if (popupColumn?.isEditable === false) return res.status(403).json({ error: 'Esta coluna está configurada como somente leitura.' });
    if (popupColumn?.inputType === 'POPUP' && columnValue?.status === 'CONCLUIDO') {
      const missing = effectivePopup(popupColumn, columnKey).fields.find(f => f.required && !String(columnValue.data?.[f.key] ?? '').trim());
      if (missing) return res.status(400).json({ error: `Preencha o campo: ${missing.label}` });
    }
    const currentData = (existing.columnsData as Record<string, any>) || {};
    const updatedData: Record<string, any> = {
      ...currentData,
      [columnKey]: popupColumn?.inputType === 'PASSWORD' ? (encryptPassword(columnValue) || '') : columnValue,
    };

    const activeColumns = configuredColumns.filter((col: any) => isColumnActive(col, new Date(existing.referencePeriod)));
    const progressColumns = configuredColumns.length ? activeColumns.filter((col: any) => col.countsProgress) : Object.keys(FISCAL_POPUPS).map(columnKey => ({ columnKey, inputType: 'POPUP' }));
    const progress = calculateColumnProgress(progressColumns, updatedData, col => resolveColumnKey(col) || col.columnKey || col.id);
    const nextStatus = progress.calculatedStatus;

    const updated = await prisma.closing.update({
      where: { id },
      data: {
        columnsData: updatedData,
        status: nextStatus as any,
        ...(existing.type === 'DP' && columnKey === 'dp_qtde_funcionarios' ? { dashboardMetrics: { ...(existing.dashboardMetrics || {}), employees: columnValue === '' || columnValue === null ? 0 : Number(columnValue) } } : {}),
      },
    });

    // Cascata automática progressiva: se a coluna for replicável, propaga o valor para todas as competências futuras já geradas
    if (isColumnReplicable(popupColumn, columnKey, columnValue)) {
      void propagateReplicableColumnToFutureMonths({
        prisma,
        companyId: existing.companyId,
        sector: existing.type,
        fromPeriod: new Date(existing.referencePeriod),
        columnKey,
        storedValue: updatedData[columnKey],
        columnDef: popupColumn,
        companyTaxRegime: closingCompany?.taxRegime,
        onClosingUpdated: (fc, nextData, fcProg) => {
          const resp = sanitizeColumnsData(nextData);
          broadcastRealtimeEvent('CLOSING_UPDATED', {
            closingId: fc.id,
            companyId: existing.companyId,
            sector: existing.type,
            columnKey,
            columnValue,
            columnsData: resp,
            calculatedStatus: fcProg.calculatedStatus,
            updatedAt: fc.updatedAt,
          });
        }
      }).catch(err => console.error('Erro na propagação para meses futuros:', err));
    }

    if (req.body.userId) {
      void logAction(
        req.body.userId,
        req.body.userEmail || '',
        req.body.userName || 'Sistema',
        'ATUALIZOU_OBRIGACAO',
        existing.type,
        existing.companyId,
        {
          companyCode: closingCompany?.code || null,
          companyName: closingCompany?.name || null,
          columnKey,
          oldValue: currentData[columnKey],
          newValue: columnValue,
          status: nextStatus
        },
        req.ip
      );
    }

    const responseColumnsData = sanitizeColumnsData(updated.columnsData);
    if (existing.type === 'DP') {
      for (const column of sectorColumns) {
        const key = resolveColumnKey(column) || column.id;
        if (column.inputType === 'PASSWORD' && responseColumnsData[key]) responseColumnsData[key] = decryptPassword(responseColumnsData[key]);
      }
      if (popupColumn && /dissidio/i.test(popupColumn.name || '') && typeof columnValue === 'string') {
        invalidateCompaniesCache();
        void prisma.company.update({
          where: { id: existing.companyId },
          data: { dissidioMonthYear: columnValue.trim() || null },
        }).catch(() => {});
      }
    }
    invalidateDashboardCache();
    broadcastRealtimeEvent('CLOSING_UPDATED', {
      closingId: updated.id,
      companyId: existing.companyId,
      sector: existing.type,
      columnKey,
      columnValue,
      columnsData: responseColumnsData,
      calculatedStatus: nextStatus,
      progress,
      updatedAt: updated.updatedAt,
    });
    res.json({
      success: true,
      closing: { ...updated, columnsData: responseColumnsData },
      ...progress,
    });
  } catch (error) {
    console.error('Erro ao atualizar coluna do fechamento:', error);
    res.status(500).json({ error: 'Erro ao salvar alteração da coluna' });
  }
});

// Executar ações em massa em fechamentos (concluir, marcar N/A, pendência ou limpar em lote)
app.post('/api/closings/bulk-action', async (req, res) => {
  try {
    const { closingIds, columnKey, action, date, pendencyReason } = req.body;
    if (!Array.isArray(closingIds) || !closingIds.length) {
      return res.status(400).json({ error: 'Nenhum fechamento selecionado para a ação em massa.' });
    }
    if (!columnKey) {
      return res.status(400).json({ error: 'Obrigação (columnKey) não informada.' });
    }
    if (!['CONCLUIDO', 'NA', 'PENDENCIA', 'CLEAR'].includes(action)) {
      return res.status(400).json({ error: 'Ação em massa inválida.' });
    }

    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || actor.active === false) {
      return res.status(401).json({ error: 'Sessão expirada. Saia e entre novamente.' });
    }

    const [closings, allCols] = await Promise.all([
      prisma.closing.findMany({
        where: { id: { in: closingIds } },
        include: { company: { include: { responsibles: true } } }
      }),
      cachedDepartmentColumns()
    ]);

    if (!closings.length) {
      return res.status(404).json({ error: 'Nenhum fechamento encontrado.' });
    }

    const updatedResults: any[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const closing of closings) {
      const company = closing.company;
      const period = new Date(closing.referencePeriod);

      if (!periodIsOpen(period)) {
        skipped.push({ id: closing.id, reason: 'Competência fechada' });
        continue;
      }
      if (!company || !companyExitAllowsPeriod(company, period)) {
        skipped.push({ id: closing.id, reason: 'Empresa sem obrigações na competência' });
        continue;
      }
      if (!canUserEditCompany(actor, company, closing.type as any)) {
        skipped.push({ id: closing.id, reason: 'Sem permissão de edição nesta empresa' });
        continue;
      }

      const configuredColumns = (allCols || [])
        .filter((col: any) => col.department === closing.type)
        .sort((a: any, b: any) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      const targetColumn = configuredColumns.find((col: any) => (resolveColumnKey(col) || col.columnKey || col.id) === columnKey);

      if (!targetColumn || !isColumnActive(targetColumn, period)) {
        skipped.push({ id: closing.id, reason: 'Coluna não ativa nesta competência' });
        continue;
      }
      if (targetColumn.isEditable === false || targetColumn.inputType === 'READONLY') {
        skipped.push({ id: closing.id, reason: 'Coluna somente leitura' });
        continue;
      }

      // Determinar o valor a gravar conforme o tipo da coluna e a ação
      let columnValue: any = null;
      const todayIso = new Date().toISOString();
      const completionDate = date || todayIso;

      if (action === 'CONCLUIDO') {
        if (targetColumn.inputType === 'POPUP') {
          const existingData = closing.columnsData?.[columnKey]?.data || {};
          columnValue = {
            status: 'CONCLUIDO',
            completionDate,
            data: { ...existingData, dataConclusao: completionDate }
          };
        } else if (targetColumn.inputType === 'CHECKBOX') {
          columnValue = true;
        } else {
          columnValue = completionDate;
        }
      } else if (action === 'NA') {
        if (targetColumn.inputType === 'POPUP') {
          columnValue = { status: 'N/A', data: {} };
        } else {
          columnValue = 'N/A';
        }
      } else if (action === 'PENDENCIA') {
        const reason = pendencyReason?.trim() || 'Pendência registrada em lote';
        if (targetColumn.inputType === 'POPUP') {
          columnValue = {
            status: 'PENDENCIA',
            pendingReason: reason,
            data: { motivo: reason }
          };
        } else {
          columnValue = 'PENDÊNCIA';
        }
      } else if (action === 'CLEAR') {
        if (targetColumn.inputType === 'POPUP') {
          columnValue = { status: 'PENDENTE', data: {} };
        } else {
          columnValue = null;
        }
      }

      const currentData = (closing.columnsData as Record<string, any>) || {};
      const updatedData: Record<string, any> = { ...currentData };
      if (action === 'CLEAR' && targetColumn.inputType !== 'POPUP') {
        delete updatedData[columnKey];
      } else {
        updatedData[columnKey] = columnValue;
      }

      const activeColumns = configuredColumns.filter((col: any) => isColumnActive(col, period));
      const progressColumns = configuredColumns.length ? activeColumns.filter((col: any) => col.countsProgress) : Object.keys(FISCAL_POPUPS).map(k => ({ columnKey: k, inputType: 'POPUP' }));
      const progress = calculateColumnProgress(progressColumns, updatedData, col => resolveColumnKey(col) || col.columnKey || col.id);
      const nextStatus = progress.calculatedStatus;

      const updated = await prisma.closing.update({
        where: { id: closing.id },
        data: {
          columnsData: updatedData,
          status: nextStatus as any,
          ...(closing.type === 'DP' && columnKey === 'dp_qtde_funcionarios' ? { dashboardMetrics: { ...(closing.dashboardMetrics || {}), employees: columnValue === '' || columnValue === null ? 0 : Number(columnValue) } } : {})
        }
      });

      // Propagação progressiva em lote para meses futuros
      if (isColumnReplicable(targetColumn, columnKey, columnValue)) {
        void propagateReplicableColumnToFutureMonths({
          prisma,
          companyId: closing.companyId,
          sector: closing.type,
          fromPeriod: new Date(closing.referencePeriod),
          columnKey,
          storedValue: updatedData[columnKey],
          columnDef: targetColumn,
          companyTaxRegime: company.taxRegime,
          onClosingUpdated: (fc, nextData, fcProg) => {
            broadcastRealtimeEvent('CLOSING_UPDATED', {
              closingId: fc.id,
              companyId: closing.companyId,
              sector: closing.type,
              columnKey,
              columnValue,
              columnsData: sanitizeColumnsData(nextData),
              calculatedStatus: fcProg.calculatedStatus,
              updatedAt: fc.updatedAt,
            });
          }
        }).catch(err => console.error('Erro na propagação de ação em massa para meses futuros:', err));
      }

      void logAction(
        actor.id,
        actor.email,
        actor.name,
        'BULK_ACTION_OBRIGACAO',
        closing.type,
        closing.companyId,
        {
          companyCode: company.code,
          companyName: company.name,
          columnKey,
          action,
          status: nextStatus
        },
        req.ip
      );

      const responseData = sanitizeColumnsData(updated.columnsData);
      const prog = progress as any;
      updatedResults.push({
        id: updated.id,
        columnsData: responseData,
        calculatedStatus: nextStatus,
        progressPercent: prog.progressPercent ?? 0,
        completedCount: prog.progressDone ?? 0,
        totalProgressCount: prog.progressTotal ?? 0,
        progressDone: prog.progressDone ?? 0,
        progressTotal: prog.progressTotal ?? 0
      });
    }

    if (updatedResults.length > 0) {
      invalidateDashboardCache();
      broadcastRealtimeEvent('CLOSINGS_BULK_UPDATED', {
        items: updatedResults,
        columnKey,
        action,
      });
    }

    res.json({
      success: true,
      totalRequested: closingIds.length,
      updatedCount: updatedResults.length,
      skippedCount: skipped.length,
      skipped,
      updatedResults,
      message: `${updatedResults.length} empresa(s) atualizada(s) com sucesso em lote!`
    });
  } catch (error: any) {
    console.error('Erro ao executar ação em massa:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar ação em massa.' });
  }
});
app.put('/api/companies/:id/responsible', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, sector = 'FISCAL', actorId, actorEmail, actorName } = req.body;

    const [company, newUser, actor] = await Promise.all([
      prisma.company.findUnique({ where: { id }, select: { id: true, code: true, name: true, responsibles: true } }),
      userId ? prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, active: true } }) : null,
      resolveAuthenticatedUser(prisma, req),
    ]);

    if (actor && !canUserEditCompany(actor, company, sector as any)) {
      return res.status(403).json({ error: 'Você só pode alterar o responsável das empresas sob sua permissão de edição.' });
    }

    if (userId && !newUser?.active) {
      return res.status(400).json({ error: 'Selecione um usuário ativo para ser responsável.' });
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.companyResponsible.deleteMany({ where: { companyId: id, sector: sector as any } });
      if (userId) await tx.companyResponsible.create({ data: { companyId: id, userId, sector: sector as any } });
    });

    // Registra no Log de Auditoria em background
    void logAction(
      actorId || req.body.userId || null,
      actorEmail || req.body.userEmail || null,
      actorName || req.body.userName || 'Sistema',
      'ATUALIZOU_RESPONSAVEL',
      sector,
      id,
      {
        companyCode: company?.code || null,
        companyName: company?.name || null,
        sector,
        responsibleId: userId || null,
        responsibleName: newUser?.name || newUser?.email || 'Nenhum (Removido)',
      },
      req.ip
    );

    invalidateAllDataCaches();
    res.json({ success: true, message: 'Responsável atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar responsável:', error);
    res.status(500).json({ error: 'Erro ao salvar responsável' });
  }
});

// Atualizar observações da empresa (específicas ou gerais)
app.put('/api/companies/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, notesScope = 'FISCAL' } = req.body;

    const actor = await resolveAuthenticatedUser(prisma, req);
    if (actor) {
      const targetComp = await prisma.company.findUnique({ where: { id }, include: { responsibles: true } });
      const checkSector = ['FISCAL', 'DP', 'CONTABIL', 'CUSHMAN'].includes(notesScope) ? (notesScope as any) : null;
      if (targetComp && !canUserEditCompany(actor, targetComp, checkSector)) {
        return res.status(403).json({ error: 'Você só pode editar observações das empresas sob sua responsabilidade.' });
      }
    }

    const updated = await prisma.company.update({
      where: { id },
      data: {
        notes: notes !== undefined ? notes : null,
        notesScope: notesScope || 'FISCAL',
      },
    });

    invalidateCompaniesCache();
    broadcastRealtimeEvent('COMPANY_NOTES_UPDATED', {
      companyId: id,
      notes,
      notesScope: notesScope || 'FISCAL',
    });
    res.json({ success: true, company: updated });
  } catch (error) {
    console.error('Erro ao salvar observações:', error);
    res.status(500).json({ error: 'Erro ao salvar observações' });
  }
});

const dashboardCache = new Map<string, { timestamp: number; payload: any }>();
const dashboardInFlight = new Map<string, Promise<any>>();
let companiesCache: { ts: number; data: any[] } | null = null;
let cachedPeriodsList: any[] | null = null;
let cachedPeriodsTimestamp = 0;
let cachedColsList: any[] | null = null;
let cachedColsTimestamp = 0;

function invalidateCompaniesCache() {
  companiesCache = null;
  invalidateCompanyQualityCache();
}

function invalidateDashboardCache() {
  dashboardCache.clear();
  cachedPeriodsList = null;
  cachedColsList = null;
  invalidateAnalyticsCache();
  invalidateRiskRadarCache();
}

function invalidateAllDataCaches() {
  invalidateCompaniesCache();
  invalidateDashboardCache();
  invalidateSectorUsersCache();
  invalidateAuthUserCache();
  try {
    if (accountingEngine && typeof (accountingEngine as any).invalidateCache === 'function') {
      (accountingEngine as any).invalidateCache();
    }
  } catch {}
}

async function cachedDistinctPeriods(): Promise<any[]> {
  const now = Date.now();
  if (cachedPeriodsList && now - cachedPeriodsTimestamp < 10 * 60 * 1000) {
    return cachedPeriodsList;
  }
  cachedPeriodsList = await prisma.closing.findMany({
    select: { referencePeriod: true },
    distinct: ['referencePeriod'],
    orderBy: { referencePeriod: 'asc' },
  });
  cachedPeriodsTimestamp = now;
  return cachedPeriodsList || [];
}

async function cachedDepartmentColumns(): Promise<any[]> {
  const now = Date.now();
  if (cachedColsList && now - cachedColsTimestamp < 5 * 60 * 1000) {
    return cachedColsList;
  }
  cachedColsList = await prisma.departmentColumn.findMany();
  cachedColsTimestamp = now;
  return cachedColsList || [];
}

async function computeDashboardPayload(monthStart: Date, userId?: string): Promise<any> {
  const cacheKey = `${monthStart.toISOString().slice(0, 7)}:${userId || 'all'}`;
  const existingFlight = dashboardInFlight.get(cacheKey);
  if (existingFlight) return existingFlight;

  const task = (async () => {
    const y = monthStart.getUTCFullYear();
    const m = monthStart.getUTCMonth();
    const nextMonthStart = new Date(Date.UTC(y, m + 1, 1));
    const annualStart = new Date(Date.UTC(y, 0, 1));

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
              type: { not: 'CONTABIL' },
              referencePeriod: { gte: monthStart, lt: nextMonthStart },
            },
          },
        },
      ],
    };

    if (Object.keys(userFilter).length > 0) {
      activeWhere.AND.push(userFilter);
    }

    const [companies, allColumns, distinctPeriods, rawClosings, installmentPlans, installmentSetting] = await Promise.all([
      prisma.company.findMany({
        where: activeWhere,
        select: {
          id: true,
          name: true,
          cnpj: true,
          taxRegime: true,
          contractDate: true,
          obligationStartDate: true,
          exitDate: true,
          activeSectors: true,
          responsibles: {
            select: {
              id: true,
              sector: true,
              userId: true,
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      cachedDepartmentColumns(),
      cachedDistinctPeriods(),
      queryClosingsForDashboard(pool, prisma, monthStart, nextMonthStart, annualStart),
      prisma.installmentPlan.findMany({
        include: { payments: true },
      }).catch(() => []),
      prisma.installmentSetting.findUnique({ where: { id: 'global' } }).catch(() => null),
      getAppConfigPayload(),
    ]);

    const companyMap = new Map<string, any>(companies.map((c: any) => [c.id, c]));
    const totalCompanies = companies.length;
    const closings = rawClosings.filter((c: any) => companyMap.has(c.companyId));

    const regimesMap: Record<string, number> = {};
    for (const c of companies) {
      if (c.taxRegime) {
        regimesMap[c.taxRegime] = (regimesMap[c.taxRegime] || 0) + 1;
      }
    }

    const toItem = (c: any, date: Date) => ({ id: c.id, name: c.name, taxRegime: c.taxRegime, date });
    const byDate = (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime();

    const actualNow = new Date();
    const movementMonthStart = new Date(Date.UTC(actualNow.getUTCFullYear(), actualNow.getUTCMonth(), 1));
    const movementNextMonthStart = new Date(Date.UTC(actualNow.getUTCFullYear(), actualNow.getUTCMonth() + 1, 1));

    const movements = {
      enteredThisMonth: companies
        .filter((c: any) => c.obligationStartDate >= movementMonthStart && c.obligationStartDate < movementNextMonthStart)
        .map((c: any) => toItem(c, c.obligationStartDate)).sort(byDate),
      enteringFuture: companies
        .filter((c: any) => c.obligationStartDate >= movementNextMonthStart)
        .map((c: any) => toItem(c, c.obligationStartDate)).sort(byDate),
      leftThisMonth: companies
        .filter((c: any) => c.exitDate && c.exitDate >= movementMonthStart && c.exitDate < movementNextMonthStart)
        .map((c: any) => toItem(c, c.exitDate)).sort(byDate),
      leavingThisMonth: companies
        .filter((c: any) => c.exitDate && c.exitDate >= movementMonthStart && c.exitDate < movementNextMonthStart)
        .map((c: any) => toItem(c, c.exitDate)).sort(byDate),
      leavingFuture: companies
        .filter((c: any) => c.exitDate && c.exitDate >= movementNextMonthStart)
        .map((c: any) => toItem(c, c.exitDate)).sort(byDate),
    };

    const openLatest = latestOpenPeriod();
    const hasScopeFilter = Object.keys(userFilter).length > 0;
    const progress = ALL_SECTORS.map((type) => {
      if (type === 'PARCELAMENTO') {
        const scopedPlans = hasScopeFilter
          ? (installmentPlans || []).filter((p: any) => companyMap.has(p.companyId) || (userId && p.responsibleId === userId))
          : (installmentPlans || []);
        return computeInstallmentsProgress(scopedPlans, installmentSetting, monthStart, null);
      }
      const list = closings.filter((c: any) => {
        if (c.type !== type || c.status === 'NOT_APPLICABLE') return false;
        const comp = companyMap.get(c.companyId);
        if (!comp) return false;
        const s = comp.activeSectors;
        if (!s || s === 'TODOS' || s === '') return true;
        return s.split(',').map((x: string) => x.trim().toUpperCase()).includes(type);
      });
      const sectorCols = (allColumns || []).filter((c: any) => c.department === type);
      const progressColsForMonth = type === 'CONTABIL'
        ? []
        : sectorCols.filter((col: any) => col.countsProgress && isColumnActive(col, monthStart));

      let completed = 0;
      let inProgress = 0;
      let totalFields = 0;
      let completedFields = 0;
      let notApplicableCount = 0;

      for (const c of list) {
        const comp = companyMap.get(c.companyId);
        if (!comp) continue;
        const data = c.columnsData || {};

        if (type === 'CONTABIL') {
          const result = accountingProgress(comp, y, sectorCols, data, openLatest);
          totalFields += result.progressTotal;
          completedFields += result.progressDone;
          if (result.calculatedStatus === 'COMPLETED') completed++;
          else if (result.calculatedStatus === 'IN_PROGRESS') inProgress++;
        } else {
          const effectiveData = type === 'FISCAL' ? applyFiscalRegimeRules(comp.taxRegime, data) : data;
          const result = calculateColumnProgress(progressColsForMonth, effectiveData, (col: any) => resolveColumnKey(col) || col.columnKey || col.id);
          totalFields += result.progressTotal;
          completedFields += result.progressDone;
          if (result.calculatedStatus === 'COMPLETED') completed++;
          else if (result.calculatedStatus === 'IN_PROGRESS') inProgress++;
          else if (result.calculatedStatus === 'NOT_APPLICABLE') notApplicableCount++;
        }
      }

      const total = list.length - notApplicableCount;
      return {
        type,
        total,
        completed,
        inProgress,
        pending: total - completed - inProgress,
        percent: totalFields ? Math.round((completedFields / totalFields) * 100) : 0,
        totalFields,
        completedFields,
      };
    });

    const totalEmployees = closings
      .filter((c: any) => c.type === 'DP')
      .reduce((sum: number, c: any) => sum + (Number(c.dashboardMetrics?.employees) || 0), 0);

    const seenMonths = new Set<string>();
    const availableMonths: any[] = [];
    for (const p of (distinctPeriods || [])) {
      const d = new Date(p.referencePeriod);
      if (!periodIsOpen(d)) continue;
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const key = `${year}-${month}`;
      if (!seenMonths.has(key)) {
        seenMonths.add(key);
        availableMonths.push({
          year,
          month,
          label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
          iso: new Date(Date.UTC(year, month, 1)).toISOString(),
        });
      }
    }

    const payload = {
      referencePeriod: monthStart,
      totalActive: totalCompanies,
      totalEmployees,
      movements,
      progress,
      companies,
      availableMonths,
      regimes: {
        MEI: regimesMap['MEI'] || 0,
        SIMPLES_NACIONAL: regimesMap['SIMPLES_NACIONAL'] || 0,
        LUCRO_PRESUMIDO: regimesMap['LUCRO_PRESUMIDO'] || 0,
        LUCRO_REAL_TRIMESTRAL: regimesMap['LUCRO_REAL_TRIMESTRAL'] || 0,
        LUCRO_REAL_ESTIMATIVA: regimesMap['LUCRO_REAL_ESTIMATIVA'] || 0,
        LUCRO_REAL_ANUAL: regimesMap['LUCRO_REAL_ANUAL'] || 0,
        IMUNE_IRPJ: regimesMap['IMUNE_IRPJ'] || 0,
        CONDOMINIOS: regimesMap['CONDOMINIOS'] || 0,
        DOMESTICA: regimesMap['DOMESTICA'] || 0,
        ASSOCIACOES: regimesMap['ASSOCIACOES'] || 0,
        PESSOA_FISICA: regimesMap['PESSOA_FISICA'] || 0,
      },
    };

    dashboardCache.set(cacheKey, { timestamp: Date.now(), payload });
    return payload;
  })().finally(() => {
    dashboardInFlight.delete(cacheKey);
  });

  dashboardInFlight.set(cacheKey, task);
  return task;
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const monthStart = getTargetReferencePeriod(req.query);
    if (!requireOpenPeriod(monthStart, res)) return;

    const rawUserId = req.query.userId;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
    const cacheKey = `${monthStart.toISOString().slice(0, 7)}:${userId || 'all'}`;
    const cached = dashboardCache.get(cacheKey);
    const nowMs = Date.now();
    if (cached && nowMs - cached.timestamp < 120_000) {
      return res.json(cached.payload);
    }
    if (cached && nowMs - cached.timestamp < 600_000) {
      // Stale-while-revalidate: retorna imediatamente e atualiza em segundo plano
      void computeDashboardPayload(monthStart, userId as string | undefined).catch(() => {});
      return res.json(cached.payload);
    }

    triggerBackgroundRolloverCheck();
    void syncMonthClosingsAndReplicate(monthStart);

    const payload = await computeDashboardPayload(monthStart, userId as string | undefined);
    res.json(payload);
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do banco' });
  }
});

// ========================
// ========================
// CRYPTO HELPERS (AES-256-CBC)
// ========================
import crypto from 'crypto';

const PRIMARY_KEY = process.env.ENCRYPTION_KEY || 'fechamento-target-super-secret-key-32b!';
const LEGACY_KEY = 'fechamento-target-super-secret-key-32b!';
const ENC_KEY = crypto.createHash('sha256').update(PRIMARY_KEY).digest();
const LEGACY_ENC_KEY = crypto.createHash('sha256').update(LEGACY_KEY).digest();

function encryptPassword(text: string | null | undefined): string | null {
  if (!text || typeof text !== 'string' || text.trim() === '') return null;
  if (text.startsWith('enc:')) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `enc:${iv.toString('hex')}:${encrypted}`;
}

function decryptPassword(cipherText: string | null | undefined): string | null {
  if (!cipherText || typeof cipherText !== 'string' || cipherText.trim() === '') return null;
  if (!cipherText.startsWith('enc:')) return cipherText;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return cipherText;
    const iv = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    // Tenta descriptografar primeiro com a chave primária
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      // Se a chave primária diferir da legada e falhar, recorre à chave legada (rotação de chave transparente)
      if (PRIMARY_KEY !== LEGACY_KEY) {
        const decipher = crypto.createDecipheriv('aes-256-cbc', LEGACY_ENC_KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
      throw new Error('Falha na descriptografia da chave');
    }
  } catch (err) {
    console.error('Erro ao descriptografar senha:', err);
    return cipherText;
  }
}

function parseBrDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  if (!str) return null;
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        return new Date(Date.UTC(year, month, day, 12, 0, 0));
      }
    }
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ========================
// 3. EMPRESAS (CRUD COMPLETO + CNPJ AUTO-LOOKUP)
// ========================

// Auto-consulta CNPJ na Receita Federal
app.get('/api/cnpj/:cnpj', async (req, res) => {
  try {
    const cleanCnpj = req.params.cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido. Deve conter 14 dígitos numéricos.' });
    }

    let data: any = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) {
        data = await resp.json();
      }
    } catch (e) {
      console.warn('BrasilAPI falhou ou timeout, tentando alternativa...');
    }

    if (!data) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(`https://minhareceita.org/${cleanCnpj}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
          data = await resp.json();
        }
      } catch (e) {
        console.warn('MinhaReceita falhou');
      }
    }

    if (!data) {
      return res.status(404).json({ error: 'Não foi possível consultar o CNPJ na Receita Federal. Você pode preencher os dados manualmente.' });
    }

    const name = data.razao_social || data.nome || '';
    const tradeName = data.nome_fantasia || data.fantasia || '';
    const city = data.municipio || data.municipio_texto || '';
    const state = data.uf || '';
    
    let suggestedTaxRegime = 'LUCRO_PRESUMIDO';
    if (data.opcao_pelo_mei === true) {
      suggestedTaxRegime = 'MEI';
    } else if (data.opcao_pelo_simples === true) {
      suggestedTaxRegime = 'SIMPLES_NACIONAL';
    } else if (data.natureza_juridica && data.natureza_juridica.includes('Associação')) {
      suggestedTaxRegime = 'ASSOCIACOES';
    } else if (data.natureza_juridica && data.natureza_juridica.includes('Condomínio')) {
      suggestedTaxRegime = 'CONDOMINIOS';
    }

    let suggestedCompanyType = 'Serviço';
    const cnaeDesc = (data.cnae_fiscal_descricao || '').toLowerCase();
    if (cnaeDesc.includes('comércio') || cnaeDesc.includes('comercio') || cnaeDesc.includes('varejista') || cnaeDesc.includes('atacadista')) {
      suggestedCompanyType = 'Comércio';
    } else if (cnaeDesc.includes('indústria') || cnaeDesc.includes('industria') || cnaeDesc.includes('fabricação')) {
      suggestedCompanyType = 'Indústria';
    } else if (cnaeDesc.includes('transporte') || cnaeDesc.includes('logística')) {
      suggestedCompanyType = 'Transporte';
    } else if (cnaeDesc.includes('holding') || (data.natureza_juridica && data.natureza_juridica.includes('Holding'))) {
      suggestedCompanyType = 'Holding';
    } else if (cnaeDesc.includes('religios') || (data.natureza_juridica && data.natureza_juridica.includes('Religiosa'))) {
      suggestedCompanyType = 'Igreja';
    }

    res.json({
      cnpj: cleanCnpj,
      name,
      tradeName,
      city: city ? (state ? `${city} - ${state}` : city) : '',
      state,
      taxRegime: suggestedTaxRegime,
      companyType: suggestedCompanyType,
    });
  } catch (error) {
    console.error('Erro na consulta de CNPJ:', error);
    res.status(500).json({ error: 'Erro interno ao consultar CNPJ' });
  }
});

async function fetchFormattedCompanies(includeDeleted = false): Promise<any[]> {
  const now = Date.now();
  if (!includeDeleted && companiesCache && now - companiesCache.ts < 120_000) {
    return companiesCache.data;
  }
  const companies = await prisma.company.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    omit: { legacyData: true },
    include: {
      responsibles: {
        select: {
          id: true,
          sector: true,
          userId: true,
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
  });

  const formatted = companies.map((c: any) => ({
    ...c,
    code: formatCompanyCode(c.code) || null,
    certificatePasswordDecrypted: decryptPassword(c.certificatePassword),
    ginfessPasswordDecrypted: decryptPassword(c.ginfessPassword),
    gissOnlinePasswordDecrypted: decryptPassword(c.gissOnlinePassword),
    sdPasswordDecrypted: decryptPassword(c.sdPassword),
    nfPasswordDecrypted: decryptPassword(c.nfPassword),
  }));
  if (!includeDeleted) {
    companiesCache = { ts: Date.now(), data: formatted };
  }
  return formatted;
}

// Lista todas as empresas com dados completos e senhas descriptografadas para visualização segura
app.get('/api/companies', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const formatted = await fetchFormattedCompanies(includeDeleted);
    res.json(formatted);
  } catch (error) {
    console.error('Erro ao buscar empresas:', error);
    res.status(500).json({ error: 'Erro ao buscar empresas' });
  }
});

// Criar nova empresa com todos os 22 campos e criptografia
app.post('/api/companies', async (req, res) => {
  try {
    const {
      code,
      name,
      tradeName,
      cnpj,
      taxRegime = 'SIMPLES_NACIONAL',
      groupName,
      stateRegistration,
      municipalRegistration,
      city,
      contractDate,
      obligationStartDate,
      exitDate,
      targetProxyIssueDate,
      targetProxyDate,
      fgtsProxyIssueDate,
      fgtsProxyDate,
      decProxyIssueDate,
      decProxyDate,
      empregadorProxyIssueDate,
      empregadorProxyDate,
      hasClientCertificate = false,
      certificateType,
      certificatePassword,
      certificateIssue,
      certificateExpiration,
      companyType,
      deliveryMethod,
      activeSectors = 'TODOS',
      cityHallLogin,
      cityHallLink,
      ginfessPassword,
      gissOnlinePassword,
      sdLogin,
      sdPassword,
      nfAccessType,
      nfLogin,
      nfPassword,
      dissidioMonthYear,
      notes,
      notesScope = 'GERAL',
      userId,
    } = req.body;

    let isPrivileged = false;
    if (userId) {
      const actor = await prisma.user.findUnique({ where: { id: userId } });
      if (actor && (actor.role === 'ADMIN' || actor.role === 'SOCIO' || actor.role === 'CADASTRO' || actor.role === 'CUSHMAN')) {
        isPrivileged = true;
      }
    }
    if ((sdLogin || sdPassword) && !isPrivileged) {
      return res.status(403).json({ error: 'Apenas Administradores, Sócios e Cadastro podem cadastrar o SD Login e SD Senha.' });
    }

    if (!name || !cnpj) {
      return res.status(400).json({ error: 'Nome/Razão Social e CNPJ são obrigatórios.' });
    }

    const cleanCnpj = cnpj.replace(/\D/g, '');

    const existing = await prisma.company.findUnique({
      where: { cnpj: cleanCnpj },
    });
    if (existing) {
      return res.status(400).json({ error: `Já existe uma empresa cadastrada com o CNPJ ${cnpj}` });
    }

    const parsedContractDate = parseBrDate(contractDate);
    const parsedObligationDate = parseBrDate(obligationStartDate);
    if(!parsedContractDate||!parsedObligationDate)return res.status(400).json({error:"Informe datas válidas de contrato e de obrigação."});
    const parsedExitDate = parseBrDate(exitDate);
    const parsedProxyDate = parseBrDate(targetProxyDate);
    const exitError = exitDecisionError(req.body, null, parsedExitDate);
    if (exitError) return res.status(400).json({error: exitError});

    const newCompany = await prisma.company.create({
      data: {
        code: formatCompanyCode(code) || null,
        name: name.trim(),
        tradeName: tradeName ? tradeName.trim() : null,
        cnpj: cleanCnpj,
        taxRegime: taxRegime as any,
        groupName: groupName ? groupName.trim() : null,
        stateRegistration: stateRegistration ? stateRegistration.trim() : null,
        municipalRegistration: municipalRegistration ? municipalRegistration.trim() : null,
        city: city ? city.trim() : null,
        contractDate: parsedContractDate,
        obligationStartDate: parsedObligationDate,
        exitDate: parsedExitDate,
        exitMonthHasObligations: exitDecisionValue(req.body, null, parsedExitDate),
        targetProxyIssueDate: parseBrDate(targetProxyIssueDate),
        targetProxyDate: parsedProxyDate,
        fgtsProxyIssueDate: parseBrDate(fgtsProxyIssueDate),
        fgtsProxyDate: parseBrDate(fgtsProxyDate),
        decProxyIssueDate: parseBrDate(decProxyIssueDate),
        decProxyDate: parseBrDate(decProxyDate),
        empregadorProxyIssueDate: parseBrDate(empregadorProxyIssueDate),
        empregadorProxyDate: parseBrDate(empregadorProxyDate),
        hasClientCertificate: Boolean(hasClientCertificate),
        certificateType: hasClientCertificate ? (certificateType || null) : null,
        certificatePassword: hasClientCertificate ? encryptPassword(certificatePassword) : null,
        certificateIssue: hasClientCertificate ? (certificateIssue || null) : null,
        certificateExpiration: hasClientCertificate ? (certificateExpiration || null) : null,
        companyType: companyType || null,
        deliveryMethod: deliveryMethod || null,
        activeSectors: activeSectors || 'TODOS',
        cityHallLogin: cityHallLogin ? cityHallLogin.trim() : null,
        cityHallLink: cityHallLink ? cityHallLink.trim() : null,
        ginfessPassword: encryptPassword(ginfessPassword),
        gissOnlinePassword: encryptPassword(gissOnlinePassword),
        sdLogin: isPrivileged && sdLogin ? sdLogin.trim() : null,
        sdPassword: isPrivileged && sdPassword ? encryptPassword(sdPassword) : null,
        nfAccessType: nfAccessType ? nfAccessType.trim() : null,
        nfLogin: nfLogin ? nfLogin.trim() : null,
        nfPassword: encryptPassword(nfPassword),
        dissidioMonthYear: dissidioMonthYear ? dissidioMonthYear.trim() : null,
        notes: notes ? notes.trim() : null,
        notesScope: notesScope || 'GERAL',
      },
    });

    invalidateAllDataCaches();
    broadcastRealtimeEvent('COMPANY_CREATED', { companyId: newCompany.id });
    res.status(201).json({
      ...newCompany,
      certificatePasswordDecrypted: certificatePassword || null,
      ginfessPasswordDecrypted: ginfessPassword || null,
      gissOnlinePasswordDecrypted: gissOnlinePassword || null,
      sdPasswordDecrypted: isPrivileged && sdPassword ? sdPassword : null,
      nfPasswordDecrypted: nfPassword || null,
    });
  } catch (error: any) {
    console.error('Erro ao cadastrar empresa:', error);
    res.status(500).json({ error: error.message || 'Erro ao cadastrar empresa' });
  }
});

// Atualizar empresa existente
app.put('/api/companies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      name,
      tradeName,
      cnpj,
      taxRegime,
      groupName,
      stateRegistration,
      municipalRegistration,
      city,
      contractDate,
      obligationStartDate,
      exitDate,
      targetProxyIssueDate,
      targetProxyDate,
      fgtsProxyIssueDate,
      fgtsProxyDate,
      decProxyIssueDate,
      decProxyDate,
      empregadorProxyIssueDate,
      empregadorProxyDate,
      hasClientCertificate,
      certificateType,
      certificatePassword,
      certificateIssue,
      certificateExpiration,
      companyType,
      deliveryMethod,
      activeSectors,
      cityHallLogin,
      cityHallLink,
      ginfessPassword,
      gissOnlinePassword,
      sdLogin,
      sdPassword,
      nfAccessType,
      nfLogin,
      nfPassword,
      dissidioMonthYear,
      notes,
      notesScope,
      userId,
    } = req.body;

    const existingCompany = await prisma.company.findUnique({ where: { id }, include: { responsibles: true } });
    if (!existingCompany) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    const actor = await resolveAuthenticatedUser(prisma, req);
    if (actor && !canUserEditCompany(actor, existingCompany, null)) {
      return res.status(403).json({ error: 'Você só pode editar dados cadastrais das empresas sob sua responsabilidade.' });
    }

    const updateData: any = {};
    if (code !== undefined) updateData.code = formatCompanyCode(code) || null;
    if (name !== undefined) updateData.name = name.trim();
    if (tradeName !== undefined) updateData.tradeName = tradeName ? tradeName.trim() : null;
    if (cnpj !== undefined) updateData.cnpj = cnpj.replace(/\D/g, '');
    if (taxRegime !== undefined) updateData.taxRegime = taxRegime;
    if (groupName !== undefined) updateData.groupName = groupName ? groupName.trim() : null;
    if (stateRegistration !== undefined) updateData.stateRegistration = stateRegistration ? stateRegistration.trim() : null;
    if (municipalRegistration !== undefined) updateData.municipalRegistration = municipalRegistration ? municipalRegistration.trim() : null;
    if (city !== undefined) updateData.city = city ? city.trim() : null;
    
    if (contractDate !== undefined) updateData.contractDate = parseBrDate(contractDate);
    if (obligationStartDate !== undefined) updateData.obligationStartDate = parseBrDate(obligationStartDate);
    if (exitDate !== undefined) updateData.exitDate = parseBrDate(exitDate);
    const exitError = exitDecisionError(req.body, existingCompany, updateData.exitDate);
    if (exitError) return res.status(400).json({error: exitError});
    if (exitDate !== undefined || req.body.exitMonthHasObligations !== undefined) {
      updateData.exitMonthHasObligations = exitDecisionValue(req.body, existingCompany, updateData.exitDate);
    }
    if (targetProxyIssueDate !== undefined) updateData.targetProxyIssueDate = parseBrDate(targetProxyIssueDate);
    if (targetProxyDate !== undefined) updateData.targetProxyDate = parseBrDate(targetProxyDate);
    if (fgtsProxyIssueDate !== undefined) updateData.fgtsProxyIssueDate = parseBrDate(fgtsProxyIssueDate);
    if (fgtsProxyDate !== undefined) updateData.fgtsProxyDate = parseBrDate(fgtsProxyDate);
    if (decProxyIssueDate !== undefined) updateData.decProxyIssueDate = parseBrDate(decProxyIssueDate);
    if (decProxyDate !== undefined) updateData.decProxyDate = parseBrDate(decProxyDate);
    if (empregadorProxyIssueDate !== undefined) updateData.empregadorProxyIssueDate = parseBrDate(empregadorProxyIssueDate);
    if (empregadorProxyDate !== undefined) updateData.empregadorProxyDate = parseBrDate(empregadorProxyDate);

    if (hasClientCertificate !== undefined) {
      updateData.hasClientCertificate = Boolean(hasClientCertificate);
      if (!hasClientCertificate) {
        updateData.certificateType = null;
        updateData.certificatePassword = null;
        updateData.certificateIssue = null;
        updateData.certificateExpiration = null;
      }
    }

    if (hasClientCertificate || (hasClientCertificate === undefined && existingCompany.hasClientCertificate)) {
      if (certificateType !== undefined) updateData.certificateType = certificateType;
      if (certificatePassword !== undefined) {
        updateData.certificatePassword = certificatePassword ? encryptPassword(certificatePassword) : null;
      }
      if (certificateIssue !== undefined) updateData.certificateIssue = certificateIssue;
      if (certificateExpiration !== undefined) updateData.certificateExpiration = certificateExpiration;
    }

    if (companyType !== undefined) updateData.companyType = companyType;
    if (deliveryMethod !== undefined) updateData.deliveryMethod = deliveryMethod;
    if (activeSectors !== undefined) updateData.activeSectors = activeSectors;
    if (cityHallLogin !== undefined) updateData.cityHallLogin = cityHallLogin ? cityHallLogin.trim() : null;
    if (cityHallLink !== undefined) updateData.cityHallLink = cityHallLink ? cityHallLink.trim() : null;

    if (ginfessPassword !== undefined) {
      updateData.ginfessPassword = ginfessPassword ? encryptPassword(ginfessPassword) : null;
    }
    if (gissOnlinePassword !== undefined) {
      updateData.gissOnlinePassword = gissOnlinePassword ? encryptPassword(gissOnlinePassword) : null;
    }

    let isPrivileged = false;
    if (userId) {
      const actor = await prisma.user.findUnique({ where: { id: userId } });
      if (actor && (actor.role === 'ADMIN' || actor.role === 'SOCIO' || actor.role === 'CADASTRO' || actor.role === 'CUSHMAN')) {
        isPrivileged = true;
      }
    }

    const currentSdLogin = existingCompany.sdLogin || '';
    const currentSdPassword = decryptPassword(existingCompany.sdPassword) || '';
    const newSdLogin = sdLogin !== undefined ? (sdLogin ? sdLogin.trim() : '') : currentSdLogin;
    const newSdPassword = sdPassword !== undefined ? (sdPassword ? sdPassword.trim() : '') : currentSdPassword;

    if ((newSdLogin !== currentSdLogin || newSdPassword !== currentSdPassword) && !isPrivileged) {
      return res.status(403).json({ error: 'Apenas Administradores, Sócios e Cadastro podem alterar o SD Login e SD Senha.' });
    }

    if (isPrivileged) {
      if (sdLogin !== undefined) updateData.sdLogin = sdLogin ? sdLogin.trim() : null;
      if (sdPassword !== undefined) updateData.sdPassword = sdPassword ? encryptPassword(sdPassword) : null;
    }

    if (nfAccessType !== undefined) updateData.nfAccessType = nfAccessType ? nfAccessType.trim() : null;
    if (nfLogin !== undefined) updateData.nfLogin = nfLogin ? nfLogin.trim() : null;
    if (nfPassword !== undefined) updateData.nfPassword = nfPassword ? encryptPassword(nfPassword) : null;

    if (dissidioMonthYear !== undefined) updateData.dissidioMonthYear = dissidioMonthYear ? dissidioMonthYear.trim() : null;
    if (notes !== undefined) updateData.notes = notes ? notes.trim() : null;
    if (notesScope !== undefined) updateData.notesScope = notesScope || 'GERAL';

    if(contractDate && !updateData.contractDate)return res.status(400).json({error:'Data de contrato inválida.'});
    if(obligationStartDate && !updateData.obligationStartDate)return res.status(400).json({error:'Data de obrigação inválida.'});

    // Registro automático de histórico para transições de regime tributário
    const { transitionStrategy } = req.body;
    if (taxRegime && existingCompany.taxRegime !== taxRegime && transitionStrategy) {
      const now = new Date();
      const todayStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      let logMsg = '';
      if (transitionStrategy === 'NEXT_MONTH') {
        logMsg = `[Migração Tributária em ${todayStr}: de ${existingCompany.taxRegime} para ${taxRegime} (Vigência a partir do próximo mês)]`;
      } else if (transitionStrategy === 'CURRENT_MONTH') {
        logMsg = `[Alteração Tributária em ${todayStr}: de ${existingCompany.taxRegime} para ${taxRegime} (Aplicada ao mês atual)]`;
      } else if (transitionStrategy === 'SPLIT') {
        logMsg = `[Desenquadramento / Transição Proporcional em ${todayStr}: de ${existingCompany.taxRegime} para ${taxRegime} (Apuração proporcional)]`;
      }
      if (logMsg) {
        const currentNotes = updateData.notes !== undefined ? (updateData.notes || '') : (existingCompany.notes || '');
        updateData.notes = currentNotes ? `${logMsg}\n${currentNotes}` : logMsg;
      }
    }

    const updated = await prisma.company.update({
      where: { id },
      data: updateData,
    });

    if (req.body.userId) {
      void logAction(
        req.body.userId,
        req.body.userEmail || '',
        req.body.userName || 'Sistema',
        'ATUALIZOU_EMPRESA',
        'EMPRESA',
        updated.id,
        {
          name: updated.name,
          cnpj: updated.cnpj,
          updates: Object.keys(updateData)
        },
        req.ip
      );
    }

    invalidateAllDataCaches();
    broadcastRealtimeEvent('COMPANY_UPDATED', { companyId: updated.id });
    res.json({
      ...updated,
      certificatePasswordDecrypted: decryptPassword(updated.certificatePassword),
      ginfessPasswordDecrypted: decryptPassword(updated.ginfessPassword),
      gissOnlinePasswordDecrypted: decryptPassword(updated.gissOnlinePassword),
      sdPasswordDecrypted: decryptPassword(updated.sdPassword),
      nfPasswordDecrypted: decryptPassword(updated.nfPassword),
    });
  } catch (error: any) {
    console.error('Erro ao atualizar empresa:', error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar empresa' });
  }
});

// Excluir empresa (Soft Delete - preserva histórico contábil conforme Art. 173 CTN, restrito a ADMIN/SOCIO)
app.delete('/api/companies/:id', async (req, res) => {
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Apenas Administradores e Sócios podem excluir empresas.' });
    }

    const { id } = req.params;
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    await prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    invalidateAllDataCaches();

    void logAction(
      actor.id,
      actor.email,
      actor.name || actor.email,
      'EXCLUIU_EMPRESA',
      'EMPRESA',
      id,
      { code: company.code, name: company.name, cnpj: company.cnpj, softDelete: true },
      getClientIp(req)
    );

    broadcastRealtimeEvent('COMPANY_DELETED', { companyId: id });

    res.json({ success: true, message: 'Empresa excluída com sucesso (histórico contábil preservado)' });
  } catch (error) {
    console.error('Erro ao excluir empresa:', error);
    res.status(500).json({ error: 'Erro ao excluir empresa' });
  }
});

// Restaurar empresa excluída (Soft Delete restore - restrito a ADMIN/SOCIO)
app.post('/api/companies/:id/restore', async (req, res) => {
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Apenas Administradores e Sócios podem restaurar empresas.' });
    }

    const { id } = req.params;
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    await prisma.company.update({
      where: { id },
      data: { deletedAt: null },
    });
    invalidateAllDataCaches();

    void logAction(
      actor.id,
      actor.email,
      actor.name || actor.email,
      'RESTAUROU_EMPRESA',
      'EMPRESA',
      id,
      { code: company.code, name: company.name, cnpj: company.cnpj },
      getClientIp(req)
    );

    broadcastRealtimeEvent('COMPANY_RESTORED', { companyId: id });

    res.json({ success: true, message: 'Empresa restaurada com sucesso' });
  } catch (error) {
    console.error('Erro ao restaurar empresa:', error);
    res.status(500).json({ error: 'Erro ao restaurar empresa' });
  }
});

// Atribuir responsável a uma empresa
app.post('/api/companies/:id/responsibles', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, sector } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId é obrigatório' });
    }

    const assigned = await prisma.companyResponsible.upsert({
      where: {
        companyId_userId_sector: {
          companyId: id,
          userId,
          sector: sector || null,
        },
      },
      update: {},
      create: {
        companyId: id,
        userId,
        sector: sector || null,
      },
    });

    invalidateAllDataCaches();
    res.status(201).json(assigned);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atribuir responsável' });
  }
});

// Atribuição em Massa de Responsáveis (Bulk Assign)
app.post('/api/companies/bulk-responsible', async (req, res) => {
  try {
    const { companyIds, sector, userId, actorId, actorEmail, actorName } = req.body;

    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma empresa selecionada para atribuição.' });
    }

    let targetUser: any = null;
    if (userId) {
      targetUser = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { id: true, name: true, email: true, role: true },
      });
      if (!targetUser) {
        return res.status(400).json({ error: 'Usuário selecionado não foi encontrado.' });
      }
    }

    const normSector = sector ? String(sector).toUpperCase() : null;

    await prisma.$transaction(async (tx: any) => {
      for (const compId of companyIds) {
        // Remove vínculo anterior do setor para a empresa
        await tx.companyResponsible.deleteMany({
          where: {
            companyId: compId,
            ...(normSector ? { sector: normSector } : {}),
          },
        });

        // Se foi selecionado um novo responsável, cria o vínculo
        if (targetUser) {
          await tx.companyResponsible.create({
            data: {
              companyId: compId,
              userId: targetUser.id,
              sector: normSector || null,
            },
          });
        }
      }
    });

    invalidateAllDataCaches();

    // Log de auditoria
    void logAction(
      actorId || req.body.userId || null,
      actorEmail || req.body.userEmail || null,
      actorName || req.body.userName || 'Sistema',
      'ATRIBUICAO_EM_MASSA_RESPONSAVEL',
      normSector || 'GERAL',
      null,
      {
        totalCompanies: companyIds.length,
        sector: normSector,
        responsibleId: targetUser?.id || null,
        responsibleName: targetUser?.name || targetUser?.email || 'Nenhum (Removido)',
      },
      getClientIp(req)
    );

    res.json({
      success: true,
      count: companyIds.length,
      responsibleName: targetUser?.name || 'Nenhum',
      sector: normSector,
    });
  } catch (error) {
    console.error('Erro na atribuição em massa de responsáveis:', error);
    res.status(500).json({ error: 'Erro interno ao atribuir responsáveis em massa.' });
  }
});

// Prévia de Transferência Direta de Carteira de Responsável
app.get('/api/responsibles/transfer/preview', async (req, res) => {
  try {
    const { fromUserId, sector } = req.query;
    if (!fromUserId) {
      return res.status(400).json({ error: 'fromUserId é obrigatório.' });
    }
    const normSector = sector && sector !== 'ALL' ? String(sector).toUpperCase() : null;
    const count = await prisma.companyResponsible.count({
      where: {
        userId: String(fromUserId),
        ...(normSector ? { sector: normSector } : {}),
      },
    });
    res.json({ count });
  } catch (error) {
    console.error('Erro ao consultar prévia de transferência de responsáveis:', error);
    res.status(500).json({ error: 'Erro ao consultar prévia de transferência.' });
  }
});

// Transferência Direta de Responsabilidades entre Usuários
app.post('/api/responsibles/transfer', async (req, res) => {
  try {
    const { fromUserId, toUserId, sector, actorId, actorEmail, actorName } = req.body;

    if (!fromUserId || !toUserId) {
      return res.status(400).json({ error: 'Os colaboradores de origem e destino são obrigatórios.' });
    }

    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'O colaborador de origem e de destino não podem ser o mesmo.' });
    }

    const [fromUser, toUser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: String(fromUserId) },
        select: { id: true, name: true, email: true, role: true },
      }),
      prisma.user.findUnique({
        where: { id: String(toUserId) },
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    if (!fromUser || !toUser) {
      return res.status(404).json({ error: 'Colaborador de origem ou de destino não foi encontrado.' });
    }

    const normSector = sector && sector !== 'ALL' ? String(sector).toUpperCase() : null;

    // Busca todas as atribuições atuais do colaborador de origem
    const assignments = await prisma.companyResponsible.findMany({
      where: {
        userId: fromUser.id,
        ...(normSector ? { sector: normSector } : {}),
      },
    });

    if (assignments.length === 0) {
      return res.json({
        success: true,
        count: 0,
        message: `Nenhuma empresa atribuída a ${fromUser.name || fromUser.email} no setor especificado.`,
        fromUser: fromUser.name || fromUser.email,
        toUser: toUser.name || toUser.email,
        sector: normSector || 'TODOS',
      });
    }

    // Executa a migração em lote protegida
    await prisma.$transaction(async (tx: any) => {
      // 1. Identifica conflitos onde o destinatário já possui vínculo na mesma empresa e setor
      const toUserExisting = await tx.companyResponsible.findMany({
        where: {
          userId: toUser.id,
          companyId: { in: assignments.map((a: any) => a.companyId) },
          ...(normSector ? { sector: normSector } : {}),
        },
        select: { companyId: true, sector: true },
      });

      // 2. Remove vínculos conflitantes do remetente para evitar duplicidade
      for (const conflict of toUserExisting) {
        await tx.companyResponsible.deleteMany({
          where: {
            userId: fromUser.id,
            companyId: conflict.companyId,
            sector: conflict.sector,
          },
        });
      }

      // 3. Atualiza todos os vínculos restantes para o destinatário em uma única operação atômica
      await tx.companyResponsible.updateMany({
        where: {
          userId: fromUser.id,
          ...(normSector ? { sector: normSector } : {}),
        },
        data: {
          userId: toUser.id,
        },
      });
    }, { timeout: 30000, maxWait: 10000 });

    invalidateAllDataCaches();

    // Registro na trilha de auditoria
    void logAction(
      actorId || req.body.userId || null,
      actorEmail || req.body.userEmail || null,
      actorName || req.body.userName || 'Sistema',
      'TRANSFERENCIA_RESPONSABILIDADES',
      normSector || 'GERAL',
      null,
      {
        totalTransferred: assignments.length,
        fromUserId: fromUser.id,
        fromUserName: fromUser.name || fromUser.email,
        toUserId: toUser.id,
        toUserName: toUser.name || toUser.email,
        sector: normSector || 'TODOS',
      },
      getClientIp(req)
    );

    res.json({
      success: true,
      count: assignments.length,
      fromUser: fromUser.name || fromUser.email,
      toUser: toUser.name || toUser.email,
      sector: normSector || 'TODOS',
    });
  } catch (error) {
    console.error('Erro ao transferir responsabilidades:', error);
    res.status(500).json({ error: 'Erro interno ao transferir responsabilidades.' });
  }
});

// Trilha de Auditoria na Própria Célula (Quick Cell History)
app.get('/api/audit/cell-history', async (req, res) => {
  try {
    const { companyId, columnKey, sector } = req.query;
    if (!companyId || !columnKey) {
      return res.status(400).json({ error: 'companyId e columnKey são obrigatórios.' });
    }

    const logs = await prisma.systemLog.findMany({
      where: {
        entityId: String(companyId),
        action: { in: ['ATUALIZOU_OBRIGACAO', 'BULK_ACTION_OBRIGACAO'] },
        ...(sector ? { entity: String(sector).toUpperCase() } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    const parsedLogs = logs
      .filter((l: any) => {
        try {
          const det = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
          return det && det.columnKey === columnKey;
        } catch {
          return false;
        }
      })
      .slice(0, 30)
      .map((l: any) => {
        const det = typeof l.details === 'string' ? JSON.parse(l.details) : l.details;
        return {
          id: l.id,
          userName: l.userName || l.userEmail || 'Usuário',
          userEmail: l.userEmail,
          userId: l.userId,
          oldValue: det?.oldValue,
          newValue: det?.newValue,
          status: det?.status,
          createdAt: l.createdAt,
        };
      });

    res.json({ logs: parsedLogs });
  } catch (error) {
    console.error('Erro ao buscar histórico de auditoria da célula:', error);
    res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
});

// Central de Alertas Pró-Ativos (Smart Alert Summary)
let alertsCache: { ts: number; data: any } | null = null;

app.get('/api/alerts/summary', async (req, res) => {
  try {
    const now = Date.now();
    if (alertsCache && now - alertsCache.ts < 30_000) {
      return res.json(alertsCache.data);
    }

    const today = new Date();
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const companies = await prisma.company.findMany({
      where: {
        OR: [
          { exitDate: null },
          { exitDate: { gt: today } },
        ],
      },
      select: {
        id: true,
        code: true,
        name: true,
        tradeName: true,
        cnpj: true,
        certificateExpiration: true,
        certificateType: true,
        targetProxyDate: true,
        fgtsProxyDate: true,
        decProxyDate: true,
        empregadorProxyDate: true,
      },
    });

    const certAlerts: any[] = [];
    const proxyAlerts: any[] = [];

    for (const c of companies) {
      // Certificado Digital
      if (c.certificateExpiration) {
        const exp = new Date(c.certificateExpiration);
        if (!isNaN(exp.getTime()) && exp <= in30Days) {
          const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          certAlerts.push({
            companyId: c.id,
            companyCode: formatCompanyCode(c.code),
            companyName: c.name,
            expiration: exp.toISOString().slice(0, 10),
            daysRemaining: diffDays,
            severity: diffDays < 0 ? 'EXPIRED' : diffDays <= 15 ? 'CRITICAL' : 'WARNING',
            type: c.certificateType || 'A1',
          });
        }
      }

      // Procurações
      const proxies = [
        { label: 'RFB / e-CAC', date: c.targetProxyDate },
        { label: 'FGTS / Conectividade', date: c.fgtsProxyDate },
        { label: 'DEC (Prefeitura)', date: c.decProxyDate },
        { label: 'Empregador Web', date: c.empregadorProxyDate },
      ];

      for (const p of proxies) {
        if (p.date) {
          const pExp = new Date(p.date);
          if (!isNaN(pExp.getTime()) && pExp <= in30Days) {
            const diffDays = Math.ceil((pExp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            proxyAlerts.push({
              companyId: c.id,
              companyCode: formatCompanyCode(c.code),
              companyName: c.name,
              proxyType: p.label,
              expiration: pExp.toISOString().slice(0, 10),
              daysRemaining: diffDays,
              severity: diffDays < 0 ? 'EXPIRED' : diffDays <= 15 ? 'CRITICAL' : 'WARNING',
            });
          }
        }
      }
    }

    certAlerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
    proxyAlerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

    // Parcelamentos com pendências no mês
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;
    let pendingInstallments: any[] = [];
    try {
      const activePlans = await prisma.installmentPlan.findMany({
        where: { status: 'ATIVO' },
        include: {
          company: { select: { id: true, code: true, name: true } },
          payments: {
            where: {
              installmentNumber: { gte: 1 },
              status: { not: 'PAID' },
            },
            take: 1,
          },
        },
        take: 50,
      });

      pendingInstallments = activePlans
        .filter((plan: any) => plan.payments && plan.payments.length > 0)
        .map((plan: any) => ({
          planId: plan.id,
          companyId: plan.company?.id,
          companyCode: formatCompanyCode(plan.company?.code),
          companyName: plan.company?.name,
          typeName: plan.typeName,
          dueDay: plan.dueDay || 20,
        }));
    } catch {
      // Ignora erro se plans estiver vazio
    }

    const payload = {
      certificates: certAlerts,
      proxies: proxyAlerts,
      installments: pendingInstallments,
      totalCount: certAlerts.length + proxyAlerts.length + pendingInstallments.length,
      timestamp: Date.now(),
    };

    alertsCache = { ts: now, data: payload };
    res.json(payload);
  } catch (error) {
    console.error('Erro ao buscar alertas:', error);
    res.status(500).json({ error: 'Erro ao consolidar alertas' });
  }
});

// ========================
// 4. USUÁRIOS E PERMISSÕES
// ========================
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        companyScope: true,
        canViewAllCompanies: true,
        editOnlyResponsible: true,
        createdAt: true,
        sectorPermissions: true,
        screenPermissions: true,
        companyAccess: {
          select: { companyId: true, company: { select: { id: true, name: true, cnpj: true, taxRegime: true } } },
        },
        responsibleAssignments: {
          select: {
            id: true,
            companyId: true,
            sector: true,
            company: { select: { id: true, name: true, cnpj: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// Criar Usuário (com regra de hierarquia: Sócio não pode criar Admin)
app.post('/api/users', async (req, res) => {
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Apenas Administradores e Sócios autenticados podem cadastrar usuários.' });
    }

    const {
      name,
      email,
      password,
      role = 'CADASTRO',
      companyScope = 'ALL',
      canViewAllCompanies,
      editOnlyResponsible = false,
      sectorPermissions = [],
      screenPermissions = [],
      companyAccessIds = [],
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'E-mail é obrigatório' });
    }

    // Validação de Hierarquia: Sócio não pode criar ADMIN
    if (actor.role === 'SOCIO' && role === 'ADMIN') {
      return res.status(403).json({ error: 'Sócios não possuem permissão para criar administradores.' });
    }

    // Normaliza companyScope
    const scope = ['ALL', 'RESPONSIBLE', 'CUSTOM'].includes(companyScope)
      ? companyScope
      : (canViewAllCompanies === false ? 'CUSTOM' : 'ALL');

    // Verifica duplicação de e-mail
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Já existe um usuário com este e-mail' });
    }

    const hashedPassword = password ? bcrypt.hashSync(password, 10) : bcrypt.hashSync('123456', 10);

    // Constrói permissões de setor
    const sectorData = ALL_SECTORS.map((s) => {
      const found = sectorPermissions.find((p: any) => p.sector === s);
      if (found) return { sector: s, access: found.access };
      if (role === 'ADMIN' || role === 'SOCIO') return { sector: s, access: 'EDIT' };
      if (role === 'CUSHMAN' && s === 'CUSHMAN') return { sector: s, access: 'EDIT' };
      if (role === 'CADASTRO') return { sector: s, access: 'NONE' };
      if (role === s) return { sector: s, access: 'EDIT' };
      return { sector: s, access: 'NONE' };
    });

    // Constrói permissões de telas
    const screenData = ALL_SCREENS.map((sc) => {
      const found = screenPermissions.find((p: any) => p.screen === sc.id);
      if (found) return { screen: sc.id, allowed: Boolean(found.allowed) };
      if (role === 'ADMIN' || role === 'SOCIO') return { screen: sc.id, allowed: true };
      if (role === 'CADASTRO') {
        if (['companies', 'certificates', 'settings-data-quality'].includes(sc.id)) return { screen: sc.id, allowed: true };
        return { screen: sc.id, allowed: false };
      }
      if (role === 'CUSHMAN') {
        if (['companies', 'certificates', 'closings'].includes(sc.id)) return { screen: sc.id, allowed: true };
        return { screen: sc.id, allowed: false };
      }
      if (['settings-permissions', 'settings-columns', 'installments-create', 'settings-data-quality', 'logs'].includes(sc.id)) return { screen: sc.id, allowed: false };
      return { screen: sc.id, allowed: true };
    });

    const user = await prisma.user.create({
      data: {
        name: name || email.split('@')[0],
        email,
        password: hashedPassword,
        role,
        companyScope: scope,
        canViewAllCompanies: scope === 'ALL',
        editOnlyResponsible: scope === 'RESPONSIBLE' ? true : Boolean(editOnlyResponsible),
        sectorPermissions: {
          create: sectorData,
        },
        screenPermissions: {
          create: screenData,
        },
        companyAccess: {
          create: (scope === 'CUSTOM' && Array.isArray(companyAccessIds))
            ? companyAccessIds.map((cId: string) => ({ companyId: cId }))
            : [],
        },
      },
      include: {
        sectorPermissions: true,
        screenPermissions: true,
        companyAccess: true,
        responsibleAssignments: true,
      },
    });

    invalidateAllDataCaches();
    const { password: _, ...userSafe } = user;
    res.status(201).json(userSafe);
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Atualizar Usuário e suas Permissões (com regra de hierarquia)
app.put('/api/users/:id', async (req, res) => {
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Apenas Administradores e Sócios autenticados podem editar usuários.' });
    }

    const { id } = req.params;
    const {
      name,
      email,
      password,
      role,
      active,
      companyScope,
      canViewAllCompanies,
      editOnlyResponsible,
      sectorPermissions,
      screenPermissions,
      companyAccessIds,
    } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Regras de Hierarquia para SÓCIO:
    if (actor.role === 'SOCIO') {
      if (targetUser.role === 'ADMIN') {
        return res.status(403).json({ error: 'Sócios não podem modificar administradores.' });
      }
      if (role === 'ADMIN') {
        return res.status(403).json({ error: 'Sócios não podem promover usuários a administrador.' });
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (active !== undefined) updateData.active = Boolean(active);
    if (companyScope !== undefined) {
      updateData.companyScope = companyScope;
      updateData.canViewAllCompanies = companyScope === 'ALL';
      if (companyScope === 'RESPONSIBLE') {
        updateData.editOnlyResponsible = true;
      }
    } else if (canViewAllCompanies !== undefined) {
      updateData.canViewAllCompanies = Boolean(canViewAllCompanies);
      updateData.companyScope = canViewAllCompanies ? 'ALL' : 'CUSTOM';
    }
    if (editOnlyResponsible !== undefined && companyScope !== 'RESPONSIBLE') {
      updateData.editOnlyResponsible = Boolean(editOnlyResponsible);
    }
    if (password) updateData.password = bcrypt.hashSync(password, 10);

    await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Atualiza permissões de setor (se enviadas)
    if (Array.isArray(sectorPermissions)) {
      for (const sp of sectorPermissions) {
        if (sp.sector && sp.access) {
          await prisma.userSectorPermission.upsert({
            where: { userId_sector: { userId: id, sector: sp.sector } },
            update: { access: sp.access },
            create: { userId: id, sector: sp.sector, access: sp.access },
          });
        }
      }
    }

    // Atualiza permissões de telas (se enviadas)
    if (Array.isArray(screenPermissions)) {
      for (const sc of screenPermissions) {
        if (sc.screen) {
          await prisma.userScreenPermission.upsert({
            where: { userId_screen: { userId: id, screen: sc.screen } },
            update: { allowed: Boolean(sc.allowed) },
            create: { userId: id, screen: sc.screen, allowed: Boolean(sc.allowed) },
          });
        }
      }
    }

    // Atualiza empresas permitidas quando companyScope = CUSTOM
    const finalScope = companyScope || (updateData.companyScope || targetUser.companyScope);
    if (finalScope === 'CUSTOM' && Array.isArray(companyAccessIds)) {
      await prisma.userCompanyAccess.deleteMany({ where: { userId: id } });
      if (companyAccessIds.length > 0) {
        await prisma.userCompanyAccess.createMany({
          data: companyAccessIds.map((cId: string) => ({ userId: id, companyId: cId })),
        });
      }
    } else if (finalScope === 'ALL' || finalScope === 'RESPONSIBLE') {
      await prisma.userCompanyAccess.deleteMany({ where: { userId: id } });
    }

    // Retorna usuário completo atualizado
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      include: {
        sectorPermissions: true,
        screenPermissions: true,
        companyAccess: { include: { company: { select: { id: true, name: true, cnpj: true } } } },
        responsibleAssignments: { include: { company: { select: { id: true, name: true, cnpj: true } } } },
      },
    });

    invalidateAllDataCaches();
    const { password: _, ...userSafe } = updatedUser;
    res.json(userSafe);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

// Buscar atribuições de empresas de um usuário (para conferência ou desligamento)
app.get('/api/users/:id/assignments', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        leftAt: true,
        exitReason: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const [responsibleAssignments, companyAccess, installmentPlans] = await Promise.all([
      prisma.companyResponsible.findMany({
        where: { userId: id },
        include: {
          company: {
            select: { id: true, name: true, cnpj: true, city: true, taxRegime: true },
          },
        },
      }),
      prisma.userCompanyAccess.findMany({
        where: { userId: id },
        include: {
          company: {
            select: { id: true, name: true, cnpj: true, city: true, taxRegime: true },
          },
        },
      }),
      prisma.installmentPlan.findMany({
        where: { responsibleId: id },
        include: {
          company: { select: { id: true, name: true, cnpj: true } },
        },
      }),
    ]);

    res.json({
      user,
      responsibleAssignments,
      companyAccess,
      installmentPlans,
      totalCount: responsibleAssignments.length,
    });
  } catch (error) {
    console.error('Erro ao buscar atribuições do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar atribuições' });
  }
});

// Desligar Usuário (marcar como 'Não faz mais parte da empresa') e transferir empresas
app.post('/api/users/:id/offboard', async (req, res) => {
  const clientIp = getClientIp(req);
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Apenas Administradores e Sócios autenticados podem desligar colaboradores.' });
    }

    const { id } = req.params;
    const {
      leftAt,
      exitReason,
      transferMode = 'ALL',
      targetUserId,
      reassignments = [],
    } = req.body;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (actor.id === id) {
      return res.status(400).json({ error: 'Você não pode desligar sua própria conta.' });
    }

    if (actor.role === 'SOCIO' && (targetUser.role === 'ADMIN' || targetUser.role === 'SOCIO')) {
      return res.status(403).json({ error: 'Sócios não podem desligar administradores ou outros sócios.' });
    }

    // Parse da data de saída
    const exitDate = leftAt ? new Date(leftAt) : new Date();

    // 1. Atualiza usuário para inativo e registra a data e motivo da saída
    await prisma.user.update({
      where: { id },
      data: {
        active: false,
        leftAt: exitDate,
        exitReason: exitReason || 'Não faz mais parte da empresa',
      },
    });

    let transferredCount = 0;
    let targetUserName: string | null = null;

    // 2. Transferência de empresas
    if (transferMode === 'ALL' && targetUserId) {
      const newResponsible = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (newResponsible) {
        targetUserName = newResponsible.name || newResponsible.email;
        const currentAssignments = await prisma.companyResponsible.findMany({ where: { userId: id } });

        for (const a of currentAssignments) {
          const alreadyAssigned = await prisma.companyResponsible.findFirst({
            where: { companyId: a.companyId, userId: targetUserId, sector: a.sector },
          });

          if (alreadyAssigned) {
            await prisma.companyResponsible.delete({ where: { id: a.id } });
          } else {
            await prisma.companyResponsible.update({
              where: { id: a.id },
              data: { userId: targetUserId },
            });
          }
          transferredCount++;
        }

        // Se o novo responsável tiver escopo CUSTOM, transfere os acessos manuais
        if (newResponsible.companyScope === 'CUSTOM') {
          const userAccesses = await prisma.userCompanyAccess.findMany({ where: { userId: id } });
          for (const acc of userAccesses) {
            const accExists = await prisma.userCompanyAccess.findUnique({
              where: { userId_companyId: { userId: targetUserId, companyId: acc.companyId } },
            });
            if (!accExists) {
              await prisma.userCompanyAccess.create({
                data: { userId: targetUserId, companyId: acc.companyId },
              });
            }
          }
        }

        // Transfere parcelamentos
        await prisma.installmentPlan.updateMany({
          where: { responsibleId: id },
          data: { responsibleId: targetUserId },
        });
      }
    } else if (transferMode === 'MANUAL' && Array.isArray(reassignments)) {
      for (const item of reassignments) {
        const { companyId, sector, newUserId } = item;
        const current = await prisma.companyResponsible.findFirst({
          where: { companyId, userId: id, sector: sector || null },
        });

        if (current) {
          if (newUserId) {
            const alreadyAssigned = await prisma.companyResponsible.findFirst({
              where: { companyId, userId: newUserId, sector: sector || null },
            });
            if (alreadyAssigned) {
              await prisma.companyResponsible.delete({ where: { id: current.id } });
            } else {
              await prisma.companyResponsible.update({
                where: { id: current.id },
                data: { userId: newUserId },
              });
            }
            transferredCount++;
          } else {
            // Deixar sem responsável
            await prisma.companyResponsible.delete({ where: { id: current.id } });
          }
        }
      }
    } else if (transferMode === 'NONE') {
      // Remove vínculos deixando sem responsável
      await prisma.companyResponsible.deleteMany({ where: { userId: id } });
    }

    // 3. Log de Auditoria
    const actorUser = actorId ? await prisma.user.findUnique({ where: { id: actorId } }) : null;
    await logAction(
      actorId || null,
      actorUser?.email || '',
      actorUser?.name || 'Administrador',
      'DESLIGOU_USUARIO',
      'USUARIO',
      targetUser.id,
      {
        usuarioDesligado: targetUser.name || targetUser.email,
        emailDesligado: targetUser.email,
        dataSaida: exitDate.toISOString().slice(0, 10),
        motivo: exitReason || 'Não faz mais parte da empresa',
        modoTransferencia: transferMode,
        novoResponsavel: targetUserName,
        empresasTransferidas: transferredCount,
      },
      clientIp
    );

    invalidateAllDataCaches();
    res.json({
      success: true,
      message: 'Colaborador marcado como desligado e empresas reatribuídas com sucesso.',
      transferredCount,
    });
  } catch (error) {
    console.error('Erro ao desligar usuário:', error);
    res.status(500).json({ error: 'Erro ao processar desligamento do usuário' });
  }
});

// Reativar Usuário
app.post('/api/users/:id/rehire', async (req, res) => {
  const clientIp = getClientIp(req);
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Apenas Administradores e Sócios autenticados podem reativar colaboradores.' });
    }

    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (actor.role === 'SOCIO' && (user.role === 'ADMIN' || user.role === 'SOCIO')) {
      return res.status(403).json({ error: 'Sócios não podem reativar administradores ou outros sócios.' });
    }

    await prisma.user.update({
      where: { id },
      data: {
        active: true,
        leftAt: null,
        exitReason: null,
      },
    });

    void logAction(
      actor.id,
      actor.email,
      actor.name || 'Administrador',
      'REATIVOU_USUARIO',
      'USUARIO',
      user.id,
      {
        usuarioReativado: user.name || user.email,
        emailReativado: user.email,
        reativadoPor: actor.email,
      },
      clientIp
    );

    invalidateAllDataCaches();
    res.json({ success: true, message: 'Usuário reativado com sucesso.' });
  } catch (error) {
    console.error('Erro ao reativar usuário:', error);
    res.status(500).json({ error: 'Erro ao reativar usuário' });
  }
});

// Deletar Usuário (Restrito a Administradores e Sócios autenticados com validação de hierarquia)
app.delete('/api/users/:id', async (req, res) => {
  try {
    const actor = await resolveAuthenticatedUser(prisma, req);
    if (!actor || !isPrivilegedUser(actor)) {
      return res.status(403).json({ error: 'Apenas Administradores e Sócios autenticados podem excluir usuários.' });
    }

    const { id } = req.params;
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (actor.id === id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
    }

    if (actor.role === 'SOCIO' && (targetUser.role === 'ADMIN' || targetUser.role === 'SOCIO')) {
      return res.status(403).json({ error: 'Sócios não podem excluir administradores ou outros sócios.' });
    }

    await prisma.user.delete({ where: { id } });
    invalidateAllDataCaches();

    void logAction(
      actor.id,
      actor.email,
      actor.name || actor.email,
      'EXCLUIU_USUARIO',
      'USUARIO',
      id,
      { email: targetUser.email, name: targetUser.name, role: targetUser.role },
      getClientIp(req)
    );

    res.json({ success: true, message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
});

// ========================
// 5. COLUNAS DINÂMICAS DOS SETORES
// ========================
app.get('/api/columns', async (req, res) => {
  try {
    const columns = await prisma.departmentColumn.findMany({
      orderBy: { orderIndex: 'asc' },
    });
    res.json(columns.map((col: any) => ({ ...col, columnKey: resolveColumnKey(col) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar colunas' });
  }
});

app.post('/api/columns', async (req, res) => {
  try {
    const { department, name, inputType = 'TEXT', replicates = false, countsProgress = false, isEditable = true, orderIndex, popupConfig, visibilityConfig, fieldConfig, isActive } = req.body;
    if (fieldConfig !== undefined) { const error = validateFieldConfig(fieldConfig); if (error) return res.status(400).json({ error }); }
    if (inputType === 'SELECT' && !effectiveFieldConfig({ department, name, fieldConfig }).options.length) return res.status(400).json({ error: 'Informe as opções da lista.' });
    if (visibilityConfig !== undefined) { const error = validateVisibility(visibilityConfig); if (error) return res.status(400).json({ error }); }
    if (popupConfig !== undefined) { const error = validatePopup(popupConfig); if (error) return res.status(400).json({ error }); }

    if (!department || !name) {
      return res.status(400).json({ error: 'Departamento e Nome são obrigatórios' });
    }

    let nextOrder = orderIndex;
    if (nextOrder === undefined) {
      const last = await prisma.departmentColumn.findFirst({
        where: { department },
        orderBy: { orderIndex: 'desc' },
      });
      nextOrder = (last?.orderIndex ?? 0) + 1;
    }

    const key = resolveColumnKey({ department, name, inputType });
    if (key) {
      const existing = await prisma.departmentColumn.findMany({ where: { department } });
      if (existing.some((col: any) => resolveColumnKey(col) === key)) return res.status(400).json({ error: 'Já existe uma coluna vinculada a este campo do setor.' });
    }
    const column = await prisma.departmentColumn.create({
      data: {
        department,
        name,
        inputType,
        columnKey: key,
        isActive: isActive !== false,
        ...(fieldConfig !== undefined ? { fieldConfig } : {}),
        ...(visibilityConfig !== undefined ? { visibilityConfig } : {}),
        ...(popupConfig !== undefined ? { popupConfig } : {}),
        replicates: Boolean(replicates),
        countsProgress: Boolean(countsProgress),
        isEditable: Boolean(isEditable),
        orderIndex: Number(nextOrder),
      },
    });

    invalidateDashboardCache();
    res.status(201).json(column);
  } catch (error) {
    console.error('Erro ao criar coluna:', error);
    res.status(500).json({ error: 'Erro ao criar coluna' });
  }
});

app.put('/api/columns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { department, name, inputType, replicates, countsProgress, isEditable, orderIndex, popupConfig, visibilityConfig, fieldConfig, isActive } = req.body;
    const existing = await prisma.departmentColumn.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Coluna não encontrada.' });
    const stableKey = resolveColumnKey(existing);
    if(existing.department==='CONTABIL'&&stableKey){
      const template=ACCOUNTING_COLUMNS.find(column=>column.key===stableKey);
      if(department!==undefined&&department!=='CONTABIL')return res.status(400).json({error:'Mantenha o setor Contábil deste campo anual.'});
      if(template&&inputType!==undefined&&inputType!==template.inputType)return res.status(400).json({error:'Mantenha o tipo original deste campo contábil.'});
    }

    if (['FISCAL','CUSHMAN'].includes(existing.department) && stableKey && existing.inputType === 'POPUP' && ((department !== undefined && department !== existing.department) || (inputType !== undefined && inputType !== 'POPUP'))) return res.status(400).json({ error: 'Mantenha o setor e o tipo Popup desta obrigação para preservar seus dados.' });
    if (visibilityConfig !== undefined) { const error = validateVisibility(visibilityConfig); if (error) return res.status(400).json({ error }); }
    if (popupConfig !== undefined) { const error = validatePopup(popupConfig); if (error) return res.status(400).json({ error }); }

    if (fieldConfig !== undefined) { const error = validateFieldConfig(fieldConfig); if (error) return res.status(400).json({ error }); }
    if ((inputType ?? existing.inputType) === 'SELECT' && !effectiveFieldConfig({ ...existing, fieldConfig: fieldConfig ?? existing.fieldConfig }).options.length) return res.status(400).json({ error: 'Informe as opções da lista.' });
    if (existing.department === 'DP' && stableKey) {
      if (department !== undefined && department !== 'DP') return res.status(400).json({ error: 'Mantenha esta coluna no DP para preservar seus dados.' });
      const fixedTypes: Record<string,string> = { dp_reinf_fiscal: 'READONLY', dp_qtde_funcionarios: 'NUMBER', dp_sd_senha: 'PASSWORD' };
      if (fixedTypes[stableKey] && inputType !== undefined && inputType !== fixedTypes[stableKey]) return res.status(400).json({ error: 'O tipo desta coluna DP precisa ser preservado.' });
      if (stableKey === 'dp_reinf_fiscal' && (isEditable === true || countsProgress === true || replicates === true)) return res.status(400).json({ error: 'REINF do Fiscal deve permanecer somente leitura, sem progresso ou replicação no DP.' });
    }
    const data: any = {};
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (fieldConfig !== undefined) data.fieldConfig = fieldConfig;
    const nextKey = stableKey || resolveColumnKey({ ...existing, department: department ?? existing.department, inputType: inputType ?? existing.inputType, name: name ?? existing.name });
    if (nextKey) {
      const others = await prisma.departmentColumn.findMany({ where: { department: department ?? existing.department, id: { not: id } } });
      if (others.some((col: any) => resolveColumnKey(col) === nextKey)) return res.status(400).json({ error: 'Já existe uma coluna vinculada a este campo do setor.' });
      data.columnKey = nextKey;
    }
    if (visibilityConfig !== undefined) data.visibilityConfig = visibilityConfig;
    if (popupConfig !== undefined) data.popupConfig = popupConfig;
    if (department !== undefined) data.department = department;
    if (name !== undefined) data.name = name;
    if (inputType !== undefined) data.inputType = inputType;
    if (replicates !== undefined) data.replicates = Boolean(replicates);
    if (countsProgress !== undefined) data.countsProgress = Boolean(countsProgress);
    if (isEditable !== undefined) data.isEditable = Boolean(isEditable);
    if (orderIndex !== undefined) data.orderIndex = Number(orderIndex);

    const column = await prisma.departmentColumn.update({
      where: { id },
      data,
    });

    if (column.department === 'CONTABIL' && column.columnKey?.startsWith('cont_mes_') && data.fieldConfig !== undefined) {
      await prisma.departmentColumn.updateMany({
        where: { department: 'CONTABIL', columnKey: { startsWith: 'cont_mes_' }, id: { not: column.id } },
        data: { fieldConfig: data.fieldConfig }
      });
    }

    invalidateDashboardCache();
    res.json(column);
  } catch (error) {
    console.error('Erro ao atualizar coluna:', error);
    res.status(500).json({ error: 'Erro ao atualizar coluna' });
  }
});

app.delete('/api/columns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.departmentColumn.delete({ where: { id } });
    invalidateDashboardCache();
    broadcastRealtimeEvent('COLUMNS_CHANGED', { columnId: id });
    res.json({ success: true, message: 'Coluna excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir coluna:', error);
    res.status(500).json({ error: 'Erro ao excluir coluna' });
  }
});

// Reordenar colunas
app.post('/api/columns/reorder', async (req, res) => {
  try {
    const { columnIds } = req.body; // array ordenado de IDs
    if (!Array.isArray(columnIds)) {
      return res.status(400).json({ error: 'columnIds deve ser um array' });
    }

    await Promise.all(
      columnIds.map((id: any, idx: number) =>
        typeof id === 'string' && id
          ? prisma.departmentColumn.update({
              where: { id },
              data: { orderIndex: idx + 1 },
            }).catch((e: any) => console.warn(`Falha ao reordenar coluna ${id}:`, e.message))
          : Promise.resolve()
      )
    );

    invalidateDashboardCache();
    broadcastRealtimeEvent('COLUMNS_CHANGED', {});
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao reordenar colunas:', error);
    res.status(500).json({ error: 'Erro ao reordenar colunas' });
  }
});

async function runAutomaticRollover() {
  try {
    await syncLatestCompetenceFromDb();
    lastCompetenceBgSync = Date.now();
    const result = await rolloverEngine.ensureAutomatic();
    await accountingEngine.ensureAutomatic();
    if (result.createdCount || result.replicatedColsCount) console.log('[Competências automáticas]', result);
    await syncAllFutureClosingsWithAnteriorReplicables(prisma, pool);
  } catch(error) { console.error('Falha na abertura automática; será tentada novamente:', error); }
}

async function warmServerCaches() {
  try {
    await syncLatestCompetenceFromDb();
    lastCompetenceBgSync = Date.now();
    const openPeriod = latestOpenPeriod();
    await Promise.all([
      getAppConfigPayload(),
      cachedDepartmentColumns(),
      cachedDistinctPeriods(),
      fetchFormattedCompanies(),
      computeDashboardPayload(openPeriod),
    ]);
  } catch (err) {
    console.warn('Warmup inicial de cache ignorado:', err);
  }
}

const distPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// Assets com hash no nome (/assets/*) são cacheados de forma imutável por 1 ano
app.use('/assets', express.static(path.join(distPath, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

// Arquivos estáticos gerais com validação e sem cache no index.html
const staticOptions = {
  maxAge: '1h',
  setHeaders: (res: express.Response, filePath: string) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
};

app.use(express.static(distPath, staticOptions));
app.use('/sistema', express.static(distPath, staticOptions));

// Fallback do SPA para rotas do frontend
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/sistema/api')) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(distPath, 'index.html'), (err) => { if (err) next(); });
});

// Resposta 404 JSON estruturada para qualquer rota de API não encontrada (evita retornar HTML)
app.use(['/api', '/sistema/api'], (req, res) => {
  res.status(404).json({ error: `Endpoint não encontrado: ${req.method} ${req.originalUrl}` });
});

// No Azure App Service Linux, Azure passa WEBSITES_PORT ou PORT (normalmente 8080).
// Se PORT for 33306 (porta de MySQL herdada), ignoramos e usamos a porta web padrão 8080/3001.
const rawPort = process.env.WEBSITES_PORT || process.env.PORT || process.env.API_PORT;
const apiPort = Number(rawPort && Number(rawPort) !== 33306 ? rawPort : 8080);
app.listen(apiPort, '0.0.0.0', () => {
  void warmServerCaches().then(() => runAutomaticRollover());
  setInterval(() => { void runAutomaticRollover(); }, 10 * 60_000).unref();
  console.log(`API Server running on port ${apiPort}`);
});
