import fs from 'node:fs';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import { configureCushman } from './cushman-seed';
const url = new URL(process.env.DATABASE_URL || '');
const pool = mariadb.createPool({ host:url.hostname,port:Number(url.port)||3306,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),connectionLimit:2 });
const prisma = new PrismaClient({adapter:new PrismaMariaDb(pool as any)}) as any;
try {
  const backupIndex=process.argv.indexOf('--backup-path');
  if(backupIndex>=0){const path=process.argv[backupIndex+1];if(!path)throw new Error('Informe o caminho do backup.');const [columns,closings]=await Promise.all([prisma.departmentColumn.findMany({where:{department:'CUSHMAN'}}),prisma.closing.findMany({where:{type:'CUSHMAN'}})]);fs.writeFileSync(path,JSON.stringify({savedAt:new Date().toISOString(),columns,closings},null,2),{encoding:'utf8',flag:'wx'});console.log('Backup do histórico e das colunas Cushman salvo.');}
  const result=await prisma.$transaction((tx:any)=>configureCushman(tx),{timeout:120000});
  console.log(`Cushman configurado: ${result.created} colunas criadas, ${result.adapted} adaptadas, ${result.hidden} padrões antigos ocultados e ${result.migrated} fechamentos preservados/migrados.`);
} catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
finally{await prisma.$disconnect();await pool.end();}
