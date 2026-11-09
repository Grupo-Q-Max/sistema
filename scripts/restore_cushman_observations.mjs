import fs from 'fs';
import readline from 'readline';
import mariadb from 'mariadb';
import 'dotenv/config';

// Proper SQL values parser
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

async function restoreCushman() {
  console.log('🚀 Iniciando Restauração das Observações de Cushman no banco de dados...\n');

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
    // 1. Obter empresas Cushman do banco
    const dbCompanies = await conn.query(`
      SELECT id, code, name, cnpj, taxRegime, activeSectors, notes, notesScope 
      FROM Company 
      WHERE activeSectors LIKE '%CUSHMAN%' OR code LIKE '05%' OR taxRegime IN ('CONDOMINIOS', 'ASSOCIACOES')
      ORDER BY code ASC
    `);

    console.log(`📦 Empresas Cushman cadastradas no banco ativo: ${dbCompanies.length}`);

    const compByCnpj = new Map();
    const compByCode = new Map();
    for (const c of dbCompanies) {
      const rawCnpj = String(c.cnpj || '').replace(/\D/g, '');
      if (rawCnpj) compByCnpj.set(rawCnpj, c);
      if (c.code) {
        compByCode.set(String(c.code).trim(), c);
        compByCode.set(String(c.code).replace(/^0+/, ''), c);
      }
    }

    // 2. Obter Closings de Cushman
    const cushmanClosings = await conn.query(`
      SELECT id, companyId, DATE_FORMAT(referencePeriod, '%Y-%m-01') as refDate, columnsData 
      FROM Closing 
      WHERE type = 'CUSHMAN'
    `);
    console.log(`📑 Total de Closings CUSHMAN no banco: ${cushmanClosings.length}`);

    const closingsByComp = new Map();
    for (const cl of cushmanClosings) {
      if (!closingsByComp.has(cl.companyId)) closingsByComp.set(cl.companyId, new Map());
      closingsByComp.get(cl.companyId).set(cl.refDate, cl);
    }

    // 3. Ler dump antigo
    const sqlFilePath = 'controle_fechamento-2026-11-05_16-24-48.sql';
    const fileStream = fs.createReadStream(sqlFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let inCreateTable = false;
    let inInsert = false;
    let cols = [];
    const matchedData = new Map();

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
          if (row.length === cols.length) processRow(row);
        }
        continue;
      }

      if (line.trim().startsWith('(') && inInsert) {
        const rows = parseSqlValues(line);
        for (const row of rows) {
          if (row.length === cols.length) processRow(row);
        }
      }

      if (inInsert && line.includes('UNLOCK TABLES;')) break;
    }

    function processRow(row) {
      const rawCnpj = String(row[cols.indexOf('cnpj')] || '').replace(/\D/g, '');
      const code = cleanText(row[cols.indexOf('codigo')]);
      const id_mes = parseInt(row[cols.indexOf('id_mes')], 10);
      const dateStr = idMesToDateMap[id_mes] || null;

      const obs = cleanText(row[cols.indexOf('observacoes')]);
      const obsCushman = cleanText(row[cols.indexOf('observacoes_cushman')]);
      const combinedObs = obsCushman || obs;

      if (!combinedObs) return;

      let matchedComp = compByCnpj.get(rawCnpj);
      if (!matchedComp && code) {
        matchedComp = compByCode.get(code) || compByCode.get(code.replace(/^0+/, ''));
      }

      if (matchedComp) {
        if (!matchedData.has(matchedComp.id)) {
          matchedData.set(matchedComp.id, {
            company: matchedComp,
            observations: new Map(),
            latestIdMes: 0,
            latestObs: ''
          });
        }
        const item = matchedData.get(matchedComp.id);
        if (dateStr) {
          item.observations.set(dateStr, combinedObs);
        }
        if (id_mes >= item.latestIdMes) {
          item.latestIdMes = id_mes;
          item.latestObs = combinedObs;
        }
      }
    }

    console.log(`\n🔍 Empresas encontradas com observações no dump: ${matchedData.size}`);

    // 4. Executar atualizações no Banco de Dados
    let updatedCompaniesCount = 0;
    let updatedClosingsCount = 0;

    for (const [compId, item] of matchedData.entries()) {
      const comp = item.company;
      const noteToSet = comp.notes || item.latestObs;

      // Atualizar Company se notesScope não for CUSHMAN ou se notes estiver vazio
      if (comp.notesScope !== 'CUSHMAN' || !comp.notes) {
        await conn.query(`
          UPDATE Company 
          SET notes = ?, notesScope = 'CUSHMAN', updatedAt = NOW() 
          WHERE id = ?
        `, [noteToSet, compId]);
        updatedCompaniesCount++;
      }

      // Atualizar cada Closing CUSHMAN da empresa
      const compClosings = closingsByComp.get(compId);
      if (compClosings) {
        for (const [refDate, cl] of compClosings.entries()) {
          const obsForMonth = item.observations.get(refDate) || item.latestObs;
          if (!obsForMonth) continue;

          let colData = {};
          try {
            colData = typeof cl.columnsData === 'string' ? JSON.parse(cl.columnsData || '{}') : (cl.columnsData || {});
          } catch {
            colData = {};
          }

          // Se a observação atual estiver vazia ou em branco, restaura
          const currentObs = cleanText(colData.cush_observacao);
          if (!currentObs || currentObs === '') {
            colData.cush_observacao = obsForMonth;
            await conn.query(`
              UPDATE Closing 
              SET columnsData = ?, updatedAt = NOW() 
              WHERE id = ?
            `, [JSON.stringify(colData), cl.id]);
            updatedClosingsCount++;
          }
        }
      }
    }

    console.log(`\n🎉 Restauração concluída com sucesso!`);
    console.log(`- Empresas atualizadas (notesScope='CUSHMAN'): ${updatedCompaniesCount}`);
    console.log(`- Fechamentos CUSHMAN atualizados com cush_observacao: ${updatedClosingsCount}`);

    // 5. Verificação pós-atualização
    const [verifyCount] = await conn.query(`
      SELECT count(*) as total 
      FROM Closing 
      WHERE type = 'CUSHMAN' AND (columnsData LIKE '%cush_observacao%' AND columnsData NOT LIKE '%"cush_observacao":""%')
    `);
    console.log(`- Total de fechamentos CUSHMAN com observação preenchida agora: ${verifyCount.total}`);

  } finally {
    conn.release();
    await pool.end();
  }
}

restoreCushman().catch(console.error);
