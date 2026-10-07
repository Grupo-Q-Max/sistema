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
  connectionLimit: 3,
});

const adapter = new PrismaMariaDb(pool as any);
const prisma = new PrismaClient({ adapter }) as any;

async function main() {
  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${companies.length} companies.`);

  let index = 1;
  for (const c of companies) {
    const formattedCode = String(index).padStart(3, '0');
    await prisma.company.update({
      where: { id: c.id },
      data: {
        code: c.code || formattedCode,
        groupName: c.groupName || 'Grupo Principal',
        city: c.city || 'São Paulo',
        stateRegistration: c.stateRegistration || '123.456.789.000',
        municipalRegistration: c.municipalRegistration || '987654-0',
        cityHallLogin: c.cityHallLogin || `login_${formattedCode}`,
        cityHallLink: c.cityHallLink || 'https://nfe.prefeitura.sp.gov.br',
        companyType: c.companyType || 'Serviço',
        deliveryMethod: c.deliveryMethod || 'E-mail',
      },
    });
    console.log(`Updated ${c.name} -> Code: ${c.code || formattedCode}`);
    index++;
  }

  await prisma.$disconnect();
  await pool.end();
  console.log('Finished updating company codes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
