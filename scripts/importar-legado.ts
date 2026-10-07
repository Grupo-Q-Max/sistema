import 'dotenv/config';
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
import {PrismaClient} from '@prisma/client';import {PrismaMariaDb} from '@prisma/adapter-mariadb';import mariadb from 'mariadb';
import {readLegacyDump} from './legacy/sqlDump';import {makePlan,importLegacy} from './legacy/importEngine';
const args=process.argv.slice(2);const arg=(name:string)=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const input=arg('--file'),year=Number(arg('--year')||2026),apply=args.includes('--apply');
if(!input||!Number.isInteger(year)||year<1900||year>9999)throw Error('Use --file arquivo.sql --year 2026 [--apply].');
const sql=await fs.readFile(input,'utf8');const plan=makePlan(readLegacyDump(sql),year);const url=new URL(process.env.DATABASE_URL||'');
const pool=mariadb.createPool({host:url.hostname,port:Number(url.port)||3306,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),connectionLimit:2});const prisma=new PrismaClient({adapter:new PrismaMariaDb(pool as any)}) as any;
const key=crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY||'fechamento-target-super-secret-key-32b!').digest();
function seal(value:string){const iv=crypto.randomBytes(16),cipher=crypto.createCipheriv('aes-256-cbc',key,iv);return `enc:${iv.toString('hex')}:${cipher.update(value,'utf8','hex')+cipher.final('hex')}`;}
const protect=(value:any)=>value===null||value===undefined||value===''?null:seal(String(value));
const directory=path.resolve('relatorios_importacao',new Date().toISOString().replace(/[:.]/g,'-')+(apply?'_aplicacao':'_simulacao'));await fs.mkdir(directory,{recursive:true});
try{
 const existing=await prisma.company.findMany();const closings=await prisma.closing.findMany();const columns=await prisma.departmentColumn.findMany();
 if(apply)await fs.writeFile(path.join(directory,'backup-antes.json'),JSON.stringify({version:1,inputSha256:crypto.createHash('sha256').update(sql).digest('hex'),companies:existing,closings,columns}),{mode:0o600});
 const result=await importLegacy(prisma,plan,{apply,protect,archive:value=>seal(JSON.stringify(value)),journal:async value=>{await fs.appendFile(path.join(directory,'journal.jsonl'),JSON.stringify(value)+'\n',{mode:0o600});}});
 await fs.writeFile(path.join(directory,'relatorio.json'),JSON.stringify(result,null,2));
 const rows=[['Documento','Empresa','Cadastro existente','Pendências'],...result.companies.map((item:any)=>[item.document,item.name,item.existing?'Sim':'Não',item.issues.map((issue:any)=>issue.label).join(' | ')])];const csv=rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(';')).join('\r\n');await fs.writeFile(path.join(directory,'pendencias.csv'),'\ufeff'+csv);
 console.log(JSON.stringify(result.stats,null,2));console.log(`Relatório: ${directory}`);console.log(apply?'Importação concluída. Reinicie a API e acesse Avisos de cadastro.':'Simulação concluída. Nenhum dado foi gravado no banco.');
}catch(error){await fs.writeFile(path.join(directory,'erro.txt'),error instanceof Error?(error.stack||error.message):'Falha na importação.');console.error(error instanceof Error?(error.stack||error.message):'Falha na importação.');console.error(`Relatórios e backup: ${directory}`);process.exitCode=1;}
finally{await prisma.$disconnect();await pool.end();}
