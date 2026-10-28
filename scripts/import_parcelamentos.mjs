import dotenv from 'dotenv';
dotenv.config();

import fs from 'node:fs';
import crypto from 'node:crypto';
import mariadb from 'mariadb';

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

function parseSqlInserts(sql) {
  let pos = 0;
  const rows = [];
  while (pos < sql.length) {
    const insertIdx = sql.indexOf('INSERT INTO', pos);
    if (insertIdx === -1) break;
    const valuesIdx = sql.indexOf('VALUES', insertIdx);
    if (valuesIdx === -1) break;
    pos = valuesIdx + 6;
    let inTuple = false, inString = false, escape = false;
    let currentFields = [], currentField = '';
    while (pos < sql.length) {
      const ch = sql[pos];
      if (!inTuple) {
        if (ch === '(') { inTuple = true; currentFields = []; currentField = ''; }
        else if (ch === ';') { pos++; break; }
      } else {
        if (inString) {
          if (escape) { currentField += ch; escape = false; }
          else if (ch === '\\') { escape = true; }
          else if (ch === "'") {
            if (pos + 1 < sql.length && sql[pos + 1] === "'") { currentField += "'"; pos++; }
            else { inString = false; }
          } else { currentField += ch; }
        } else {
          if (ch === "'") { inString = true; }
          else if (ch === ',') { currentFields.push(currentField.trim() === 'NULL' ? null : currentField.trim()); currentField = ''; }
          else if (ch === ')') {
            currentFields.push(currentField.trim() === 'NULL' ? null : currentField.trim());
            rows.push(currentFields);
            inTuple = false; currentFields = []; currentField = '';
          } else { currentField += ch; }
        }
      }
      pos++;
    }
  }
  return rows;
}

function normalizeTypeName(name) {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function endOfPlan(start, count) {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + count - 1;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(start.getUTCDate(), last)));
}

const idMesYearMap = {
  '198': 2025,
  '201': 2025,
  '202': 2025,
  '203': 2025,
  '204': 2026,
  '205': 2026,
  '206': 2026,
  '207': 2026,
  '208': 2026,
  '209': 2026,
  '210': 2026,
  '211': 2026,
  '212': 2026,
  '213': 2026
};

async function main() {
  const conn = await pool.getConnection();
  console.log('Conexão estabelecida com MariaDB!');

  try {
    // 1. Obter usuário padrão
    const users = await conn.query('SELECT `id` FROM `User` WHERE `active` = 1 ORDER BY `createdAt` ASC LIMIT 1');
    const defaultUserId = users.length ? users[0].id : null;

    // 2. Carregar todas as empresas existentes
    const companies = await conn.query('SELECT `id`, `code`, `name`, `tradeName`, `cnpj` FROM `Company`');
    const byDigits = new Map();
    const byCode = new Map();
    const byName = new Map();

    for (const c of companies) {
      const digits = (c.cnpj || '').replace(/\D/g, '');
      if (digits) byDigits.set(digits, c);
      if (c.code) byCode.set(String(c.code).trim(), c);
      if (c.name) byName.set(c.name.trim().toLowerCase(), c);
      if (c.tradeName) byName.set(c.tradeName.trim().toLowerCase(), c);
    }

    // 3. Ler e agrupar planos do dump
    const filePath = 'C:/Users/RodrigoSantePenhalve/Downloads/parcelamentos.sql';
    console.log(`Lendo ${filePath}...`);
    const content = fs.readFileSync(filePath, 'utf8');
    const rows = parseSqlInserts(content);
    console.log(`Linhas do dump: ${rows.length}`);

    const planGroups = new Map();
    for (const r of rows) {
      const code = (r[1] || '').trim();
      const cnpj = (r[3] || '').replace(/\D/g, '');
      const type = (r[4] || '').trim();
      const date = (r[6] || '').trim();
      const val = (r[8] || '').trim();
      const key = `${code}|${cnpj}|${type.toLowerCase()}|${date}|${val}`;

      if (!planGroups.has(key)) {
        planGroups.set(key, {
          code,
          nome: r[2],
          cnpj,
          type,
          qtde: Number(r[5]) || 0,
          startsAt: r[6],
          endsAt: r[7],
          val: Number(r[8]) || 0,
          envio: r[10],
          obs: r[11],
          status: r[14],
          rows: []
        });
      }
      planGroups.get(key).rows.push(r);
    }
    console.log(`Planos únicos: ${planGroups.size}`);

    // 4. Criar empresas externas que faltam
    for (const [key, plan] of planGroups.entries()) {
      let company = byDigits.get(plan.cnpj) || byCode.get(plan.code) || byName.get((plan.nome || '').trim().toLowerCase());
      if (!company) {
        const id = crypto.randomUUID();
        const now = new Date(plan.startsAt + 'T00:00:00Z');
        const isPF = plan.cnpj.length === 11;
        const taxRegime = isPF ? 'PESSOA_FISICA' : (plan.type.toUpperCase().includes('MEI') ? 'MEI' : 'SIMPLES_NACIONAL');
        const code = plan.code && plan.code !== 'AVULSO' ? plan.code.trim() : null;

        await conn.query(
          `INSERT INTO \`Company\` (\`id\`, \`name\`, \`code\`, \`cnpj\`, \`taxRegime\`, \`activeSectors\`, \`notes\`, \`notesScope\`, \`contractDate\`, \`obligationStartDate\`, \`createdAt\`, \`updatedAt\`)
           VALUES (?, ?, ?, ?, ?, 'PARCELAMENTO_EXTERNO', ?, 'PARCELAMENTO', ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE \`updatedAt\` = NOW()`,
          [id, (plan.nome || 'Empresa Externa').trim(), code, plan.cnpj, taxRegime, plan.obs || 'Cadastrada por parcelamentos', now, now]
        );
        company = { id, code, name: plan.nome, cnpj: plan.cnpj };
        byDigits.set(plan.cnpj, company);
        if (code) byCode.set(code, company);
        console.log(`[Nova Empresa Externa Criada] ${company.name}`);
      }
    }

    // 5. Upsert de tipos de parcelamentos
    const allTypes = Array.from(new Set(Array.from(planGroups.values()).map(p => p.type.trim())));
    for (const t of allTypes) {
      const key = normalizeTypeName(t);
      const id = crypto.randomUUID();
      await conn.query(
        `INSERT INTO \`InstallmentType\` (\`id\`, \`name\`, \`nameKey\`, \`createdAt\`)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`)`,
        [id, t, key]
      );
    }
    console.log(`Tipos de parcelamentos sincronizados: ${allTypes.length}`);

    // 6. Carregar ou criar planos no banco
    const existingPlans = await conn.query('SELECT `id`, `companyId`, `typeName` FROM `InstallmentPlan`');
    const planMap = new Map();
    for (const ep of existingPlans) {
      planMap.set(`${ep.companyId}|${normalizeTypeName(ep.typeName)}`, ep.id);
    }

    const plansToInsert = [];
    const paymentsToInsert = [];

    for (const [key, plan] of planGroups.entries()) {
      const company = byDigits.get(plan.cnpj) || byCode.get(plan.code) || byName.get((plan.nome || '').trim().toLowerCase());
      if (!company) continue;

      plan.rows.sort((a, b) => Number(a[0]) - Number(b[0]));
      const paymentsMap = new Map();

      for (const r of plan.rows) {
        const year = idMesYearMap[r[12]] || (Number(r[9]) > 0 ? Number(r[9]) : 2025);
        if (r[14]) plan.status = r[14];
        if (r[11]) plan.obs = r[11];
        if (r[10]) plan.envio = r[10];

        for (let m = 0; m < 12; m++) {
          const val = r[16 + m];
          if (val && val !== 'NULL' && val.trim() !== '') {
            const ym = `${year}-${String(m + 1).padStart(2, '0')}`;
            paymentsMap.set(ym, val.trim());
          }
        }
      }

      const startDate = new Date(plan.startsAt + 'T00:00:00Z');
      const startYear = startDate.getUTCFullYear();
      const startMonth = startDate.getUTCMonth();

      let maxNumber = plan.qtde;
      for (const [ym, textVal] of paymentsMap.entries()) {
        const [yStr, mStr] = ym.split('-');
        const num = (Number(yStr) - startYear) * 12 + (Number(mStr) - 1 - startMonth) + 1;
        if (num > maxNumber && (textVal.toUpperCase().includes('OK') || textVal.toUpperCase().includes('PAGO'))) {
          maxNumber = num;
        }
      }
      const installmentCount = maxNumber;
      const endsDate = endOfPlan(startDate, installmentCount);

      let planStatus = 'ATIVO';
      if (plan.status === 'quitado') planStatus = 'QUITADO';
      else if (plan.status === 'inativo') planStatus = 'ATRASADO';

      const totalAmount = (plan.val * installmentCount).toFixed(2);
      const planLookupKey = `${company.id}|${normalizeTypeName(plan.type)}`;

      let planId = planMap.get(planLookupKey);
      if (!planId) {
        planId = crypto.randomUUID();
        planMap.set(planLookupKey, planId);
      }

      plansToInsert.push([
        planId,
        company.id,
        plan.type.trim(),
        totalAmount,
        installmentCount,
        startDate,
        endsDate,
        planStatus,
        defaultUserId
      ]);

      // Mapear parcelas
      for (const [ym, textVal] of paymentsMap.entries()) {
        const [yStr, mStr] = ym.split('-');
        const pYear = Number(yStr);
        const pMonthIdx = Number(mStr) - 1;
        const num = (pYear - startYear) * 12 + (pMonthIdx - startMonth) + 1;

        if (num < 1 || num > installmentCount) continue;

        const upper = textVal.toUpperCase();
        let paymentStatus = 'PAID';
        if (upper.includes('DEVEDOR') || upper.includes('ATRASAD') || upper.includes('PENDENT')) {
          paymentStatus = 'OVERDUE';
        }

        let paidOn = null;
        const dateMatch = textVal.match(/(\d{1,2})\/(\d{1,2})/);
        if (dateMatch) {
          const dDay = Number(dateMatch[1]);
          const dMonth = Number(dateMatch[2]);
          if (dDay >= 1 && dDay <= 31 && dMonth >= 1 && dMonth <= 12) {
            paidOn = new Date(Date.UTC(pYear, dMonth - 1, dDay));
          }
        }
        if (!paidOn && paymentStatus === 'PAID') {
          paidOn = new Date(Date.UTC(pYear, pMonthIdx, 20));
        }

        const paymentId = crypto.randomUUID();
        paymentsToInsert.push([
          paymentId,
          planId,
          num,
          paymentStatus,
          paidOn,
          plan.val.toFixed(2),
          textVal,
          defaultUserId
        ]);
      }
    }

    console.log(`Gravando ${plansToInsert.length} parcelamentos em lote...`);
    const planSql = `
      INSERT INTO \`InstallmentPlan\` (\`id\`, \`companyId\`, \`typeName\`, \`totalAmount\`, \`installmentCount\`, \`startsAt\`, \`endsAt\`, \`status\`, \`createdById\`, \`createdAt\`, \`updatedAt\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        \`totalAmount\` = VALUES(\`totalAmount\`),
        \`installmentCount\` = VALUES(\`installmentCount\`),
        \`startsAt\` = VALUES(\`startsAt\`),
        \`endsAt\` = VALUES(\`endsAt\`),
        \`status\` = VALUES(\`status\`),
        \`updatedAt\` = NOW()
    `;
    await conn.batch(planSql, plansToInsert);
    console.log('Parcelamentos gravados com sucesso!');

    console.log(`Gravando ${paymentsToInsert.length} parcelas mensais em lote...`);
    const paymentSql = `
      INSERT INTO \`InstallmentPayment\` (\`id\`, \`planId\`, \`installmentNumber\`, \`status\`, \`paidOn\`, \`paidAmount\`, \`note\`, \`updatedById\`, \`updatedAt\`)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        \`status\` = VALUES(\`status\`),
        \`paidOn\` = VALUES(\`paidOn\`),
        \`paidAmount\` = VALUES(\`paidAmount\`),
        \`note\` = VALUES(\`note\`),
        \`updatedById\` = VALUES(\`updatedById\`),
        \`updatedAt\` = NOW()
    `;
    // Batch in chunks of 500 for maximum performance and stability
    const chunkSize = 500;
    for (let i = 0; i < paymentsToInsert.length; i += chunkSize) {
      const chunk = paymentsToInsert.slice(i, i + chunkSize);
      await conn.batch(paymentSql, chunk);
      console.log(`Lote ${Math.floor(i / chunkSize) + 1}/${Math.ceil(paymentsToInsert.length / chunkSize)} gravado.`);
    }

    console.log('\n=====================================================');
    console.log('         MIGRAÇÃO CONCLUÍDA COM SUCESSO TOTAL!       ');
    console.log('=====================================================');
    console.log(`Total de planos no banco: ${plansToInsert.length}`);
    console.log(`Total de pagamentos mensais vinculados: ${paymentsToInsert.length}`);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
