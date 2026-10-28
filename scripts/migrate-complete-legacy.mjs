import { PrismaClient, Role, TaxRegime, ClosingType } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import mariadb from 'mariadb';
import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import { parseSqlValues } from './sqlParser.mjs';

// Setup Encryption
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

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim();
  if (!str || str.toUpperCase() === 'NULL' || str === '0000-00-00' || str.startsWith('0000')) return null;
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && y >= 1900 && y <= 2100) return new Date(Date.UTC(y, m, d, 12, 0, 0));
    }
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2100) return null;
  return d;
}

function mapRole(legacyRole) {
  const r = String(legacyRole || '').toLowerCase().trim();
  if (r === 'admin') return Role.ADMIN;
  if (r.includes('dp')) return Role.DP;
  if (r.includes('fiscal')) return Role.FISCAL;
  if (r.includes('contabil')) return Role.CONTABIL;
  if (r === 'socio') return Role.SOCIO;
  return Role.CADASTRO;
}

function mapRegime(legacyRegime) {
  const reg = String(legacyRegime || '').toLowerCase().trim();
  if (reg.includes('mei')) return TaxRegime.MEI;
  if (reg.includes('simples')) return TaxRegime.SIMPLES_NACIONAL;
  if (reg.includes('trimestral')) return TaxRegime.LUCRO_REAL_TRIMESTRAL;
  if (reg.includes('estimativa')) return TaxRegime.LUCRO_REAL_ESTIMATIVA;
  if (reg.includes('anual')) return TaxRegime.LUCRO_REAL_ANUAL;
  if (reg.includes('presumido')) return TaxRegime.LUCRO_PRESUMIDO;
  if (reg.includes('imune')) return TaxRegime.IMUNE_IRPJ;
  if (reg.includes('condomin')) return TaxRegime.CONDOMINIOS;
  if (reg.includes('domest')) return TaxRegime.DOMESTICA;
  if (reg.includes('associac') || reg.includes('associaç')) return TaxRegime.ASSOCIACOES;
  if (reg.includes('fisica') || reg.includes('física')) return TaxRegime.PESSOA_FISICA;
  return TaxRegime.SIMPLES_NACIONAL;
}

function mapDeliveryMethod(val) {
  if (!val) return null;
  const str = String(val).toUpperCase().trim();
  if (str.includes('ONVIO')) return 'Onvio';
  if (str.includes('NIBO') && str.includes('WHATS')) return 'Nibo/WhatsApp';
  if (str.includes('NIBO') && str.includes('E-MAIL')) return 'Nibo/E-mail';
  if (str.includes('NIBO')) return 'Nibo';
  if (str.includes('E-MAIL') || str.includes('EMAIL')) return 'E-mail';
  return val.trim();
}

async function migrateLegacy() {
  console.log('🚀 Iniciando migração e organização completa da base legada...');

  const url = new URL(process.env.DATABASE_URL);
  const pool = mariadb.createPool({
    host: url.hostname,
    port: parseInt(url.port, 10) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    dateStrings: true,
    connectionLimit: 5
  });
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(pool) });

  try {
    // ------------------------------------------------------------------
    // PASSO 1: Extrair dados do SQL dump
    // ------------------------------------------------------------------
    console.log('📦 Lendo controle_fechamento.sql...');
    const fileStream = fs.createReadStream('controle_fechamento.sql');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let inUsuarios = false;
    let inFechamento = false;
    let inResp = false;

    let fechCols = [];
    let respCols = [];

    const dumpUsers = [];
    const idToCnpjMap = new Map();
    const dumpCompaniesByCnpj = new Map();
    const rawAssignments = [];

    for await (const line of rl) {
      // 1. USUARIOS
      if (line.includes('INSERT INTO `usuarios`')) inUsuarios = true;
      if (inUsuarios) {
        const regex = /\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+)/g;
        let m;
        while ((m = regex.exec(line)) !== null) {
          dumpUsers.push({
            id: parseInt(m[1], 10),
            usuario: m[2],
            senhaHash: m[3],
            nome: m[4],
            tipoConta: m[5],
            ativo: m[6] === '1'
          });
        }
        if (line.includes(';')) inUsuarios = false;
      }

      // 2. CONTROLE_FECHAMENTO
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
              const rawCnpj = String(obj.cnpj || '').replace(/\D/g, '');
              if (rawCnpj) {
                idToCnpjMap.set(String(obj.id), rawCnpj);
                const idMes = parseInt(obj.id_mes, 10) || 0;
                const prev = dumpCompaniesByCnpj.get(rawCnpj);
                if (!prev || idMes >= (parseInt(prev.id_mes, 10) || 0)) {
                  dumpCompaniesByCnpj.set(rawCnpj, obj);
                }
              }
            }
          }
        }
      }

      // 3. RESPONSAVEIS_EMPRESA
      if (line.startsWith('INSERT INTO `responsaveis_empresa`')) {
        const idxValues = line.indexOf('VALUES');
        const colsPart = line.slice(0, idxValues);
        const parenMatch = colsPart.match(/\(([\s\S]*)\)/);
        if (parenMatch) respCols = parenMatch[1].match(/`([^`]+)`/g).map(x => x.replace(/`/g, ''));
        inResp = true;
        continue;
      }
      if (inResp) {
        if (line.startsWith('INSERT INTO `') && !line.startsWith('INSERT INTO `responsaveis_empresa`')) {
          inResp = false;
        } else if (line.trim().startsWith('(')) {
          const rows = parseSqlValues(line);
          for (const r of rows) {
            if (r.length === respCols.length) {
              const obj = {};
              for (let i = 0; i < respCols.length; i++) obj[respCols[i]] = r[i];
              if (String(obj.responsavel_atual) === '1') {
                rawAssignments.push(obj);
              }
            }
          }
        }
      }
    }

    console.log(`✅ Dump lido com sucesso:`);
    console.log(`   - Usuários encontrados: ${dumpUsers.length}`);
    console.log(`   - Empresas únicas por CNPJ: ${dumpCompaniesByCnpj.size}`);
    console.log(`   - Atribuições ativas de responsáveis: ${rawAssignments.length}`);

    // ------------------------------------------------------------------
    // PASSO 2: Migrar Usuários
    // ------------------------------------------------------------------
    console.log('\n👤 Sincronizando usuários no MariaDB...');
    const existingDbUsers = await prisma.user.findMany();
    const legacyToDbUserMap = new Map(); // legacyUserId -> dbUser.id

    let usersCreated = 0;
    let usersUpdated = 0;

    for (const du of dumpUsers) {
      if (!du.nome || du.usuario === 'teste') continue;

      const emailCandidates = [
        `${du.usuario.replace(/_/g, '.')}@grupoqmax.com.br`,
        `${du.usuario}@grupoqmax.com.br`,
        `${du.usuario}@fechamento.com.br`
      ];

      let match = existingDbUsers.find(u => 
        emailCandidates.includes(u.email.toLowerCase()) ||
        (u.name && u.name.trim().toLowerCase() === du.nome.trim().toLowerCase()) ||
        (u.name && du.nome && (
          u.name.toLowerCase().startsWith(du.nome.split(' ')[0].toLowerCase()) && 
          u.name.toLowerCase().includes(du.nome.split(' ').slice(-1)[0].toLowerCase())
        ))
      );

      const mappedRole = mapRole(du.tipoConta);

      if (match) {
        const updateData = {};
        if (!match.name || match.name === du.usuario) updateData.name = du.nome;
        if (!match.password || match.password === 'hashed_password_aqui') updateData.password = du.senhaHash;
        if (Object.keys(updateData).length > 0) {
          await prisma.user.update({
            where: { id: match.id },
            data: updateData
          });
          usersUpdated++;
        }
        legacyToDbUserMap.set(du.id, match.id);
      } else {
        const primaryEmail = `${du.usuario.replace(/_/g, '.')}@grupoqmax.com.br`;
        const newUser = await prisma.user.create({
          data: {
            name: du.nome,
            email: primaryEmail,
            password: du.senhaHash,
            role: mappedRole,
            active: du.ativo,
            companyScope: 'ALL',
            canViewAllCompanies: true
          }
        });
        legacyToDbUserMap.set(du.id, newUser.id);
        existingDbUsers.push(newUser);
        usersCreated++;
      }
    }

    console.log(`✅ Usuários sincronizados: ${usersCreated} criados, ${usersUpdated} atualizados.`);

    // ------------------------------------------------------------------
    // PASSO 3: Sincronizar e Enriquecer Empresas
    // ------------------------------------------------------------------
    console.log('\n🏢 Sincronizando empresas no MariaDB...');
    const existingCompanies = await prisma.company.findMany();
    const cnpjToCompanyMap = new Map(); // rawCnpj -> Company

    for (const c of existingCompanies) {
      cnpjToCompanyMap.set(c.cnpj.replace(/\D/g, ''), c);
    }

    let companiesCreated = 0;
    let companiesEnriched = 0;

    for (const [rawCnpj, d] of dumpCompaniesByCnpj.entries()) {
      try {
        const code = d.codigo ? String(d.codigo).trim() : null;
        const name = d.empresa ? String(d.empresa).trim() : 'EMPRESA SEM NOME';
        const regime = mapRegime(d.tributacao);
        const deliveryMethod = mapDeliveryMethod(d.envio);
        const groupName = d.grupo ? String(d.grupo).trim() : null;
        const stateReg = d.insc_estadual ? String(d.insc_estadual).trim() : null;
        const muniReg = d.insc_municipal ? String(d.insc_municipal).trim() : null;
        const city = d.municipio ? String(d.municipio).trim() : null;
        const cityHallLogin = d.login_prefeitura ? String(d.login_prefeitura).trim() : null;
        const cityHallLink = d.link_prefeitura ? String(d.link_prefeitura).trim() : null;
        const ginfessPassword = encryptPassword(d.senha_prefeitura_ginfes);
        const gissOnlinePassword = encryptPassword(d.senha_giss_online);
        const sdLogin = d.sd_login && d.sd_login.trim().toUpperCase() !== 'N/A' ? d.sd_login.trim() : null;
        const sdPassword = encryptPassword(d.sd_senha);
        const certificatePassword = encryptPassword(d.senha_certificado);
        const hasClientCertificate = d.certificado_cliente === 'Sim';
        const certificateType = d.tipo_certificado ? String(d.tipo_certificado).trim() : null;
        const companyType = d.tipo ? String(d.tipo).trim() : null;
        const targetProxyDate = parseDate(d.data_procuracao_target);
        const contractDate = parseDate(d.data_contrato);
        const obligationStartDate = parseDate(d.data_obrigacao);
        const exitDate = parseDate(d.data_saida);
        const notes = d.observacoes ? String(d.observacoes).trim() : null;
        const activeSectors = d.setores_permitidos ? d.setores_permitidos.toUpperCase().replace(/\s+/g, '') : 'TODOS';

        const existing = cnpjToCompanyMap.get(rawCnpj);

        if (existing) {
          const updatePayload = {};

          if (code && existing.code !== code) updatePayload.code = code;
          if (deliveryMethod && !existing.deliveryMethod) updatePayload.deliveryMethod = deliveryMethod;
          if (cityHallLogin && !existing.cityHallLogin) updatePayload.cityHallLogin = cityHallLogin;
          if (cityHallLink && !existing.cityHallLink) updatePayload.cityHallLink = cityHallLink;
          if (ginfessPassword && !existing.ginfessPassword) updatePayload.ginfessPassword = ginfessPassword;
          if (gissOnlinePassword && !existing.gissOnlinePassword) updatePayload.gissOnlinePassword = gissOnlinePassword;
          if (sdLogin && !existing.sdLogin) updatePayload.sdLogin = sdLogin;
          if (sdPassword && !existing.sdPassword) updatePayload.sdPassword = sdPassword;
          if (certificatePassword && !existing.certificatePassword) updatePayload.certificatePassword = certificatePassword;
          if (certificateType && !existing.certificateType) updatePayload.certificateType = certificateType;
          if (targetProxyDate && !existing.targetProxyDate) updatePayload.targetProxyDate = targetProxyDate;
          if (contractDate && !existing.contractDate) updatePayload.contractDate = contractDate;
          if (obligationStartDate && !existing.obligationStartDate) updatePayload.obligationStartDate = obligationStartDate;
          if (exitDate && !existing.exitDate) updatePayload.exitDate = exitDate;
          if (groupName && !existing.groupName) updatePayload.groupName = groupName;
          if (stateReg && !existing.stateRegistration) updatePayload.stateRegistration = stateReg;
          if (muniReg && !existing.municipalRegistration) updatePayload.municipalRegistration = muniReg;
          if (city && !existing.city) updatePayload.city = city;
          if (companyType && !existing.companyType) updatePayload.companyType = companyType;
          if (notes && !existing.notes) updatePayload.notes = notes;

          if (Object.keys(updatePayload).length > 0) {
            const updated = await prisma.company.update({
              where: { id: existing.id },
              data: updatePayload
            });
            cnpjToCompanyMap.set(rawCnpj, updated);
            companiesEnriched++;
          }
        } else {
          const created = await prisma.company.create({
            data: {
              code,
              name,
              cnpj: rawCnpj,
              taxRegime: regime,
              groupName,
              stateRegistration: stateReg,
              municipalRegistration: muniReg,
              city,
              cityHallLogin,
              cityHallLink,
              ginfessPassword,
              gissOnlinePassword,
              sdLogin,
              sdPassword,
              certificatePassword,
              hasClientCertificate,
              certificateType,
              companyType,
              deliveryMethod,
              activeSectors,
              targetProxyDate,
              contractDate,
              obligationStartDate,
              exitDate,
              notes
            }
          });
          cnpjToCompanyMap.set(rawCnpj, created);
          companiesCreated++;
        }
      } catch (companyErr) {
        console.warn(`⚠️ Aviso ao processar empresa CNPJ ${rawCnpj}:`, companyErr.message);
      }
    }

    console.log(`✅ Empresas sincronizadas: ${companiesCreated} criadas, ${companiesEnriched} enriquecidas.`);

    // ------------------------------------------------------------------
    // PASSO 4: Sincronizar Responsáveis das Empresas (DP e Fiscal)
    // ------------------------------------------------------------------
    console.log('\n🤝 Sincronizando responsáveis por empresa (DP e Fiscal)...');

    const latestAssignments = new Map();

    for (const a of rawAssignments) {
      const cnpj = idToCnpjMap.get(a.id_empresa);
      if (!cnpj) continue;

      const sector = a.tipo_tarefa === 'dp' ? ClosingType.DP : (a.tipo_tarefa === 'fiscal' ? ClosingType.FISCAL : null);
      if (!sector) continue;

      const key = `${cnpj}:${sector}`;
      const prev = latestAssignments.get(key);
      const idMes = parseInt(a.id_mes, 10) || 0;

      if (!prev || idMes >= prev.idMes) {
        latestAssignments.set(key, {
          cnpj,
          sector,
          legacyUserId: parseInt(a.id_usuario, 10),
          idMes
        });
      }
    }

    let responsiblesUpserted = 0;
    let responsiblesSkipped = 0;

    for (const item of latestAssignments.values()) {
      try {
        const company = cnpjToCompanyMap.get(item.cnpj);
        const userId = legacyToDbUserMap.get(item.legacyUserId);

        if (!company || !userId) {
          responsiblesSkipped++;
          continue;
        }

        await prisma.companyResponsible.upsert({
          where: {
            companyId_userId_sector: {
              companyId: company.id,
              userId,
              sector: item.sector
            }
          },
          create: {
            companyId: company.id,
            userId,
            sector: item.sector
          },
          update: {}
        });

        responsiblesUpserted++;
      } catch (respErr) {
        console.warn(`⚠️ Aviso ao vincular responsável:`, respErr.message);
        responsiblesSkipped++;
      }
    }

    console.log(`✅ Responsáveis sincronizados: ${responsiblesUpserted} vínculos ativos criados/atualizados (${responsiblesSkipped} ignorados).`);

    // ------------------------------------------------------------------
    // PASSO 5: Garantir Fechamentos para as Novas Empresas no Mês Aberto (2026-10)
    // ------------------------------------------------------------------
    console.log('\n📅 Verificando fechamentos para empresas no mês aberto (10/2026)...');
    const currentPeriod = new Date('2026-10-01T00:00:00.000Z');
    let closingsCreated = 0;

    for (const [rawCnpj, comp] of cnpjToCompanyMap.entries()) {
      for (const sector of [ClosingType.FISCAL, ClosingType.DP, ClosingType.CONTABIL]) {
        try {
          const exists = await prisma.closing.findFirst({
            where: {
              companyId: comp.id,
              type: sector,
              referencePeriod: currentPeriod
            }
          });

          if (!exists) {
            await prisma.closing.create({
              data: {
                companyId: comp.id,
                type: sector,
                referencePeriod: currentPeriod,
                status: 'PENDING',
                columnsData: {}
              }
            });
            closingsCreated++;
          }
        } catch (closeErr) {
          // ignore duplicate
        }
      }
    }

    console.log(`✅ Fechamentos de 10/2026 verificados: ${closingsCreated} fechamentos adicionados para novas empresas.`);

    console.log('\n========================================');
    console.log('🎉 MIGRAÇÃO CONCLUÍDA COM TOTAL SUCESSO!');
    console.log('========================================');

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

migrateLegacy().catch(err => {
  console.error('❌ Erro durante a migração:', err);
  process.exit(1);
});
