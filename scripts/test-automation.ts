import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import 'dotenv/config';

const url = new URL(process.env.DATABASE_URL || '');
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
  console.log('Criando tarefa de teste para o robô...');
  
  // Pegamos a primeira empresa ativa para simular
  const company = await prisma.company.findFirst({
    where: { activeSectors: { contains: 'FISCAL' } }
  });

  if (!company) {
    console.log('Nenhuma empresa encontrada para teste.');
    return;
  }

  const task = await prisma.automationTask.create({
    data: {
      taskType: 'DOWNLOAD_DAS',
      status: 'PENDING',
      companyId: company.id,
      payload: { mes_referencia: '09/2026' }
    }
  });

  console.log(`Tarefa criada com sucesso! ID: ${task.id}`);
  console.log('Olhe no terminal do Python, ele deve pegar essa tarefa nos próximos 10 segundos!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
