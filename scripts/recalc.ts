import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import 'dotenv/config';
import { calculateColumnProgress, isColumnActive } from '../src/config/columnVisibility';
import { resolveColumnKey } from '../src/config/payrollColumns';

const connectionString = process.env.DATABASE_URL || '';
const url = new URL(connectionString);
const pool = mariadb.createPool({
  host: url.hostname,
  port: parseInt(url.port, 10) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
});

const adapter = new PrismaMariaDb(pool as any);
const prisma = new PrismaClient({ adapter }) as any;

async function run() {
  const types = ['DP', 'FISCAL', 'CUSHMAN'];
  for (const type of types) {
    const columns = await prisma.departmentColumn.findMany({ where: { department: type } });
    const closings = await prisma.closing.findMany({ where: { type } });
    
    let updated = 0;
    for (const closing of closings) {
      const activeColumns = columns.filter((col: any) => isColumnActive(col, new Date(closing.referencePeriod)));
      const progressColumns = activeColumns.filter((col: any) => col.countsProgress);
      const data = closing.columnsData || {};
      
      const progress = calculateColumnProgress(progressColumns, data, (col: any) => resolveColumnKey(col) || col.columnKey || col.id);
      
      if (progress.calculatedStatus !== closing.status) {
        await prisma.closing.update({
          where: { id: closing.id },
          data: { status: progress.calculatedStatus }
        });
        updated++;
      }
    }
    console.log(`${type}: Updated ${updated} closings`);
  }
  process.exit(0);
}

run().catch(console.error);
