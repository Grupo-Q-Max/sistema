import fs from 'node:fs';
import readline from 'node:readline';
import { parseSqlValues } from './sqlParser.mjs';
import mariadb from 'mariadb';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import 'dotenv/config';

const dumpFile = 'C:/Users/RodrigoSantePenhalve/Desktop/backups/controle_fechamento/Banco_de_dados/exportacoes/controle_fechamento-2026-10-07_16-24-48.sql';

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
  connectionLimit: 4,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});
const adapter = new PrismaMariaDb(pool as any);
const prisma = new PrismaClient({ adapter }) as any;

const USER_MAPPING: Record<number, { id: string; name: string }> = {
  38: { id: 'd8042f6b-1456-41e1-9205-acda2d0c1cea', name: 'Ingrid Gonçalves Silva da Silveira' },
  54: { id: '9de4bf42-79ed-42ca-8771-81a3363b9251', name: 'Alexandre Santana Richter' },
  53: { id: '56c04d28-654f-4f98-871d-bb336db63d92', name: 'Stefani Cristina de Almeida Silva' },
  35: { id: 'e9591f7e-64fc-4afd-a4d9-28aeecb23c7b', name: 'Luiz Fernando Monteacuti Geraldini' },
  32: { id: 'ad9543a9-2db9-4ada-a741-5bc2bc3ac8f3', name: 'Fernando de Sousa Silva' },
  34: { id: 'd3aae56a-5cec-4aca-9424-5b90269c8816', name: 'Elizângela Pereira Bastos' },
  47: { id: '2c5e98a7-6b76-4a67-a846-374eb1d8bb37', name: 'Larissa Alves dos Santos' },
  29: { id: '01f77602-eda8-4e77-8554-93e62280afe3', name: 'Alessandra Figueiredo dos Passos Santos' },
  24: { id: '37ea7f46-0273-4b0c-a512-31c9378627b4', name: 'Aline dos Santos da Silva' },
  52: { id: 'ac8480e4-4ad8-4c70-b686-eef82dbfc186', name: 'Pedro Rodrigues Werninghaus' },
  23: { id: '8237040d-8b6d-48d1-a89b-698335494a2a', name: 'Mayara de Moura Robusti' },
  28: { id: '86a52a68-ddbe-45fd-9a3d-3146c47ca6c2', name: 'Ana Carolina Oliveira' },
  40: { id: '1ed24936-20a2-4122-badf-f690fb188af0', name: 'Luiz Gustavo Garcia Pichinin' },
  49: { id: 'becd1cd6-def6-4a3e-a9de-53cb05cb5744', name: 'Feliciana da Silva Barbosa Barros' },
};

// IDs dos usuários puramente do Fiscal que foram erroneamente duplicados no Contábil
const WRONG_FISCAL_USER_IDS = new Set([
  '8e797c39-f5b2-4a5a-a4b3-2870249c0869', // Vanessa Gonçalves da Silva
  'b4f6a453-9ece-43e3-9cce-a9fb58a7bd5e', // Catia Silva
  'a71a51b4-8b56-462f-8eb9-34b6ece1a5f6', // Luciana da Silva Souza
  'f17253fc-acca-4c82-b00c-5d82f549c837', // Fernanda Ianae dos Santos
]);

async function main() {
  console.log('===========================================================');
  console.log('RESTAURAÇÃO DOS RESPONSÁVEIS LEGÍTIMOS DO CONTÁBIL');
  console.log('===========================================================');

  if (!fs.existsSync(dumpFile)) {
    throw new Error(`Arquivo de dump não encontrado em: ${dumpFile}`);
  }

  console.log('\n1. Processando dump histórico original...');
  const rl = readline.createInterface({ input: fs.createReadStream(dumpFile), crlfDelay: Infinity });

  let inFechamento = false;
  let inResp = false;

  const idFechToCnpj = new Map<number, string>();
  const contabilByCnpj = new Map<string, { legacyUserId: number; idMes: number }>();

  for await (const line of rl) {
    if (line.includes('INSERT INTO `controle_fechamento`')) inFechamento = true;
    if (inFechamento) {
      const rows = parseSqlValues(line);
      for (const r of rows) {
        if (r.length >= 5) {
          const id = Number(r[0]);
          const cnpj = String(r[4] || '').replace(/\D/g, '');
          if (id && cnpj) idFechToCnpj.set(id, cnpj);
        }
      }
      if (line.includes(';')) inFechamento = false;
    }

    if (line.includes('INSERT INTO `responsaveis_empresa`')) inResp = true;
    if (inResp) {
      const rows = parseSqlValues(line);
      for (const r of rows) {
        if (r.length >= 7) {
          const tipo = String(r[6] || '').toLowerCase().trim();
          const atual = String(r[5]);
          if (tipo === 'contabil' && atual === '1') {
            const idEmpresa = Number(r[1]);
            const idUsuario = Number(r[2]);
            const idMes = Number(r[3]);
            const cnpj = idFechToCnpj.get(idEmpresa);
            if (cnpj) {
              const prev = contabilByCnpj.get(cnpj);
              if (!prev || idMes >= prev.idMes) {
                contabilByCnpj.set(cnpj, { legacyUserId: idUsuario, idMes });
              }
            }
          }
        }
      }
      if (line.includes(';')) inResp = false;
    }
  }

  console.log(` - Empresas com responsável do Contábil extraídas do dump: ${contabilByCnpj.size}`);

  console.log('\n2. Carregando empresas e registros do MariaDB...');
  const allCompanies = await prisma.company.findMany({
    select: { id: true, code: true, name: true, cnpj: true, activeSectors: true },
  });
  console.log(` - Total de empresas no banco MariaDB: ${allCompanies.length}`);

  const companyByCnpj = new Map<string, any>();
  for (const c of allCompanies) {
    if (c.cnpj) {
      companyByCnpj.set(c.cnpj.replace(/\D/g, ''), c);
    }
  }

  console.log('\n3. Limpando vínculos espúrios de CONTÁBIL no banco...');
  // a) Deletar CompanyResponsible (CONTABIL) de empresas que sequer possuem o setor CONTÁBIL em activeSectors
  const nonContabilCompanies = allCompanies.filter(c => {
    const s = (c.activeSectors || '').toUpperCase();
    return !s.includes('CONTABIL') && s !== 'TODOS' && s !== '';
  });
  const nonContabilCompanyIds = nonContabilCompanies.map(c => c.id);

  if (nonContabilCompanyIds.length > 0) {
    const deletedNonSector = await prisma.companyResponsible.deleteMany({
      where: {
        sector: 'CONTABIL',
        companyId: { in: nonContabilCompanyIds },
      },
    });
    console.log(` - Removidos ${deletedNonSector.count} registros de Contábil de empresas que pertencem apenas a outros setores (ex: somente Fiscal/DP).`);
  }

  // b) Deletar atribuições onde o usuário é do Fiscal e a empresa NÃO estava no dump contábil (resquício da cópia 1:1 do Fiscal)
  const dumpCnpjsSet = new Set(contabilByCnpj.keys());
  const activeContabilCompanies = allCompanies.filter(c => {
    const s = (c.activeSectors || '').toUpperCase();
    return s.includes('CONTABIL') || s === 'TODOS' || s === '';
  });
  const newCompaniesNotInDump = activeContabilCompanies.filter(c => !dumpCnpjsSet.has((c.cnpj || '').replace(/\D/g, '')));
  const newCompanyIds = newCompaniesNotInDump.map(c => c.id);

  if (newCompanyIds.length > 0) {
    const deletedFiscalUsers = await prisma.companyResponsible.deleteMany({
      where: {
        sector: 'CONTABIL',
        companyId: { in: newCompanyIds },
        userId: { in: Array.from(WRONG_FISCAL_USER_IDS) },
      },
    });
    console.log(` - Removidas ${deletedFiscalUsers.count} atribuições indevidas de analistas fiscais (Vanessa/Catia/Luciana/Fernanda) em novas empresas ativas do Contábil.`);
  }

  console.log('\n4. Aplicando atribuições legítimas do Contábil da base antiga...');
  let updatedCount = 0;
  let createdCount = 0;
  const userStats = new Map<string, number>();

  for (const [cnpj, item] of contabilByCnpj) {
    const company = companyByCnpj.get(cnpj);
    if (!company) continue;

    const mappedUser = USER_MAPPING[item.legacyUserId];
    if (!mappedUser) {
      console.warn(`[AVISO] Usuário legado ID ${item.legacyUserId} não mapeado para empresa ${company.code} - ${company.name}`);
      continue;
    }

    // Deleta vínculo existente de CONTÁBIL para essa empresa
    await prisma.companyResponsible.deleteMany({
      where: {
        companyId: company.id,
        sector: 'CONTABIL',
      },
    });

    // Insere o vínculo legítimo
    await prisma.companyResponsible.create({
      data: {
        companyId: company.id,
        userId: mappedUser.id,
        sector: 'CONTABIL',
      },
    });

    updatedCount++;
    userStats.set(mappedUser.name, (userStats.get(mappedUser.name) || 0) + 1);
  }

  console.log(`\n===========================================================`);
  console.log(`RESULTADO DA RESTAURAÇÃO:`);
  console.log(` - Total de empresas contábeis restauradas com sucesso: ${updatedCount}`);
  console.log(`\nDistribuição final dos responsáveis pelo Fechamento Contábil:`);
  for (const [userName, count] of userStats.entries()) {
    console.log(`   * ${userName}: ${count} empresas`);
  }
  console.log(`===========================================================`);

  // Final check
  const totalCrContabil = await prisma.companyResponsible.count({ where: { sector: 'CONTABIL' } });
  console.log(`Total final de registros em CompanyResponsible (CONTABIL): ${totalCrContabil}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(err => {
  console.error('Falha na execução:', err);
  process.exit(1);
});

