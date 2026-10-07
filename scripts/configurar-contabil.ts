import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import { configureAccounting } from './accounting-seed';
const url = new URL(process.env.DATABASE_URL || '');
const pool = mariadb.createPool({ host:url.hostname,port:Number(url.port)||3306,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),connectionLimit:2 });
const prisma = new PrismaClient({adapter:new PrismaMariaDb(pool as any)}) as any;
try {
  const result=await prisma.$transaction((tx:any)=>configureAccounting(tx),{timeout:120000});
  console.log(`Contábil configurado: ${result.created} colunas criadas, ${result.adapted} adaptadas, ${result.hidden} padrões antigos ocultados e ${result.migrated} fechamentos preservados/migrados.`);
} catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
finally{await prisma.$disconnect();await pool.end();}
