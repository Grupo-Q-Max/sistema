import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');

export interface BackupMetadata {
  filename: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  recordsCount: Record<string, number>;
  totalRecords: number;
}

export function ensureBackupDirectory(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Realiza backup completo de todas as entidades do sistema em formato comprimido .json.gz
 */
export async function createDatabaseBackup(prisma: any, triggeredBy = 'SISTEMA'): Promise<BackupMetadata> {
  ensureBackupDirectory();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-fechamento-${timestamp}.json.gz`;
  const filePath = path.join(BACKUP_DIR, filename);

  const [
    users,
    userSectorPermissions,
    userScreenPermissions,
    userCompanyAccess,
    companyResponsibles,
    companies,
    departmentColumns,
    closings,
    installmentTypes,
    installmentPlans,
    installmentPayments,
    installmentEvents,
    installmentSettings,
    systemLogs,
    automationTasks,
    appConfigs,
    dominioStagingChanges,
    competenceSnapshots,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.userSectorPermission.findMany(),
    prisma.userScreenPermission.findMany(),
    prisma.userCompanyAccess.findMany(),
    prisma.companyResponsible.findMany(),
    prisma.company.findMany(),
    prisma.departmentColumn.findMany(),
    prisma.closing.findMany(),
    prisma.installmentType.findMany(),
    prisma.installmentPlan.findMany(),
    prisma.installmentPayment.findMany(),
    prisma.installmentEvent.findMany(),
    prisma.installmentSetting.findMany(),
    prisma.systemLog.findMany({ take: 50000, orderBy: { createdAt: 'desc' } }), // últimos 50k logs
    prisma.automationTask.findMany(),
    prisma.appConfig.findMany(),
    prisma.dominioStagingChange.findMany(),
    prisma.competenceSnapshot.findMany(),
  ]);

  const recordsCount: Record<string, number> = {
    users: users.length,
    userSectorPermissions: userSectorPermissions.length,
    userScreenPermissions: userScreenPermissions.length,
    userCompanyAccess: userCompanyAccess.length,
    companyResponsibles: companyResponsibles.length,
    companies: companies.length,
    departmentColumns: departmentColumns.length,
    closings: closings.length,
    installmentTypes: installmentTypes.length,
    installmentPlans: installmentPlans.length,
    installmentPayments: installmentPayments.length,
    installmentEvents: installmentEvents.length,
    installmentSettings: installmentSettings.length,
    systemLogs: systemLogs.length,
    automationTasks: automationTasks.length,
    appConfigs: appConfigs.length,
    dominioStagingChanges: dominioStagingChanges.length,
    competenceSnapshots: competenceSnapshots.length,
  };

  const totalRecords = Object.values(recordsCount).reduce((acc, curr) => acc + curr, 0);

  const payload = {
    version: 'fechamento-pro-v2',
    createdAt: new Date().toISOString(),
    triggeredBy,
    totalRecords,
    recordsCount,
    data: {
      users,
      userSectorPermissions,
      userScreenPermissions,
      userCompanyAccess,
      companyResponsibles,
      companies,
      departmentColumns,
      closings,
      installmentTypes,
      installmentPlans,
      installmentPayments,
      installmentEvents,
      installmentSettings,
      systemLogs,
      automationTasks,
      appConfigs,
      dominioStagingChanges,
      competenceSnapshots,
    },
  };

  const jsonString = JSON.stringify(payload);
  const compressed = zlib.gzipSync(Buffer.from(jsonString, 'utf-8'));
  fs.writeFileSync(filePath, compressed);

  const stats = fs.statSync(filePath);

  // Registrar auditoria
  try {
    await prisma.systemLog.create({
      data: {
        action: 'DATABASE_BACKUP_CREATED',
        details: `Backup '${filename}' gerado com sucesso por ${triggeredBy}. Total de registros: ${totalRecords} (${formatBytes(stats.size)}).`,
        companyName: 'SISTEMA',
        closingType: 'FISCAL',
      },
    });
  } catch (err) {
    console.error('Erro ao registrar log do backup:', err);
  }

  // Executar limpeza de backups antigos (> 30 dias)
  cleanOldBackups(30);

  return {
    filename,
    sizeBytes: stats.size,
    sizeFormatted: formatBytes(stats.size),
    createdAt: new Date().toISOString(),
    recordsCount,
    totalRecords,
  };
}

/**
 * Lista todos os backups locais existentes
 */
export function listDatabaseBackups(): BackupMetadata[] {
  ensureBackupDirectory();

  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('backup-') && f.endsWith('.json.gz'));
  const backups: BackupMetadata[] = [];

  for (const file of files) {
    try {
      const fullPath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(fullPath);
      backups.push({
        filename: file,
        sizeBytes: stat.size,
        sizeFormatted: formatBytes(stat.size),
        createdAt: stat.mtime.toISOString(),
        recordsCount: {},
        totalRecords: 0,
      });
    } catch {
      // Ignorar arquivo corrompido ou inacessível
    }
  }

  return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Remove backups com mais de X dias
 */
export function cleanOldBackups(daysToKeep = 30): number {
  ensureBackupDirectory();
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('backup-') && f.endsWith('.json.gz'));
  const maxAgeMs = daysToKeep * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deletedCount = 0;

  for (const file of files) {
    try {
      const fullPath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.unlinkSync(fullPath);
        deletedCount++;
      }
    } catch {
      // Ignorar erro ao tentar remover arquivo específico
    }
  }

  return deletedCount;
}

/**
 * Inicia o agendador de backup diário às 03:00 da madrugada
 */
let dailyBackupTimer: NodeJS.Timeout | null = null;
export function initDailyBackupScheduler(prisma: any): void {
  if (dailyBackupTimer) return;

  const scheduleNext = () => {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0, 0); // 03:00:00 hoje
    if (now >= target) {
      target.setDate(target.getDate() + 1); // se já passou das 03:00 hoje, agenda para amanhã às 03:00
    }

    const delayMs = target.getTime() - now.getTime();
    dailyBackupTimer = setTimeout(async () => {
      try {
        console.log('[BACKUP DIÁRIO] Iniciando rotina automática de backup às 03:00...');
        await createDatabaseBackup(prisma, 'ROTINA_DIARIA_AUTOMATICA');
        console.log('[BACKUP DIÁRIO] Backup concluído com sucesso.');
      } catch (err) {
        console.error('[BACKUP DIÁRIO] Falha ao executar backup diário:', err);
      } finally {
        scheduleNext();
      }
    }, delayMs);
  };

  scheduleNext();
}
