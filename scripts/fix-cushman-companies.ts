import 'dotenv/config';
import mariadb from 'mariadb';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const connectionString = process.env.DATABASE_URL || '';
const url = new URL(connectionString);
const useSsl = url.hostname.includes('azure') || url.searchParams.get('ssl') === 'true';
const pool = mariadb.createPool({
  host: url.hostname,
  port: parseInt(url.port, 10) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  dateStrings: true,
  connectionLimit: 2,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});
const adapter = new PrismaMariaDb(pool as any);
const prisma = new PrismaClient({ adapter }) as any;

async function run() {
  console.log('===========================================================');
  console.log('CORREÇÃO DE EMPRESAS INDEVIDAS NO SETOR CUSHMAN');
  console.log('===========================================================');

  const allCushmanCompanies = await prisma.company.findMany({
    where: { activeSectors: { contains: 'CUSHMAN' } },
    select: { id: true, code: true, name: true, taxRegime: true, groupName: true, activeSectors: true },
    orderBy: { code: 'asc' },
  });

  console.log(`\nTotal de empresas com CUSHMAN em activeSectors antes da correção: ${allCushmanCompanies.length}`);

  // Filtra as empresas indevidas (Simples, Presumido, MEI, Grupo Q-MAX que não são condomínios nem associações)
  const invalidCompanies = allCushmanCompanies.filter((c: any) => {
    const isCondoOrAssoc = c.taxRegime === 'CONDOMINIOS' || c.taxRegime === 'ASSOCIACOES';
    const isCode05 = String(c.code || '').startsWith('05');
    const isCushmanNamed = /cushman/i.test(c.groupName || '') || /cushman/i.test(c.name || '');
    return !isCondoOrAssoc && !isCode05 && !isCushmanNamed;
  });

  console.log(`\nIdentificadas ${invalidCompanies.length} empresas indevidas no Cushman:`);
  for (const c of invalidCompanies) {
    console.log(` - [${c.code}] ${c.name} (Regime: ${c.taxRegime} | Grupo: "${c.groupName}") -> Setores atuais: ${c.activeSectors}`);
  }

  const invalidCompanyIds = invalidCompanies.map((c: any) => c.id);

  console.log('\n1. Removendo fechamentos vazios do tipo CUSHMAN dessas empresas...');
  const deletedClosings = await prisma.closing.deleteMany({
    where: {
      type: 'CUSHMAN',
      companyId: { in: invalidCompanyIds },
    },
  });
  console.log(` - Fechamentos CUSHMAN deletados: ${deletedClosings.count}`);

  console.log('\n2. Atualizando activeSectors das empresas para remover o CUSHMAN...');
  let updatedCount = 0;
  for (const c of invalidCompanies) {
    const current = (c.activeSectors || '').split(',').map((s: string) => s.trim().toUpperCase());
    const filtered = current.filter((s: string) => s !== 'CUSHMAN');
    const newActiveSectors = filtered.join(',');

    await prisma.company.update({
      where: { id: c.id },
      data: { activeSectors: newActiveSectors || 'FISCAL,DP,CONTABIL' },
    });
    updatedCount++;
  }
  console.log(` - Empresas atualizadas no banco: ${updatedCount}`);

  // Verificação final
  const finalCushmanCompanies = await prisma.company.findMany({
    where: { activeSectors: { contains: 'CUSHMAN' } },
    select: { id: true, code: true, name: true, taxRegime: true },
  });

  console.log('\n===========================================================');
  console.log(`RESULTADO FINAL:`);
  console.log(`Total legítimo de empresas no setor CUSHMAN: ${finalCushmanCompanies.length}`);
  const finalByRegime = new Map<string, number>();
  for (const c of finalCushmanCompanies) {
    finalByRegime.set(c.taxRegime, (finalByRegime.get(c.taxRegime) || 0) + 1);
  }
  for (const [r, count] of finalByRegime.entries()) {
    console.log(` * ${r}: ${count} empresas`);
  }
  console.log('===========================================================');

  await prisma.$disconnect();
  await pool.end();
}

run().catch(console.error);

