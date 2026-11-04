import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Configurações
const USER_DESKTOP = path.join(os.homedir(), 'Desktop');
const BACKUP_DIR = process.env.DOMINIO_BACKUP_DIR || path.join(USER_DESKTOP, 'backups_dominio');
const PROFILE_DIR = process.env.DOMINIO_PROFILE_DIR || path.join(os.homedir(), 'AppData', 'Local', 'DominioBotProfile');
const TARGET_URL = 'https://suporte.dominioatendimento.com/backup/faces/bkp-realizado.html';

// Garantir que a pasta de destino exista
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Limpeza inteligente: mantém os N mais recentes de CADA tipo (Completo e Modificações)
function cleanOldBackups(keepCount = 1) {
  try {
    const allFiles = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.toLowerCase().endsWith('.dom'))
      .map(name => {
        const fullPath = path.join(BACKUP_DIR, name);
        const stats = fs.statSync(fullPath);
        const isCompleto = name.toUpperCase().includes('C.DOM');
        return {
          name,
          fullPath,
          isCompleto,
          mtime: stats.mtimeMs,
          sizeMb: (stats.size / 1024 / 1024).toFixed(1)
        };
      });

    const completos = allFiles.filter(f => f.isCompleto).sort((a, b) => b.mtime - a.mtime);
    const modificacoes = allFiles.filter(f => !f.isCompleto).sort((a, b) => b.mtime - a.mtime);

    // Limpar completos excedentes
    if (completos.length > keepCount) {
      for (const item of completos.slice(keepCount)) {
        console.log(`🗑️ Removendo backup completo antigo: ${item.name} (${item.sizeMb} MB)`);
        fs.unlinkSync(item.fullPath);
      }
    }

    // Limpar modificações excedentes
    if (modificacoes.length > keepCount) {
      for (const item of modificacoes.slice(keepCount)) {
        console.log(`🗑️ Removendo backup de modificações antigo: ${item.name} (${item.sizeMb} MB)`);
        fs.unlinkSync(item.fullPath);
      }
    }
  } catch (err) {
    console.warn('Aviso ao gerenciar retenção de backups:', err);
  }
}

// Garante que o navegador passe pelo login (clica em continuar/entrar automaticamente se o login já estiver salvo)
async function ensureAuthenticated(page: Page): Promise<void> {
  console.log('🔄 Checando autenticação no Onvio / Domínio...');
  const maxWaitMs = 180000; // até 3 minutos
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const currentUrl = page.url();

    // Se já estiver na página de backups, sucesso!
    if (currentUrl.includes('suporte.dominioatendimento.com') && currentUrl.includes('bkp-realizado')) {
      console.log('✅ Acesso confirmado à Central de Backups em Nuvem!');
      return;
    }

    // Se estiver em telas de login / autenticação do Onvio / Thomson Reuters
    if (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('onvio') || currentUrl.includes('thomsonreuters')) {
      console.log('🔑 Tela de autenticação detectada. Tentando clicar em "Entrar / Continuar"...');

      // Tenta clicar automaticamente em botões de submit ou conta salva
      const selectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Entrar")',
        'button:has-text("Continuar")',
        'button:has-text("Avançar")',
        'button:has-text("Sign in")',
        'button:has-text("Next")',
        'button:has-text("Acessar")',
        'a:has-text("Entrar")',
        'a:has-text("Continuar")',
        '[data-testid="account-item"]',
        '.account-item',
      ];

      for (const sel of selectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 1200 })) {
            console.log(`👆 Acionando botão de login automático: ${sel}`);
            await btn.click();
            await page.waitForTimeout(3000);
            break;
          }
        } catch {}
      }

      console.log('⏳ Se houver senha ou código de confirmação, por favor digite na tela...');
    }

    // Se o login foi concluído e caiu na home do suporte, navega para a página de backups
    if (currentUrl.includes('suporte.dominioatendimento.com') && !currentUrl.includes('bkp-realizado') && !currentUrl.includes('login')) {
      console.log('➡️ Redirecionando para a página de backups realizada...');
      await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    await page.waitForTimeout(2500);
  }

  throw new Error('Tempo limite excedido aguardando login. Por favor, verifique suas credenciais.');
}

// Realiza o download de um tipo específico (COMPLETO ou MODIFICACOES)
async function downloadBackup(page: Page, type: 'COMPLETO' | 'MODIFICACOES') {
  console.log(`\n====================================================`);
  console.log(`🎯 PROCESSANDO BACKUP DO TIPO: [ ${type} ]`);
  console.log(`====================================================`);

  const tabText = type === 'COMPLETO' ? 'COMPLETO' : 'SOMENTE MODIFICAÇÕES';
  console.log(`🔎 Selecionando aba: "${tabText}"...`);

  // Localiza e clica na aba
  try {
    const tabBtn = page.locator(`button:has-text("${tabText}"), a:has-text("${tabText}"), input[value*="${tabText}"], span:has-text("${tabText}"), td:has-text("${tabText}")`).first();
    if (await tabBtn.isVisible({ timeout: 6000 })) {
      await tabBtn.click();
      console.log(`🖱️ Clique na aba "${tabText}" realizado.`);
      await page.waitForTimeout(1500);

      // Clica em PESQUISAR para recarregar a tabela
      const pesquisarBtn = page.locator('button:has-text("PESQUISAR"), input[value*="PESQUISAR"], a:has-text("PESQUISAR")').first();
      if (await pesquisarBtn.isVisible({ timeout: 3000 })) {
        await pesquisarBtn.click();
        console.log('🔍 Botão PESQUISAR acionado.');
        await page.waitForTimeout(3500);
      }
    }
  } catch (err) {
    console.warn(`Aviso ao alternar para a aba ${type}:`, err);
  }

  // Localiza a primeira linha de dados e o botão de download
  console.log('🔎 Localizando o backup mais recente na tabela...');
  await page.waitForTimeout(2000);

  // Procura o gatilho de download da primeira linha
  const downloadTrigger = page.locator('table tbody tr:first-child a, table tbody tr:first-child button, table tbody tr:first-child [onclick], table tbody tr:first-child [title*="Download"], table tbody tr:first-child i, table tbody tr:first-child img')
    .filter({ hasNotText: 'Pesquisar' })
    .first();

  if (!await downloadTrigger.isVisible({ timeout: 10000 })) {
    console.log(`⚠️ Nenhum backup encontrado na tabela para o tipo ${type}.`);
    return null;
  }

  console.log(`⬇️ Disparando download do backup ${type}...`);
  try {
    const [ download ] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }), // até 3 min para arquivos grandes
      downloadTrigger.click()
    ]);

    const suggestedName = download.suggestedFilename() || `backup_${type}_${Date.now()}.dom`;
    const finalPath = path.join(BACKUP_DIR, suggestedName);

    console.log(`📥 Baixando arquivo: ${suggestedName}...`);
    await download.saveAs(finalPath);

    const stats = fs.statSync(finalPath);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`🎉 BACKUP ${type} BAIXADO COM SUCESSO!`);
    console.log(`📄 Arquivo: ${suggestedName}`);
    console.log(`📦 Tamanho: ${sizeMb} MB`);
    console.log(`📍 Local: ${finalPath}`);

    return finalPath;
  } catch (err) {
    console.error(`❌ Falha no download do backup ${type}:`, err);
    return null;
  }
}

async function run() {
  console.log('====================================================');
  console.log('🤖 ROBÔ DE DOWNLOAD AUTOMÁTICO - SISTEMA DOMÍNIO');
  console.log(`📁 Pasta de Destino: ${BACKUP_DIR}`);
  console.log(`👤 Perfil de Sessão: ${PROFILE_DIR}`);
  console.log('====================================================');

  const isHeadless = process.argv.includes('--headless');

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'msedge',
      headless: isHeadless,
      acceptDownloads: true,
      viewport: { width: 1366, height: 868 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
  } catch {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: isHeadless,
      acceptDownloads: true,
      viewport: { width: 1366, height: 868 },
    });
  }

  const page = context.pages()[0] || await context.newPage();

  let hasError = false;

  try {
    console.log(`🌐 Acessando Central de Backups: ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Garante que o usuário seja autenticado (clicando em entrar automaticamente se salvo)
    await ensureAuthenticated(page);

    await page.waitForTimeout(3000);

    // Baixa o backup COMPLETO (a base sólida)
    await downloadBackup(page, 'COMPLETO');

    // Aguarda intervalo entre downloads
    await page.waitForTimeout(3000);

    // Baixa o backup de MODIFICAÇÕES (as atualizações mais recentes do dia)
    await downloadBackup(page, 'MODIFICACOES');

    // Executa a retenção inteligente mantendo o mais novo de cada tipo
    cleanOldBackups(1);

    console.log('\n✨ Todos os downloads solicitados foram processados com sucesso!');

  } catch (err) {
    hasError = true;
    console.error('\n❌ Ocorreu um erro durante a execução:', err);
    const debugPath = path.join(BACKUP_DIR, 'debug_error.png');
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
    console.log(`📸 Screenshot de diagnóstico salva em: ${debugPath}`);
  } finally {
    if (isHeadless) {
      await context.close();
    } else {
      // Se estiver em modo visual e deu erro, espera 20 segundos antes de fechar para o usuário ver
      if (hasError) {
        console.log('⚠️ Mantendo navegador aberto por 20 segundos para visualização...');
        await page.waitForTimeout(20000);
      }
      await context.close();
    }
    console.log('🏁 Robô finalizado.');
  }
}

run().catch(console.error);
