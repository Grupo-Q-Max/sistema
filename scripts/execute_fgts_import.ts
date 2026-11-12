import 'dotenv/config';
import mariadb from 'mariadb';
import fs from 'fs';
import { randomUUID } from 'crypto';

const excelRecords: Array<{
  doc: string;
  name: string;
  start: string | null;
  end: string | null;
  status: string;
}> = JSON.parse(fs.readFileSync('scripts/fgts_records.json', 'utf-8'));

async function main() {
  console.log(`\n============================================================`);
  console.log(`  IMPORTAÇÃO DE PROCURAÇÕES FGTS - FECHAMENTO PRO`);
  console.log(`============================================================`);
  console.log(`Total de registros carregados da planilha: ${excelRecords.length}\n`);

  const url = new URL(process.env.DATABASE_URL || '');
  const pool = mariadb.createPool({
    host: url.hostname,
    port: parseInt(url.port, 10) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    dateStrings: true,
    connectionLimit: 4,
    ssl: { rejectUnauthorized: false }
  });

  const conn = await pool.getConnection();

  try {
    const companies: Array<{
      id: string;
      code: string | null;
      name: string;
      cnpj: string;
      fgtsProxyIssueDate: string | null;
      fgtsProxyDate: string | null;
    }> = await conn.query(`SELECT id, code, name, cnpj, fgtsProxyIssueDate, fgtsProxyDate FROM Company`);

    console.log(`Total de empresas cadastradas no banco: ${companies.length}\n`);

    const byCnpj = new Map<string, typeof companies[0]>();
    for (const c of companies) {
      const clean = String(c.cnpj || '').replace(/\D/g, '');
      if (clean) byCnpj.set(clean, c);
    }

    let updatedCount = 0;
    const updatedList: any[] = [];
    const notFoundList: any[] = [];

    // Mapeamento especial de CPF de sócio / MEI para empresa PJ
    const specialMap: Record<string, string> = {
      '29818951840': '34181709000152', // Daniel Teles Marcal -> DANIEL TELES MARCAL CONSULTORIA
    };

    for (const rec of excelRecords) {
      const cleanDoc = rec.doc.replace(/\D/g, '');
      const targetCnpj = specialMap[cleanDoc] || cleanDoc;
      const comp = byCnpj.get(targetCnpj);

      if (comp) {
        const issueDate = rec.start ? `${rec.start} 00:00:00` : null;
        const expDate = rec.end ? `${rec.end} 00:00:00` : null;

        await conn.query(
          `UPDATE Company SET fgtsProxyIssueDate = ?, fgtsProxyDate = ?, updatedAt = NOW() WHERE id = ?`,
          [issueDate, expDate, comp.id]
        );

        updatedCount++;
        updatedList.push({
          code: comp.code || 'S/C',
          name: comp.name,
          cnpj: comp.cnpj,
          excelDoc: rec.doc,
          excelName: rec.name,
          issueDate: rec.start,
          expDate: rec.end,
          previousExpDate: comp.fgtsProxyDate ? String(comp.fgtsProxyDate).split(' ')[0] : 'Não informado',
        });
      } else {
        notFoundList.push(rec);
      }
    }

    // Registra log de auditoria no sistema
    await conn.query(
      `INSERT INTO SystemLog (id, action, entity, entityId, details, ipAddress, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        randomUUID(),
        'IMPORTACAO_PROCURACOES_FGTS',
        'EMPRESA',
        'LOTE',
        JSON.stringify({
          totalExcel: excelRecords.length,
          updatedCompanies: updatedCount,
          notFound: notFoundList.length,
          timestamp: new Date().toISOString()
        }),
        '127.0.0.1'
      ]
    );

    console.log(`✅ ATUALIZAÇÃO CONCLUÍDA COM SUCESSO!`);
    console.log(`- Empresas atualizadas no banco: ${updatedCount} de ${excelRecords.length} (${((updatedCount / excelRecords.length) * 100).toFixed(1)}%)`);
    console.log(`- Empresas da planilha não localizadas no banco: ${notFoundList.length}\n`);

    console.log(`Exemplos de empresas atualizadas (primeiras 10):`);
    for (const item of updatedList.slice(0, 10)) {
      console.log(`  [Cód ${item.code}] ${item.name} (${item.cnpj})`);
      console.log(`    ↳ Emissão FGTS: ${item.issueDate || '—'} | Vencimento FGTS: ${item.expDate} (Anterior: ${item.previousExpDate})`);
    }

    if (notFoundList.length > 0) {
      console.log(`\nEmpresas da planilha que não possuem cadastro no Fechamento Pro (${notFoundList.length}):`);
      for (const item of notFoundList) {
        console.log(`  - ${item.name} (Documento: ${item.doc} | Vencimento: ${item.end})`);
      }
    }

    // Salva relatório em JSON para rastreabilidade
    fs.writeFileSync('scripts/resultado_importacao_fgts.json', JSON.stringify({
      dataImportacao: new Date().toISOString(),
      totalPlanilha: excelRecords.length,
      atualizadas: updatedCount,
      naoEncontradas: notFoundList.length,
      listaAtualizadas: updatedList,
      listaNaoEncontradas: notFoundList
    }, null, 2));

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(console.error);
