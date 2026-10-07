import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {PrismaMariaDb} from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
const url=new URL(process.env.DATABASE_URL||'');
const pool=mariadb.createPool({host:url.hostname,port:Number(url.port)||3306,user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:url.pathname.slice(1),connectionLimit:2});
const prisma=new PrismaClient({adapter:new PrismaMariaDb(pool as any)}) as any;
try{
 const fields=await prisma.$queryRawUnsafe('SHOW FULL COLUMNS FROM `Company`');const collation=fields.find((field:any)=>field.Field==='id')?.Collation||'utf8mb4_unicode_ci';if(!/^[a-zA-Z0-9_]+$/.test(collation))throw new Error('Collation do cadastro inválida.');const suffix=`ENGINE=InnoDB DEFAULT CHARACTER SET ${collation.split('_')[0]} COLLATE ${collation}`;
 const definitions=[
  'CREATE TABLE IF NOT EXISTS `InstallmentType` (`id` VARCHAR(191) NOT NULL,`name` VARCHAR(191) NOT NULL,`nameKey` VARCHAR(191) NOT NULL,`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY (`id`),UNIQUE KEY `InstallmentType_nameKey_key` (`nameKey`))',
  'CREATE TABLE IF NOT EXISTS `InstallmentPlan` (`id` VARCHAR(191) NOT NULL,`companyId` VARCHAR(191) NOT NULL,`typeName` VARCHAR(191) NOT NULL,`totalAmount` DECIMAL(14,2) NOT NULL,`status` VARCHAR(191) NOT NULL DEFAULT \'ATIVO\',`installmentCount` INTEGER NOT NULL,`startsAt` DATE NOT NULL,`endsAt` DATE NOT NULL,`responsibleId` VARCHAR(191) NULL,`lateMode` VARCHAR(191) NULL,`lateMonthOffset` INTEGER NULL,`dueDay` INTEGER NULL,`dueMonthOffset` INTEGER NULL,`createdById` VARCHAR(191) NULL,`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),`updatedAt` DATETIME(3) NOT NULL,PRIMARY KEY (`id`),KEY `InstallmentPlan_companyId_idx` (`companyId`),CONSTRAINT `InstallmentPlan_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE)',
  'CREATE TABLE IF NOT EXISTS `InstallmentPayment` (`id` VARCHAR(191) NOT NULL,`planId` VARCHAR(191) NOT NULL,`installmentNumber` INTEGER NOT NULL,`status` VARCHAR(191) NOT NULL DEFAULT \'PENDING\',`paidOn` DATE NULL,`paidAmount` DECIMAL(14,2) NULL,`note` TEXT NULL,`updatedById` VARCHAR(191) NULL,`updatedAt` DATETIME(3) NOT NULL,PRIMARY KEY (`id`),UNIQUE KEY `InstallmentPayment_planId_installmentNumber_key` (`planId`,`installmentNumber`),CONSTRAINT `InstallmentPayment_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `InstallmentPlan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE)',
  'CREATE TABLE IF NOT EXISTS `InstallmentEvent` (`id` VARCHAR(191) NOT NULL,`planId` VARCHAR(191) NOT NULL,`installmentNumber` INTEGER NULL,`action` VARCHAR(191) NOT NULL,`actorId` VARCHAR(191) NOT NULL,`data` JSON NOT NULL,`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),PRIMARY KEY (`id`),KEY `InstallmentEvent_planId_createdAt_idx` (`planId`,`createdAt`),CONSTRAINT `InstallmentEvent_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `InstallmentPlan` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE)',
  'CREATE TABLE IF NOT EXISTS `InstallmentSetting` (`id` VARCHAR(191) NOT NULL,`lateMode` VARCHAR(191) NOT NULL DEFAULT \'MONTH_TURN\',`lateMonthOffset` INTEGER NOT NULL DEFAULT 2,`dueDay` INTEGER NOT NULL DEFAULT 20,`dueMonthOffset` INTEGER NOT NULL DEFAULT 1,`updatedAt` DATETIME(3) NOT NULL,PRIMARY KEY (`id`))',
 ];
 for(const definition of definitions)await prisma.$executeRawUnsafe(`${definition} ${suffix}`);
 await prisma.installmentSetting.upsert({where:{id:'global'},create:{id:'global'},update:{}});
 if(!process.env.APP_SESSION_SECRET){const file='.env';const original=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';fs.writeFileSync(file,original.replace(/^APP_SESSION_SECRET\s*=.*(?:\r?\n|$)/gm,'')+`\nAPP_SESSION_SECRET=${crypto.randomBytes(48).toString('hex')}\n`,'utf8');}
 console.log('Parcelamentos preparados. Nenhum dado existente foi apagado. Reinicie a API e renove o login.');
}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}finally{await prisma.$disconnect();await pool.end();}
