import fs from 'fs';
import readline from 'readline';
import { parseSqlValues } from './sqlParser.mjs';

async function checkDpValues() {
  const fileStream = fs.createReadStream('controle_fechamento.sql');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let inFechamento = false;
  let fechCols = [];
  const colValues = {
    adto: new Set(),
    folha_pagamento: new Set(),
    guias_sindicato: new Set(),
    fgts_digital: new Set(),
    e_social: new Set(),
    dctf_web_mes: new Set(),
    dissidio: new Set()
  };

  for await (const line of rl) {
    if (line.startsWith('INSERT INTO `controle_fechamento`')) {
      const idxValues = line.indexOf('VALUES');
      const colsPart = line.slice(0, idxValues);
      const parenMatch = colsPart.match(/\(([\s\S]*)\)/);
      if (parenMatch) fechCols = parenMatch[1].match(/`([^`]+)`/g).map(x => x.replace(/`/g, ''));
      inFechamento = true;
      continue;
    }
    if (inFechamento) {
      if (line.startsWith('INSERT INTO `') && !line.startsWith('INSERT INTO `controle_fechamento`')) {
        inFechamento = false;
      } else if (line.trim().startsWith('(')) {
        const rows = parseSqlValues(line);
        for (const r of rows) {
          if (r.length === fechCols.length) {
            const obj = {};
            for (let i = 0; i < fechCols.length; i++) obj[fechCols[i]] = r[i];
            for (const k of Object.keys(colValues)) {
              if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
                colValues[k].add(String(obj[k]));
              }
            }
          }
        }
      }
    }
  }

  for (const [k, vals] of Object.entries(colValues)) {
    console.log(`\nValues for ${k} (${vals.size} distinct):`);
    console.log(Array.from(vals).slice(0, 15));
  }
}

checkDpValues().catch(console.error);

