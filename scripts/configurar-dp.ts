import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import { configurePayroll } from './dp-seed';
const url = new URL(process.env.DATABASE_URL || '');
const pool = mariadb.createPool({ host:url.hostname,port:Number(url.port)||3306,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),connectionLimit:2 });
const prisma = new PrismaClient({adapter:new PrismaMariaDb(pool as any)}) as any;
const encryptionKey=crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || 'fechamento-target-super-secret-key-32b!').digest();
function protectPassword(value:unknown):string {
  if(typeof value!=='string'||!value.trim())return '';
  if(value.startsWith('enc:'))return value;
  const iv=crypto.randomBytes(16);const cipher=crypto.createCipheriv('aes-256-cbc',encryptionKey,iv);
  return `enc:${iv.toString('hex')}:${cipher.update(value,'utf8','hex')+cipher.final('hex')}`;
}
try {
  const result=await prisma.$transaction((tx:any)=>configurePayroll(tx,protectPassword),{timeout:120000});
  console.log(`DP configurado: ${result.created} colunas criadas, ${result.adapted} adaptadas, ${result.hidden} padrões antigos ocultados e ${result.migrated} fechamentos preservados/migrados.`);
} catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
finally{await prisma.$disconnect();await pool.end();}
