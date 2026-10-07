import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import { resolveFiscalKey } from '../src/config/fiscalPopups';
const url = new URL(process.env.DATABASE_URL || '');
const pool = mariadb.createPool({ host: url.hostname, port: Number(url.port) || 3306, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), connectionLimit: 2 });
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(pool as any) }) as any;
try {
  const columns = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM `DepartmentColumn`') as { Field: string }[];
  const names = new Set(columns.map(c => c.Field));
  const additions = [];
  if (!names.has('isActive')) additions.push('ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT TRUE');
  if (!names.has('fieldConfig')) additions.push('ADD COLUMN `fieldConfig` JSON NULL');
  if (!names.has('visibilityConfig')) additions.push('ADD COLUMN `visibilityConfig` JSON NULL');
  if (!names.has('columnKey')) additions.push('ADD COLUMN `columnKey` VARCHAR(191) NULL');
  if (!names.has('popupConfig')) additions.push('ADD COLUMN `popupConfig` JSON NULL');
  if (additions.length) await prisma.$executeRawUnsafe('ALTER TABLE `DepartmentColumn` ' + additions.join(', '));
  const definitions = await prisma.departmentColumn.findMany({ where: { department: 'FISCAL' } });
  const seen = new Set<string>();
  for (const column of definitions) {
    const key = resolveFiscalKey(column);
    if (!key) continue;
    if (seen.has(key)) throw new Error(`Há duas colunas vinculadas ao popup ${key}. Corrija a duplicidade antes de testar.`);
    seen.add(key);
  }
  let count = 0;
  for (const column of definitions) {
    const key = resolveFiscalKey(column);
    if (key && !column.columnKey) {
      const result = await prisma.departmentColumn.updateMany({ where: { id: column.id, columnKey: null }, data: { columnKey: key } });
      count += result.count;
    }
  }
  console.log(`Configuração pronta. ${count} chaves estabilizadas. Os modelos originais continuam ativos até você personalizá-los.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  await pool.end();
}
