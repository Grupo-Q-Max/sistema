import 'dotenv/config';
import mariadb from 'mariadb';
import fs from 'fs';
import crypto from 'crypto';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || 'fechamento-target-super-secret-key-32b!';
const ENC_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

function encryptPassword(text) {
  if (!text || typeof text !== 'string' || text.trim() === '' || text.trim().toUpperCase() === 'N/A') return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('enc:')) return trimmed;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
  let encrypted = cipher.update(trimmed, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `enc:${iv.toString('hex')}:${encrypted}`;
}

async function execute() {
  console.log('🚀 Iniciando importação automática dos dados da Jettax no banco...\n');

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
    const dbCompanies = await conn.query(`
      SELECT id, code, name, cnpj, hasClientCertificate, certificateType, certificateExpiration,
             municipalRegistration, stateRegistration, cityHallLogin, ginfessPassword,
             nfLogin, nfPassword, nfAccessType, contractDate, obligationStartDate, legacyData
      FROM Company
    `);

    const dbByCnpj = new Map();
    for (const c of dbCompanies) {
      const raw = String(c.cnpj || '').replace(/\D/g, '');
      if (raw) dbByCnpj.set(raw, c);
    }

    const jettaxList = JSON.parse(fs.readFileSync('scripts/jettax_clean.json', 'utf8'));

    let totalUpdated = 0;
    let certCount = 0;
    let imCount = 0;
    let ieCount = 0;
    let loginCount = 0;
    let passCount = 0;
    let emissorCount = 0;
    let datesCount = 0;
    let snCount = 0;

    for (const j of jettaxList) {
      const c = dbByCnpj.get(j.cnpj);
      if (!c) continue;

      const setClauses = [];
      const params = [];

      // 1. Certificado Digital
      if (j.cert_vencimento) {
        if (!c.certificateExpiration || c.certificateExpiration.trim() === '' || c.certificateExpiration !== j.cert_vencimento) {
          setClauses.push('certificateExpiration = ?');
          params.push(j.cert_vencimento);

          setClauses.push('hasClientCertificate = ?');
          params.push(1);

          if (!c.certificateType || c.certificateType.trim() === '') {
            setClauses.push('certificateType = ?');
            params.push('A1');
          }
          certCount++;
        }
      }

      // 2. Inscrição Municipal
      if (j.im && (!c.municipalRegistration || c.municipalRegistration.trim() === '')) {
        setClauses.push('municipalRegistration = ?');
        params.push(j.im);
        imCount++;
      }

      // 3. Inscrição Estadual
      if (j.ie && (!c.stateRegistration || c.stateRegistration.trim() === '')) {
        setClauses.push('stateRegistration = ?');
        params.push(j.ie);
        ieCount++;
      }

      // 4. Login Prefeitura
      if (j.login_prefeitura && (!c.cityHallLogin || c.cityHallLogin.trim() === '')) {
        setClauses.push('cityHallLogin = ?');
        params.push(j.login_prefeitura);
        loginCount++;
      }

      // 5. Senha Prefeitura
      if (j.senha_prefeitura && (!c.ginfessPassword || c.ginfessPassword.trim() === '')) {
        const enc = encryptPassword(j.senha_prefeitura);
        if (enc) {
          setClauses.push('ginfessPassword = ?');
          params.push(enc);
          passCount++;
        }
      }

      // 6. Emissor Nacional NFS-e
      if (j.emissor_login && (!c.nfLogin || c.nfLogin.trim() === '')) {
        setClauses.push('nfLogin = ?');
        params.push(j.emissor_login);

        if (j.emissor_senha) {
          const enc = encryptPassword(j.emissor_senha);
          if (enc) {
            setClauses.push('nfPassword = ?');
            params.push(enc);
          }
        }
        setClauses.push('nfAccessType = ?');
        params.push('Emissor Nacional');
        emissorCount++;
      }

      // 7. Datas de Abertura / Início
      if (j.abertura) {
        if (!c.contractDate) {
          setClauses.push('contractDate = ?');
          params.push(j.abertura);
          datesCount++;
        }
        if (!c.obligationStartDate) {
          setClauses.push('obligationStartDate = ?');
          params.push(j.abertura);
        }
      }

      // 8. Simples Nacional em legacyData
      if (j.codigo_acesso_sn || j.cpf_sn) {
        let leg = {};
        try {
          leg = typeof c.legacyData === 'string' ? JSON.parse(c.legacyData || '{}') : (c.legacyData || {});
        } catch {
          leg = {};
        }

        let legChanged = false;
        if (j.codigo_acesso_sn && !leg.simplesNacionalAccessCode) {
          leg.simplesNacionalAccessCode = j.codigo_acesso_sn;
          legChanged = true;
        }
        if (j.cpf_sn && !leg.simplesNacionalCpf) {
          leg.simplesNacionalCpf = j.cpf_sn;
          legChanged = true;
        }

        if (legChanged) {
          setClauses.push('legacyData = ?');
          params.push(JSON.stringify(leg));
          snCount++;
        }
      }

      if (setClauses.length > 0) {
        setClauses.push('updatedAt = NOW()');
        params.push(c.id);

        const sql = `UPDATE Company SET ${setClauses.join(', ')} WHERE id = ?`;
        await conn.query(sql, params);
        totalUpdated++;
      }
    }

    console.log('=====================================================');
    console.log('       IMPORTAÇÃO JETTAX CONCLUÍDA COM SUCESSO!      ');
    console.log('=====================================================');
    console.log(`- Total de empresas atualizadas: ${totalUpdated}`);
    console.log(`- Certificados digitais preenchidos / atualizados: ${certCount}`);
    console.log(`- Inscrições Municipais cadastradas: ${imCount}`);
    console.log(`- Logins de Prefeitura cadastrados: ${loginCount}`);
    console.log(`- Senhas de Prefeitura criptografadas cadastradas: ${passCount}`);
    console.log(`- Acessos ao Emissor Nacional (NFS-e) cadastrados: ${emissorCount}`);
    console.log(`- Datas de abertura / contrato cadastradas: ${datesCount}`);
    console.log(`- Códigos de acesso do Simples Nacional vinculados: ${snCount}`);

  } finally {
    conn.release();
    await pool.end();
  }
}

execute().catch(console.error);

