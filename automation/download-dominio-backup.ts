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

// Limpeza de backups antigos: mantém apenas os N mais recentes (padrão: 1)
function cleanOldBackups(keepCount = 1) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.toLowerCase().endsWith('.dom'))
      .map(name => {
        const fullPath = path.join(BACKUP_DIR, name);
        const stats = fs.statSync(fullPath);
        return { name, fullPath, mtime: stats.mtimeMs, sizeMb: Math.round(stats.size / 1024 / 1024) };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > keepCount) {
      const toRemove = files.slice(keepCount);
      for (const item of toRemove) {
        console.log(`🗑️ Removendo backup antigo para liberar espaço: ${item.name} (${item.sizeMb} MB)`);
        fs.unlinkSync(item.fullPath);
      }
    }
  } catch (err) {
    console.warn('Aviso ao limpar backups antigos:', err);
  }
}

async function run() {
  console.log('====================================================');
  console.log('🤖 ROBÔ DE DOWNLOAD AUTOMÁTICO - SISTEMA DOMÍNIO');
  console.log(`📁 Pasta de Destino: ${BACKUP_DIR}`);
  console.log(`👤 Perfil de Sessão: ${PROFILE_DIR}`);
  console.log('====================================================');

  const isHeadless = process.argv.includes('--headless');

  // Lança o navegador com perfil persistente (mantém login, cookies e 2FA salvos no disco)
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'msedge', // Usa o Microsoft Edge nativo do Windows
      headless: isHeadless,
      acceptDownloads: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled'],
    });
  } catch {
    // Se o Edge não estiver disponível, tenta Chrome comum ou Chromium
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: isHeadless,
      acceptDownloads: true,
      viewport: { width: 1280, height: 800 },
    });
  }

  const page = context.pages()[0] || await context.newPage();

  console.log(`🌐 Acessando: ${TARGET_URL}...`);
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Verifica se caiu na tela de login
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('auth') || currentUrl.includes('onvio')) {
    console.log('\n⚠️ ========================================================');
    console.log('🔑 DETECTADA TELA DE LOGIN DO ONVIO / THOMSON REUTERS');
    console.log('Por favor, realize o login com e-mail, senha e confirme');
    console.log('o código do Outlook marcando "Lembrar este dispositivo".');
    console.log('O robô aguardará você concluir o login...');
    console.log('========================================================\n');

    // Aguarda até o redirecionamento para o portal de backup
    await page.waitForURL(url => url.toString().includes('suporte.dominioatendimento.com') && !url.toString().includes('login'), { timeout: 300000 });
    console.log('✅ Login identificado com sucesso! Sessão salva para as próximas execuções.');
  }

  // Aguarda a página carregar a tabela
  await page.waitForTimeout(3000);

  // Clica no botão "COMPLETO"
  console.log('🔎 Selecionando filtro "COMPLETO"...');
  try {
    const completoBtn = page.locator('button:has-text("COMPLETO"), a:has-text("COMPLETO"), input[value*="COMPLETO"], span:has-text("COMPLETO"), td:has-text("COMPLETO")').first();
    
    if (await completoBtn.isVisible({ timeout: 5000 })) {
      await completoBtn.click();
      console.log('🖱️ Clique na aba "COMPLETO" realizado.');
      await page.waitForTimeout(1500);

      // Clica em PESQUISAR para a tabela do Domínio carregar os backups completos
      const pesquisarBtn = page.locator('button:has-text("PESQUISAR"), input[value*="PESQUISAR"], a:has-text("PESQUISAR")').first();
      if (await pesquisarBtn.isVisible({ timeout: 3000 })) {
        await pesquisarBtn.click();
        console.log('🔍 Botão PESQUISAR acionado para carregar backups completos.');
        await page.waitForTimeout(3000);
      }
    }
  } catch (err) {
    console.log('Aviso ao selecionar COMPLETO:', err);
  }

  // Localiza a tabela e o primeiro ícone de download
  console.log('🔎 Localizando o backup mais recente...');
  
  // Procura o botão de download na primeira linha
  // Na imagem: ícone de download na coluna Ações
  const downloadIcon = page.locator('table tr td a, table tr td button, i.fa-download, svg, img[src*="download"], [title*="Download"], [title*="Baixar"], a[href*="download"], a[id*="download"]')
    .filter({ hasNotText: 'Pesquisar' });

  // Aguarda evento de download disparar
  console.log('⬇️ Iniciando download do backup...');
  
  try {
    const [ download ] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      // Clica no primeiro gatilho de download encontrado na primeira linha de dados
      (async () => {
        // Tenta achar o link da primeira linha da tabela
        const firstRowDownload = page.locator('table tbody tr:first-child a, table tbody tr:first-child button, table tbody tr:first-child [onclick], table tbody tr:first-child [title*="Download"]').first();
        if (await firstRowDownload.isVisible()) {
          await firstRowDownload.click();
        } else {
          // Fallback para qualquer botão de download visível
          await downloadIcon.first().click();
        }
      })()
    ]);

    const suggestedName = download.suggestedFilename() || `backup_${Date.now()}.dom`;
    const finalPath = path.join(BACKUP_DIR, suggestedName);

    console.log(`📥 Salvando arquivo: ${suggestedName} em ${BACKUP_DIR}...`);
    await download.saveAs(finalPath);

    const stats = fs.statSync(finalPath);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`🎉 BACKUP BAIXADO COM SUCESSO!`);
    console.log(`📄 Arquivo: ${suggestedName}`);
    console.log(`📦 Tamanho: ${sizeMb} MB`);
    console.log(`📍 Caminho: ${finalPath}`);

    // Limpa os backups mais antigos mantendo apenas o último
    cleanOldBackups(1);

  } catch (error) {
    console.error('❌ Erro durante o download do backup:', error);
    // Tira screenshot para debug se necessário
    const debugScreenshot = path.join(BACKUP_DIR, 'debug_download_error.png');
    await page.screenshot({ path: debugScreenshot, fullPage: true });
    console.log(`📸 Screenshot de diagnóstico salva em: ${debugScreenshot}`);
  } finally {
    await context.close();
    console.log('🏁 Processo finalizado.');
  }
}

run().catch(console.error);

