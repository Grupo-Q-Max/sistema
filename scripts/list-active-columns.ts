import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL || '';
const url = new URL(connectionString);
const pool = mariadb.createPool({
  host: url.hostname,
  port: parseInt(url.port, 10) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 1,
});

const adapter = new PrismaMariaDb(pool as any);
const prisma = new PrismaClient({ adapter }) as any;

async function main() {
  const cols = await prisma.departmentColumn.findMany({
    where: { department: { in: ['FISCAL', 'DP', 'CONTABIL'] } },
    orderBy: [{ department: 'asc' }, { orderIndex: 'asc' }]
  });
  console.log(JSON.stringify(cols.map((c: any) => ({
    dept: c.department,
    name: c.name,
    key: c.columnKey,
    type: c.inputType,
    countsProgress: c.countsProgress
  })), null, 2));
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
  await pool.end();
});
