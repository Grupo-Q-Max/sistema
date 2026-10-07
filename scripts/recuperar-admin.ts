import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {PrismaClient} from '@prisma/client';
import {PrismaMariaDb} from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
const url=new URL(process.env.DATABASE_URL||'');
const pool=mariadb.createPool({host:url.hostname,port:Number(url.port)||3306,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),connectionLimit:2});
const prisma=new PrismaClient({adapter:new PrismaMariaDb(pool as any)});
try {
 if(process.argv.includes('--list')){
  const admins=await prisma.user.findMany({where:{role:'ADMIN'},select:{id:true,email:true,name:true,active:true},orderBy:{email:'asc'}});
  console.log(JSON.stringify(admins));
 }else if(process.argv.includes('--reset')){
  let raw='';for await(const chunk of process.stdin){raw+=chunk;if(raw.length>16000)throw new Error('Entrada inválida.');}
  const input=JSON.parse(raw);if(typeof input.id!=='string'||typeof input.password!=='string'||input.password.length<8||Buffer.byteLength(input.password,'utf8')>72)throw new Error('Use uma senha de pelo menos 8 caracteres e até 72 bytes.');
  const user=await prisma.user.findUnique({where:{id:input.id}});if(!user||user.role!=='ADMIN')throw new Error('O usuário selecionado não é administrador.');
  const changed=await prisma.user.updateMany({where:{id:user.id,role:'ADMIN'},data:{password:bcrypt.hashSync(input.password,12),active:true}});if(changed.count!==1)throw new Error('Administrador alterado durante a operação. Consulte novamente.');
  console.log(`Senha atualizada e acesso ativo para ${user.email}. Nenhuma outra conta foi alterada.`);
 }else throw new Error('Execute Recuperar-Admin.ps1 na raiz do projeto.');
}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}finally{await prisma.$disconnect();await pool.end();}
