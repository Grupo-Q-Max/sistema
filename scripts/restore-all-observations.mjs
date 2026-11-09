import 'dotenv/config';
import mariadb from 'mariadb';
import fs from 'fs';
import readline from 'readline';

// Proper SQL values parser with accurate escape handling for MySQL dumps
function parseSqlValues(valuesStr) {
  const rows = [];
  let i = 0;
  const n = valuesStr.length;

  while (i < n) {
    while (i < n && valuesStr[i] !== '(') i++;
    if (i >= n) break;
    i++; // skip '('

    const row = [];
    let currentVal = '';
    let inString = false;
    let isEscaped = false;
    let wasQuoted = false;

    while (i < n) {
      const char = valuesStr[i];

      if (inString) {
        if (isEscaped) {
          if (char === 'n') currentVal += '\n';
          else if (char === 'r') currentVal += '\r';
          else if (char === 't') currentVal += '\t';
          else if (char === '0') currentVal += '\0';
          else currentVal += char;
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === "'") {
          if (i + 1 < n && valuesStr[i + 1] === "'") {
            currentVal += "'";
            i++;
          } else {
            inString = false;
          }
        } else {
          currentVal += char;
        }
      } else {
        if (char === "'") {
          inString = true;
          wasQuoted = true;
          currentVal = '';
        } else if (char === ',' || char === ')') {
          const trimmed = currentVal.trim();
          if (trimmed === 'NULL') {
            row.push(null);
          } else if (wasQuoted) {
            row.push(currentVal.trim());
          } else if (trimmed === '') {
            row.push(null);
          } else if (/^-?\d+$/.test(trimmed)) {
            row.push(trimmed);
          } else if (/^-?\d+\.\d+$/.test(trimmed)) {
            row.push(parseFloat(trimmed));
          } else {
            row.push(trimmed);
          }
          currentVal = '';
          wasQuoted = false;
          if (char === ')') {
            i++;
            break;
          }
        } else {
          currentVal += char;
        }
      }
      i++;
    }

    if (row.length > 0) {
      rows.push(row);
    }
  }

  return rows;
}

const idMesToDateMap = {
  198: '2025-09-01',
  201: '2025-10-01',
  202: '2025-11-01',
  203: '2025-12-01',
  204: '2026-01-01',
  205: '2026-02-01',
  206: '2026-03-01',
  207: '2026-04-01',
  208: '2026-05-01',
  209: '2026-06-01',
  210: '2026-07-01',
  211: '2026-08-01',
  212: '2026-09-01',
  213: '2026-10-01',
  214: '2026-11-01'
};

function cleanText(val) {
  if (!val) return null;
  let s = String(val).trim();
  if (s === '' || s.toUpperCase() === 'NULL') return null;
  return s;
}

async function run() {
  console.log('🚀 Iniciando leitura e restauração de todas as observações da base antiga...\n');

  const sqlFilePath = 'controle_fechamento-2026-11-05_16-24-48.sql';
  if (!fs.existsSync(sqlFilePath)) {
    throw new Error(`Arquivo ${sqlFilePath} não encontrado!`);
  }

  const fileStream = fs.createReadStream(sqlFilePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let inCreateTable = false;
  let inInsert = false;
  let cols = [];

  // cnpj -> { code, name, latestIdMes, obs, dp, fisc, cont, monthlyByDate: Map<dateStr, {obs, dp, fisc, cont}> }
  const dumpData = new Map();

  for await (const line of rl) {
    if (line.startsWith('CREATE TABLE `controle_fechamento`')) {
      inCreateTable = true;
      continue;
    }
    if (inCreateTable) {
      if (line.includes(') ENGINE')) inCreateTable = false;
      else {
        const colMatch = line.trim().match(/^`([^`]+)`/);
        if (colMatch) cols.push(colMatch[1]);
      }
      continue;
    }

    if (line.startsWith('INSERT INTO `controle_fechamento`')) {
      inInsert = true;
      const valuesPart = line.slice(line.indexOf('VALUES') + 6);
      const rows = parseSqlValues(valuesPart);
      for (const row of rows) {
        if (row.length === cols.length) processDumpRow(row);
      }
      continue;
    }

    if (inInsert && line.trim().startsWith('(')) {
      const rows = parseSqlValues(line);
      for (const row of rows) {
        if (row.length === cols.length) processDumpRow(row);
      }
    }

    if (inInsert && line.includes('UNLOCK TABLES;')) break;
  }

  function processDumpRow(row) {
    const rawCnpj = String(row[cols.indexOf('cnpj')] || '').replace(/\D/g, '');
    if (!rawCnpj) return;

    const code = cleanText(row[cols.indexOf('codigo')]);
    const name = cleanText(row[cols.indexOf('empresa')]);
    const id_mes = parseInt(row[cols.indexOf('id_mes')], 10);
    const dateStr = idMesToDateMap[id_mes] || null;

    const obs = cleanText(row[cols.indexOf('observacoes')]);
    const dp = cleanText(row[cols.indexOf('observacoes_dp')]);
    const fisc = cleanText(row[cols.indexOf('observacoes_fiscal')]);
    const cont = cleanText(row[cols.indexOf('observacoes_contabil')]);

    if (!dumpData.has(rawCnpj)) {
      dumpData.set(rawCnpj, {
        code,
        name,
        latestIdMes: id_mes,
        obs: null,
        dp: null,
        fisc: null,
        cont: null,
        monthlyByDate: new Map()
      });
    }

    const item = dumpData.get(rawCnpj);
    if (dateStr) {
      item.monthlyByDate.set(dateStr, { obs, dp, fisc, cont });
    }

    // Keep the latest non-empty observations
    if (obs && (!item.obs || id_mes >= item.latestIdMes)) item.obs = obs;
    if (dp && (!item.dp || id_mes >= item.latestIdMes)) item.dp = dp;
    if (fisc && (!item.fisc || id_mes >= item.latestIdMes)) item.fisc = fisc;
    if (cont && (!item.cont || id_mes >= item.latestIdMes)) item.cont = cont;

    if (id_mes > item.latestIdMes) item.latestIdMes = id_mes;
  }

  console.log(`✅ Dump lido com sucesso: ${dumpData.size} empresas únicas encontradas.\n`);

  // Conectar ao Banco de Dados
  const url = new URL(process.env.DATABASE_URL);
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
    // Buscar empresas atuais do banco
    const dbCompanies = await conn.query('SELECT id, code, name, cnpj, notes, notesScope FROM Company');
    const compByCnpj = new Map();
    const compByCode = new Map();

    for (const c of dbCompanies) {
      const raw = String(c.cnpj || '').replace(/\D/g, '');
      if (raw) compByCnpj.set(raw, c);
      if (c.code) {
        const cleanCode = String(c.code).replace(/^0+/, '');
        compByCode.set(cleanCode, c);
        compByCode.set(String(c.code).trim(), c);
      }
    }

    console.log(`📦 Empresas no banco de dados ativo: ${dbCompanies.length}`);

    // =========================================================================
    // 1. ATUALIZAR COMPANY.NOTES
    // =========================================================================
    console.log('\n📝 1. Sincronizando observações gerais e fiscais na tabela Company...');
    let companyUpdatedCount = 0;

    for (const [cnpj, dumpItem] of dumpData.entries()) {
      let dbComp = compByCnpj.get(cnpj);
      if (!dbComp && dumpItem.code) {
        const cleanCode = String(dumpItem.code).replace(/^0+/, '');
        dbComp = compByCode.get(cleanCode) || compByCode.get(dumpItem.code);
      }
      if (!dbComp) continue;

      let targetNote = null;
      let targetScope = dbComp.notesScope || 'GERAL';

      // Decide target note from dump
      if (dumpItem.obs && dumpItem.fisc) {
        if (dumpItem.obs === dumpItem.fisc) {
          targetNote = dumpItem.obs;
        } else if (/^ok$/i.test(dumpItem.fisc) || /^ok\s+/i.test(dumpItem.fisc)) {
          targetNote = dumpItem.obs;
        } else {
          targetNote = `${dumpItem.obs}\n[Fiscal]: ${dumpItem.fisc}`;
        }
      } else if (dumpItem.obs) {
        targetNote = dumpItem.obs;
      } else if (dumpItem.fisc) {
        targetNote = dumpItem.fisc;
        targetScope = 'FISCAL';
      }

      if (!targetNote) continue;

      // Preserva nota já existente no banco se diferente de teste/vazio e não contiver já o texto
      const currentNote = dbComp.notes ? String(dbComp.notes).trim() : '';
      let finalNote = targetNote;

      if (currentNote && currentNote !== 'teste' && currentNote !== 'null') {
        if (!currentNote.includes(targetNote) && !targetNote.includes(currentNote)) {
          finalNote = `${currentNote}\n${targetNote}`;
        } else {
          finalNote = currentNote;
        }
      }

      if (finalNote !== currentNote) {
        await conn.query('UPDATE Company SET notes = ?, notesScope = ?, updatedAt = NOW() WHERE id = ?', [
          finalNote,
          targetScope,
          dbComp.id
        ]);
        dbComp.notes = finalNote;
        companyUpdatedCount++;
      }
    }

    console.log(`✅ Observações da tabela Company atualizadas: ${companyUpdatedCount} empresas.`);

    // =========================================================================
    // 2. ATUALIZAR OBSERVAÇÕES DO DP (Closing.columnsData.dp_observacao)
    // =========================================================================
    console.log('\n👥 2. Sincronizando observações do DP nos fechamentos mensais...');
    // Buscar todos os Closings de DP
    const dpClosings = await conn.query(`
      SELECT id, companyId, DATE_FORMAT(referencePeriod, '%Y-%m-01') as refDate, columnsData
      FROM Closing
      WHERE type = 'DP'
    `);

    // Organizar closings por companyId -> Map<refDate, closing>
    const dpClosingsByComp = new Map();
    for (const cl of dpClosings) {
      if (!dpClosingsByComp.has(cl.companyId)) dpClosingsByComp.set(cl.companyId, new Map());
      dpClosingsByComp.get(cl.companyId).set(cl.refDate, cl);
    }

    let dpUpdatedCount = 0;

    for (const [cnpj, dumpItem] of dumpData.entries()) {
      if (!dumpItem.dp && dumpItem.monthlyByDate.size === 0) continue;

      let dbComp = compByCnpj.get(cnpj);
      if (!dbComp && dumpItem.code) {
        const cleanCode = String(dumpItem.code).replace(/^0+/, '');
        dbComp = compByCode.get(cleanCode) || compByCode.get(dumpItem.code);
      }
      if (!dbComp) continue;

      const compClosings = dpClosingsByComp.get(dbComp.id);
      if (!compClosings) continue;

      // Para cada closing de DP existente no banco dessa empresa
      for (const [refDate, cl] of compClosings.entries()) {
        const dumpMonth = dumpItem.monthlyByDate.get(refDate);
        // Observação do mês específico, ou fallback na observação mais recente do DP
        const noteForThisMonth = dumpMonth?.dp || dumpItem.dp;
        if (!noteForThisMonth) continue;

        let colData = {};
        try {
          colData = typeof cl.columnsData === 'string' ? JSON.parse(cl.columnsData || '{}') : (cl.columnsData || {});
        } catch {
          colData = {};
        }

        const currentDpObs = cleanText(colData.dp_observacao);
        if (!currentDpObs || currentDpObs === '') {
          colData.dp_observacao = noteForThisMonth;
          await conn.query('UPDATE Closing SET columnsData = ?, updatedAt = NOW() WHERE id = ?', [
            JSON.stringify(colData),
            cl.id
          ]);
          dpUpdatedCount++;
        }
      }
    }

    console.log(`✅ Fechamentos de DP atualizados com dp_observacao: ${dpUpdatedCount} registros.`);

    // =========================================================================
    // 3. ATUALIZAR OBSERVAÇÕES DO CONTÁBIL (Closing.columnsData.cont_observacao)
    // =========================================================================
    console.log('\n📊 3. Sincronizando observações do Contábil...');
    const contClosings = await conn.query(`
      SELECT id, companyId, DATE_FORMAT(referencePeriod, '%Y-%m-01') as refDate, columnsData
      FROM Closing
      WHERE type = 'CONTABIL'
    `);

    const contClosingsByComp = new Map();
    for (const cl of contClosings) {
      if (!contClosingsByComp.has(cl.companyId)) contClosingsByComp.set(cl.companyId, []);
      contClosingsByComp.get(cl.companyId).push(cl);
    }

    let contUpdatedCount = 0;

    for (const [cnpj, dumpItem] of dumpData.entries()) {
      if (!dumpItem.cont) continue;

      let dbComp = compByCnpj.get(cnpj);
      if (!dbComp && dumpItem.code) {
        const cleanCode = String(dumpItem.code).replace(/^0+/, '');
        dbComp = compByCode.get(cleanCode) || compByCode.get(dumpItem.code);
      }
      if (!dbComp) continue;

      const compClosings = contClosingsByComp.get(dbComp.id);
      if (!compClosings) continue;

      for (const cl of compClosings) {
        let colData = {};
        try {
          colData = typeof cl.columnsData === 'string' ? JSON.parse(cl.columnsData || '{}') : (cl.columnsData || {});
        } catch {
          colData = {};
        }

        const currentContObs = cleanText(colData.cont_observacao);
        if (!currentContObs || currentContObs === '') {
          colData.cont_observacao = dumpItem.cont;
          await conn.query('UPDATE Closing SET columnsData = ?, updatedAt = NOW() WHERE id = ?', [
            JSON.stringify(colData),
            cl.id
          ]);
          contUpdatedCount++;
        }
      }
    }

    console.log(`✅ Fechamentos de Contábil atualizados com cont_observacao: ${contUpdatedCount} registros.`);

    // =========================================================================
    // 4. ATUALIZAR OBSERVAÇÕES DO FISCAL EM CLOSING (columnsData.fiscal_observacao)
    // =========================================================================
    console.log('\n⚖️ 4. Sincronizando observações do Fiscal nos fechamentos mensais...');
    const fiscClosings = await conn.query(`
      SELECT id, companyId, DATE_FORMAT(referencePeriod, '%Y-%m-01') as refDate, columnsData
      FROM Closing
      WHERE type = 'FISCAL'
    `);

    const fiscClosingsByComp = new Map();
    for (const cl of fiscClosings) {
      if (!fiscClosingsByComp.has(cl.companyId)) fiscClosingsByComp.set(cl.companyId, new Map());
      fiscClosingsByComp.get(cl.companyId).set(cl.refDate, cl);
    }

    let fiscUpdatedCount = 0;

    for (const [cnpj, dumpItem] of dumpData.entries()) {
      if (!dumpItem.fisc && dumpItem.monthlyByDate.size === 0) continue;

      let dbComp = compByCnpj.get(cnpj);
      if (!dbComp && dumpItem.code) {
        const cleanCode = String(dumpItem.code).replace(/^0+/, '');
        dbComp = compByCode.get(cleanCode) || compByCode.get(dumpItem.code);
      }
      if (!dbComp) continue;

      const compClosings = fiscClosingsByComp.get(dbComp.id);
      if (!compClosings) continue;

      for (const [refDate, cl] of compClosings.entries()) {
        const dumpMonth = dumpItem.monthlyByDate.get(refDate);
        const noteForThisMonth = dumpMonth?.fisc || dumpItem.fisc;
        if (!noteForThisMonth) continue;

        let colData = {};
        try {
          colData = typeof cl.columnsData === 'string' ? JSON.parse(cl.columnsData || '{}') : (cl.columnsData || {});
        } catch {
          colData = {};
        }

        const currentFiscObs = cleanText(colData.fiscal_observacao);
        if (!currentFiscObs || currentFiscObs === '') {
          colData.fiscal_observacao = noteForThisMonth;
          await conn.query('UPDATE Closing SET columnsData = ?, updatedAt = NOW() WHERE id = ?', [
            JSON.stringify(colData),
            cl.id
          ]);
          fiscUpdatedCount++;
        }
      }
    }

    console.log(`✅ Fechamentos de Fiscal atualizados com fiscal_observacao: ${fiscUpdatedCount} registros.`);

    // =========================================================================
    // RESUMO FINAL
    // =========================================================================
    console.log('\n=====================================================');
    console.log('       RESTAURAÇÃO DE OBSERVAÇÕES FINALIZADA COM SUCESSO!   ');
    console.log('=====================================================');
    console.log(`- Empresas com Company.notes atualizadas: ${companyUpdatedCount}`);
    console.log(`- Fechamentos DP atualizados com dp_observacao: ${dpUpdatedCount}`);
    console.log(`- Fechamentos Contábil atualizados com cont_observacao: ${contUpdatedCount}`);
    console.log(`- Fechamentos Fiscal atualizados com fiscal_observacao: ${fiscUpdatedCount}`);

    // Amostras pós-restauração
    console.log('\n🔍 Verificação de amostras no banco:');
    const [sampleCompNotes] = await conn.query(`
      SELECT COUNT(*) as totalComNotes FROM Company WHERE notes IS NOT NULL AND TRIM(notes) != ""
    `);
    console.log(`Total de empresas agora com observações cadastradas: ${sampleCompNotes.totalComNotes}`);

    const [sampleDpObs] = await conn.query(`
      SELECT COUNT(*) as totalDpWithObs FROM Closing 
      WHERE type = 'DP' AND JSON_EXTRACT(columnsData, '$.dp_observacao') IS NOT NULL 
      AND JSON_UNQUOTE(JSON_EXTRACT(columnsData, '$.dp_observacao')) != ""
    `);
    console.log(`Total de fechamentos DP com observações: ${sampleDpObs.totalDpWithObs}`);

    const [sampleContObs] = await conn.query(`
      SELECT COUNT(*) as totalContWithObs FROM Closing 
      WHERE type = 'CONTABIL' AND JSON_EXTRACT(columnsData, '$.cont_observacao') IS NOT NULL 
      AND JSON_UNQUOTE(JSON_EXTRACT(columnsData, '$.cont_observacao')) != ""
    `);
    console.log(`Total de fechamentos Contábil com observações: ${sampleContObs.totalContWithObs}`);

  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(console.error);

