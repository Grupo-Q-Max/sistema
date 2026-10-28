import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';

async function checkDpColumns() {
  const url = new URL(process.env.DATABASE_URL);
  const pool = mariadb.createPool({
    host: url.hostname,
    port: parseInt(url.port, 10) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    dateStrings: true,
    connectionLimit: 2
  });
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(pool) });

  try {
    const cols = await prisma.departmentColumn.findMany({
      where: { department: 'DP' },
      orderBy: { orderIndex: 'asc' }
    });
    console.table(cols.map(c => ({
      id: c.id,
      name: c.name,
      columnKey: c.columnKey,
      inputType: c.inputType,
      replicates: c.replicates,
      countsProgress: c.countsProgress
    })));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

checkDpColumns().catch(console.error);

