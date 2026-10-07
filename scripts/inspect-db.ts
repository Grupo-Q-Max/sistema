import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import 'dotenv/config';

const url = new URL(process.env.DATABASE_URL || '');
const pool = mariadb.createPool({
  host: url.hostname, port: parseInt(url.port, 10) || 3306,
  user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
  database: url.pathname.slice(1), connectionLimit: 2,
});
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(pool as any) }) as any;

const users = await prisma.user.findMany({ select: { email: true, role: true, password: true } });
for (const u of users) console.log(u.email, u.role, String(u.password).slice(0, 7), String(u.password).length);
const tables = await prisma.$queryRawUnsafe('SHOW TABLES');
console.log(tables);
await prisma.$disconnect();
process.exit(0);
