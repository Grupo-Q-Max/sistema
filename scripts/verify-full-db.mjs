import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';

async function verifyDb() {
  const url = new URL(process.env.DATABASE_URL);
  const pool = mariadb.createPool({
    host: url.hostname,
    port: parseInt(url.port, 10) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    dateStrings: true,
    connectionLimit: 2
  });
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(pool) });

  try {
    console.log('--- 📊 RELATÓRIO DE INTEGRIDADE DO BANCO DE DADOS ---');

    // 1. Usuários
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { active: true } });
    const rolesGroup = await prisma.user.groupBy({ by: ['role'], _count: { id: true } });
    console.log(`\n👥 USUÁRIOS:`);
    console.log(`   - Total no banco: ${totalUsers} (${activeUsers} ativos)`);
    console.table(rolesGroup.map(r => ({ Perfil: r.role, Total: r._count.id })));

    // 2. Empresas
    const totalCompanies = await prisma.company.count();
    const companiesWithLeadingZeros = await prisma.company.count({
      where: { code: { startsWith: '0' } }
    });
    const withCityLogin = await prisma.company.count({
      where: { cityHallLogin: { not: null } }
    });
    const withSdLogin = await prisma.company.count({
      where: { sdLogin: { not: null } }
    });
    const withGinfess = await prisma.company.count({
      where: { ginfessPassword: { not: null } }
    });
    const withTargetProxy = await prisma.company.count({
      where: { targetProxyDate: { not: null } }
    });
    console.log(`\n🏢 EMPRESAS:`);
    console.log(`   - Total de empresas cadastradas: ${totalCompanies}`);
    console.log(`   - Códigos com zeros à esquerda preservados (ex: 0010, 0006): ${companiesWithLeadingZeros}`);
    console.log(`   - Com Login Prefeitura integrado: ${withCityLogin}`);
    console.log(`   - Com SD Login integrado: ${withSdLogin}`);
    console.log(`   - Com Senha Ginfess criptografada (AES-256): ${withGinfess}`);
    console.log(`   - Com Procuração Target cadastrada: ${withTargetProxy}`);

    // 3. Responsáveis
    const totalResp = await prisma.companyResponsible.count();
    const respBySector = await prisma.companyResponsible.groupBy({
      by: ['sector'],
      _count: { id: true }
    });
    console.log(`\n🤝 VÍNCULOS DE RESPONSÁVEIS:`);
    console.log(`   - Total de atribuições ativas: ${totalResp}`);
    console.table(respBySector.map(s => ({ Setor: s.sector, Atribuições: s._count.id })));

    // 4. Fechamentos
    const totalClosings = await prisma.closing.count();
    const closings202610 = await prisma.closing.count({
      where: { referencePeriod: new Date('2026-10-01T00:00:00.000Z') }
    });
    console.log(`\n📅 FECHAMENTOS:`);
    console.log(`   - Total geral de fechamentos no histórico: ${totalClosings}`);
    console.log(`   - Fechamentos consolidados na competência aberta (10/2026): ${closings202610}`);

    // 5. Test Companies Check
    const testCheck = await prisma.company.findMany({
      where: {
        OR: [
          { name: { contains: 'GOOGLE' } },
          { name: { contains: 'MERCADO GOB' } },
          { name: { contains: 'Padaria Central' } }
        ]
      }
    });
    console.log(`\n🧹 LIMPEZA DE EMPRESAS DE TESTE:`);
    console.log(`   - Empresas de teste encontradas: ${testCheck.length} (esperado: 0)`);

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

verifyDb().catch(console.error);

