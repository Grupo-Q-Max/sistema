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

const ALL_COLUMNS = [
  // ========================
  // 1. FISCAL
  // ========================
  {
    department: 'FISCAL',
    name: 'Carnê Leão',
    inputType: 'POPUP',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 1,
  },
  {
    department: 'FISCAL',
    name: 'Reinf',
    inputType: 'POPUP',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 2,
  },
  {
    department: 'FISCAL',
    name: 'Impostos',
    inputType: 'POPUP',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 3,
  },
  {
    department: 'FISCAL',
    name: 'ISS',
    inputType: 'POPUP',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 4,
  },
  {
    department: 'FISCAL',
    name: 'MIT',
    inputType: 'POPUP',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 5,
  },
  {
    department: 'FISCAL',
    name: 'SPED Fiscal',
    inputType: 'POPUP',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 6,
  },
  {
    department: 'FISCAL',
    name: 'SPED Contribuições',
    inputType: 'POPUP',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 7,
  },
  {
    department: 'FISCAL',
    name: 'DESTDA',
    inputType: 'POPUP',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 8,
  },
  {
    department: 'FISCAL',
    name: 'Envio de Guias',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 9,
  },
  {
    department: 'FISCAL',
    name: 'Faturamento do Mês',
    inputType: 'TEXT',
    replicates: false,
    countsProgress: false,
    isEditable: true,
    orderIndex: 10,
  },
  {
    department: 'FISCAL',
    name: 'Observações Fiscais',
    inputType: 'TEXT',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 11,
  },

  // ========================
  // 2. DP (DEPARTAMENTO PESSOAL)
  // ========================
  {
    department: 'DP',
    name: 'Cálculo de Folha',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 1,
  },
  {
    department: 'DP',
    name: 'Número de Funcionários (Vidas)',
    inputType: 'TEXT',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 2,
  },
  {
    department: 'DP',
    name: 'eSocial / DCTFWeb',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 3,
  },
  {
    department: 'DP',
    name: 'FGTS Digital / DAE',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 4,
  },
  {
    department: 'DP',
    name: 'Envio de Holerites & Guias',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 5,
  },
  {
    department: 'DP',
    name: 'Férias / Rescisões',
    inputType: 'TEXT',
    replicates: false,
    countsProgress: false,
    isEditable: true,
    orderIndex: 6,
  },
  {
    department: 'DP',
    name: 'Fechamento de Ponto',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 7,
  },
  {
    department: 'DP',
    name: 'Dissídio',
    inputType: 'TEXT',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 8,
  },
  {
    department: 'DP',
    name: 'Observações DP',
    inputType: 'TEXT',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 9,
  },

  // ========================
  // 3. CONTÁBIL
  // ========================
  {
    department: 'CONTABIL',
    name: 'Importação Extratos Bancários',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 1,
  },
  {
    department: 'CONTABIL',
    name: 'Conciliação Bancária & Caixa',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 2,
  },
  {
    department: 'CONTABIL',
    name: 'Integração Fiscal x Contábil',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 3,
  },
  {
    department: 'CONTABIL',
    name: 'Integração Folha x Contábil',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 4,
  },
  {
    department: 'CONTABIL',
    name: 'Fechamento Balancete',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 5,
  },
  {
    department: 'CONTABIL',
    name: 'ECD / ECF',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 6,
  },
  {
    department: 'CONTABIL',
    name: 'Envio Relatórios Contábeis',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 7,
  },
  {
    department: 'CONTABIL',
    name: 'Aviso Importante / Pendências',
    inputType: 'POPUP',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 8,
  },
  {
    department: 'CONTABIL',
    name: 'Observações Contábeis',
    inputType: 'TEXT',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 9,
  },

  // ========================
  // 4. PARCELAMENTO
  // ========================
  {
    department: 'PARCELAMENTO',
    name: 'Guia do Parcelamento',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 1,
  },
  {
    department: 'PARCELAMENTO',
    name: 'Emissão da Parcela',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 2,
  },
  {
    department: 'PARCELAMENTO',
    name: 'Conferência Saldo Devedor',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: false,
    isEditable: true,
    orderIndex: 3,
  },
  {
    department: 'PARCELAMENTO',
    name: 'Envio da Guia ao Cliente',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 4,
  },
  {
    department: 'PARCELAMENTO',
    name: 'Número de Parcelas Restantes',
    inputType: 'TEXT',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 5,
  },
  {
    department: 'PARCELAMENTO',
    name: 'Observações do Parcelamento',
    inputType: 'TEXT',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 6,
  },

  // ========================
  // 5. CUSHMAN
  // ========================
  {
    department: 'CUSHMAN',
    name: 'Validação de Locações',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 1,
  },
  {
    department: 'CUSHMAN',
    name: 'Relatório Despesas & Condomínio',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 2,
  },
  {
    department: 'CUSHMAN',
    name: 'Emissão de Boletos Cushman',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 3,
  },
  {
    department: 'CUSHMAN',
    name: 'Prestação de Contas Mensal',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 4,
  },
  {
    department: 'CUSHMAN',
    name: 'Envio de Relatórios Gerenciais',
    inputType: 'CHECKBOX',
    replicates: false,
    countsProgress: true,
    isEditable: true,
    orderIndex: 5,
  },
  {
    department: 'CUSHMAN',
    name: 'Observações Cushman',
    inputType: 'TEXT',
    replicates: true,
    countsProgress: false,
    isEditable: true,
    orderIndex: 6,
  },
];

async function seed() {
  console.log('Seeding Department Columns...');
  
  await prisma.departmentColumn.deleteMany({});

  for (const col of ALL_COLUMNS) {
    await prisma.departmentColumn.create({
      data: col,
    });
    console.log(`Created Column [${col.department}] -> ${col.name} (${col.inputType})`);
  }

  console.log(`Finished seeding ${ALL_COLUMNS.length} columns.`);
}

seed()
  .catch((err) => {
    console.error('Error seeding columns:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
