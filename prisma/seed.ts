import { PrismaClient, TaxRegime, Role, ClosingType } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || '';
const url = new URL(connectionString);

const pool = mariadb.createPool({
  host: url.hostname,
  port: parseInt(url.port, 10) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
});

const adapter = new PrismaMariaDb(pool as any);
const prisma = new PrismaClient({ adapter }) as any;

async function main() {
  console.log('Seeding database...');

  // Seed idempotente: NÃO apaga dados existentes, apenas cria o que estiver faltando.
  const users = [
    { email: 'admin@qmax.com', role: 'ADMIN' },
    { email: 'socio@qmax.com', role: 'SOCIO' },
    { email: 'joao.fiscal@qmax.com', role: 'FISCAL' },
    { email: 'maria.dp@qmax.com', role: 'DP' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, password: 'hashed_password_aqui', role: u.role },
    });
  }

  // Criar Colunas Dinâmicas (As Configurações do Fechamento)
  const columns = [
    {
      department: 'FISCAL',
      name: 'Faturamento',
      inputType: 'TEXT',
      replicates: false,
      countsProgress: false,
      isEditable: true,
      orderIndex: 1,
    },
    {
      department: 'FISCAL',
      name: 'Envio de Guias',
      inputType: 'CHECKBOX',
      replicates: false,
      countsProgress: true, // Conta para o progresso do fechamento
      isEditable: true,
      orderIndex: 2,
    },
    {
      department: 'DP',
      name: 'Cálculo de Folha',
      inputType: 'CHECKBOX',
      replicates: false,
      countsProgress: true, // Conta para o progresso do fechamento
      isEditable: true,
      orderIndex: 1,
    },
    {
      department: 'DP',
      name: 'Número de Funcionários',
      inputType: 'TEXT',
      replicates: true, // Replica pro próximo mês
      countsProgress: false,
      isEditable: true,
      orderIndex: 2,
    },
    {
      department: 'CONTABIL',
      name: 'Aviso Importante',
      inputType: 'POPUP',
      replicates: true,
      countsProgress: false,
      isEditable: false,
      orderIndex: 1,
    },
    {
      department: 'PARCELAMENTO',
      name: 'Guia do Parcelamento',
      inputType: 'CHECKBOX',
      replicates: false,
      countsProgress: true, // Conta para o progresso do fechamento
      isEditable: true,
      orderIndex: 1,
    },
  ];

  for (const col of columns) {
    const exists = await prisma.departmentColumn.findFirst({
      where: { department: col.department, name: col.name },
    });
    if (!exists) {
      await prisma.departmentColumn.create({ data: col });
    } else {
      await prisma.departmentColumn.update({
        where: { id: exists.id },
        data: { countsProgress: col.countsProgress },
      });
    }
  }

  // ========================
  // Empresas de teste (datas relativas ao mês atual, normalizadas em UTC)
  // ========================
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = (monthOffset: number, day: number) => new Date(Date.UTC(y, m + monthOffset, day, 0, 0, 0, 0));
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const today = now.getUTCDate();
  // Dia no mês atual que já passou / ainda vai chegar
  const pastDay = Math.max(1, today - 2);
  const futureDay = Math.min(lastDay, today + 3);

  type SeedCompany = {
    name: string; cnpj: string; taxRegime: string;
    contractDate: Date; obligationStartDate: Date; exitDate?: Date | null;
  };

  const companies: SeedCompany[] = [
    // Ativas há tempo
    { name: 'Padaria Pão Dourado Ltda', cnpj: '11.111.111/0001-01', taxRegime: 'SIMPLES_NACIONAL', contractDate: d(-14, 5), obligationStartDate: d(-13, 1) },
    { name: 'Construtora Horizonte S/A', cnpj: '11.111.111/0001-02', taxRegime: 'LUCRO_REAL_TRIMESTRAL', contractDate: d(-30, 10), obligationStartDate: d(-29, 1) },
    { name: 'Clínica Bem Estar', cnpj: '11.111.111/0001-03', taxRegime: 'LUCRO_PRESUMIDO', contractDate: d(-8, 2), obligationStartDate: d(-7, 1) },
    { name: 'João Silva MEI', cnpj: '11.111.111/0001-04', taxRegime: 'MEI', contractDate: d(-5, 15), obligationStartDate: d(-4, 1) },
    { name: 'Condomínio Jardim das Flores', cnpj: '11.111.111/0001-05', taxRegime: 'CONDOMINIOS', contractDate: d(-24, 1), obligationStartDate: d(-24, 1) },
    { name: 'Associação Amigos do Bairro', cnpj: '11.111.111/0001-06', taxRegime: 'ASSOCIACOES', contractDate: d(-18, 1), obligationStartDate: d(-17, 1) },
    { name: 'Indústria Metalúrgica Forte', cnpj: '11.111.111/0001-07', taxRegime: 'LUCRO_REAL_ANUAL', contractDate: d(-40, 1), obligationStartDate: d(-39, 1) },
    { name: 'Transportadora Rápida', cnpj: '11.111.111/0001-08', taxRegime: 'LUCRO_REAL_ESTIMATIVA', contractDate: d(-20, 1), obligationStartDate: d(-19, 1) },
    { name: 'Instituto Educar', cnpj: '11.111.111/0001-09', taxRegime: 'IMUNE_IRPJ', contractDate: d(-36, 1), obligationStartDate: d(-36, 1) },
    { name: 'Maria Souza (Doméstica)', cnpj: '11.111.111/0001-10', taxRegime: 'DOMESTICA', contractDate: d(-10, 1), obligationStartDate: d(-10, 1) },
    { name: 'Dr. Carlos Lima (PF)', cnpj: '11.111.111/0001-11', taxRegime: 'PESSOA_FISICA', contractDate: d(-12, 1), obligationStartDate: d(-12, 1) },
    { name: 'Mercado Bom Preço', cnpj: '11.111.111/0001-12', taxRegime: 'SIMPLES_NACIONAL', contractDate: d(-9, 1), obligationStartDate: d(-8, 1) },
    // Entraram esse mês (em Setembro/Outubro)
    { name: 'Tech Solutions Ltda', cnpj: '22.222.222/0001-01', taxRegime: 'SIMPLES_NACIONAL', contractDate: d(-1, 20), obligationStartDate: d(0, 1) },
    { name: 'Studio Criativo ME', cnpj: '22.222.222/0001-02', taxRegime: 'MEI', contractDate: d(-1, 25), obligationStartDate: d(0, 1) },
    // Entrarão futuramente
    { name: 'Comércio Alfa Ltda', cnpj: '33.333.333/0001-01', taxRegime: 'LUCRO_PRESUMIDO', contractDate: d(0, 1), obligationStartDate: d(1, 1) },
    { name: 'Agro Verde S/A', cnpj: '33.333.333/0001-02', taxRegime: 'LUCRO_REAL_TRIMESTRAL', contractDate: d(0, 1), obligationStartDate: d(2, 1) },
    // Saíram esse mês
    { name: 'Restaurante Sabor Caseiro', cnpj: '44.444.444/0001-01', taxRegime: 'SIMPLES_NACIONAL', contractDate: d(-20, 1), obligationStartDate: d(-20, 1), exitDate: d(0, pastDay) },
    // Sairão esse mês
    { name: 'Loja Moda Center', cnpj: '55.555.555/0001-01', taxRegime: 'SIMPLES_NACIONAL', contractDate: d(-15, 1), obligationStartDate: d(-15, 1), exitDate: d(0, futureDay) },
    // Sairão futuramente
    { name: 'Serviços XYZ Ltda', cnpj: '66.666.666/0001-01', taxRegime: 'LUCRO_PRESUMIDO', contractDate: d(-22, 1), obligationStartDate: d(-22, 1), exitDate: d(1, 15) },
    { name: 'Auto Peças Veloz', cnpj: '66.666.666/0001-02', taxRegime: 'SIMPLES_NACIONAL', contractDate: d(-30, 1), obligationStartDate: d(-30, 1), exitDate: d(2, 28) },
  ];

  const savedCompanies = [];
  for (const c of companies) {
    const saved = await prisma.company.upsert({
      where: { cnpj: c.cnpj },
      update: {
        name: c.name, taxRegime: c.taxRegime as any,
        contractDate: c.contractDate, obligationStartDate: c.obligationStartDate, exitDate: c.exitDate ?? null,
      },
      create: {
        name: c.name, cnpj: c.cnpj, taxRegime: c.taxRegime as any,
        contractDate: c.contractDate, obligationStartDate: c.obligationStartDate, exitDate: c.exitDate ?? null,
      },
    });
    savedCompanies.push(saved);
  }

  // ========================
  // Limpeza de fechamentos duplicados/antigos e recriação consistente
  // ========================
  await prisma.closing.deleteMany({});

  // Fechamentos com taxas de conclusão distintas e realistas mês a mês
  const seededMonthsConfig = [
    {
      // Agosto/2026 (Mês anterior consolidado - quase 100%)
      period: new Date(Date.UTC(y, m - 2, 1, 0, 0, 0, 0)),
      rates: {
        FISCAL: { completed: 0.94, inProgress: 0.06 },
        DP: { completed: 1.0, inProgress: 0.0 },
        PARCELAMENTO: { completed: 0.88, inProgress: 0.06 },
        CUSHMAN: { completed: 0.81, inProgress: 0.12 },
        CONTABIL: { completed: 0.88, inProgress: 0.06 },
      },
    },
    {
      // Setembro/2026 (Competência Vigente Fiscal/DP - em andamento)
      period: new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)),
      rates: {
        FISCAL: { completed: 0.63, inProgress: 0.19 },
        DP: { completed: 0.69, inProgress: 0.19 },
        PARCELAMENTO: { completed: 0.31, inProgress: 0.12 },
        CUSHMAN: { completed: 0.25, inProgress: 0.12 },
        CONTABIL: { completed: 0.38, inProgress: 0.25 },
      },
    },
    {
      // Outubro/2026 (Novo mês que está iniciando - maioria pendente)
      period: new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)),
      rates: {
        FISCAL: { completed: 0.13, inProgress: 0.12 },
        DP: { completed: 0.19, inProgress: 0.12 },
        PARCELAMENTO: { completed: 0.0, inProgress: 0.06 },
        CUSHMAN: { completed: 0.0, inProgress: 0.0 },
        CONTABIL: { completed: 0.06, inProgress: 0.06 },
      },
    },
  ];

  const types = ['FISCAL', 'DP', 'PARCELAMENTO', 'CUSHMAN', 'CONTABIL'];
  const closingsToCreate: any[] = [];

  for (const cfg of seededMonthsConfig) {
    const refPeriod = cfg.period;
    const nextMonth = new Date(Date.UTC(refPeriod.getUTCFullYear(), refPeriod.getUTCMonth() + 1, 1));
    const activeInMonth = savedCompanies.filter(c =>
      c.obligationStartDate < nextMonth && (!c.exitDate || c.exitDate >= refPeriod)
    );

    for (const type of types) {
      const rate = cfg.rates[type as keyof typeof cfg.rates] || { completed: 0.5, inProgress: 0.2 };
      const completedCount = Math.round(activeInMonth.length * rate.completed);
      const inProgressCount = Math.round(activeInMonth.length * rate.inProgress);

      for (let i = 0; i < activeInMonth.length; i++) {
        const company = activeInMonth[i];
        let status = 'PENDING';
        if (i < completedCount) {
          status = 'COMPLETED';
        } else if (i < completedCount + inProgressCount) {
          status = 'IN_PROGRESS';
        }

        const numEmp = 4 + ((i * 6) % 28);
        const dashboardMetrics = type === 'DP' ? { employees: numEmp } : undefined;
        const columnsData = {
          'Número de Funcionários': `${numEmp}`,
          'Aviso Importante': i % 3 === 0 ? 'Documentos verificados' : 'Regular',
          'Faturamento': `R$ ${(20000 + i * 5000).toLocaleString('pt-BR')},00`,
        };

        closingsToCreate.push({
          companyId: company.id,
          type: type as any,
          referencePeriod: refPeriod,
          status: status as any,
          dashboardMetrics,
          columnsData,
        });
      }
    }
  }

  if (closingsToCreate.length > 0) {
    await prisma.closing.createMany({
      data: closingsToCreate,
      skipDuplicates: true,
    });
  }

  console.log(`Empresas: ${savedCompanies.length} | Fechamentos gerados: ${closingsToCreate.length} para Agosto, Setembro e Outubro/2026 com taxas dinâmicas.`);
  console.log('Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
