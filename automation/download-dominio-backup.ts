import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import 'dotenv/config';

// Configurações
const USER_DESKTOP = path.join(os.homedir(), 'Desktop');
const BACKUP_DIR = process.env.DOMINIO_BACKUP_DIR || path.join(USER_DESKTOP, 'backups_dominio');
const PROFILE_DIR = process.env.DOMINIO_PROFILE_DIR || path.join(os.homedir(), 'AppData', 'Local', 'DominioBotProfile');
const TARGET_URL = 'https://suporte.dominioatendimento.com/backup/faces/bkp-realizado.html';

const DOMINIO_EMAIL = process.env.DOMINIO_EMAIL || '';
const DOMINIO_SENHA = process.env.DOMINIO_SENHA || '';

// Garantir que a pasta de destino exista
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Limpeza inteligente: mantém o mais recente de cada tipo
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

    if (completos.length > keepCount) {
      for (const item of completos.slice(keepCount)) {
        console.log(`🗑️ Removendo backup completo anterior: ${item.name} (${item.sizeMb} MB)`);
        fs.unlinkSync(item.fullPath);
      }
    }

    if (modificacoes.length > keepCount) {
      for (const item of modificacoes.slice(keepCount)) {
        console.log(`🗑️ Removendo backup de modificações anterior: ${item.name} (${item.sizeMb} MB)`);
        fs.unlinkSync(item.fullPath);
      }
    }
  } catch (err) {
    console.warn('Aviso ao gerenciar retenção de backups:', err);
  }
}

// Trata o fluxo completo de login (tela "Vamos começar" -> Email -> Senha -> 2FA)
async function handleLoginFlow(page: Page): Promise<void> {
  console.log('🔄 Monitorando autenticação...');
  const maxWaitMs = 300000; // 5 minutos
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const url = page.url();

    // 1. Já está na tela de backups
    if (url.includes('suporte.dominioatendimento.com') && url.includes('bkp-realizado')) {
      console.log('✅ Acesso confirmado à Central de Backups!');
      return;
    }

    // 2. Tela "Vamos começar" com o botão azul "Entrar" (conforme imagem do Onvio)
    try {
      const vamosComecarBtn = page.getByRole('button', { name: /entrar/i })
        .or(page.locator('button, a, [role="button"], input[type="submit"], input[type="button"]').filter({ hasText: /entrar/i }))
        .first();
      if (await vamosComecarBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        console.log('👆 Detectada tela "Vamos começar". Clicando no botão "Entrar"...');
        await vamosComecarBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(3000);
        continue;
      }
    } catch {}

    // 2.0. Verifica se o botão "Entrar" está dentro de algum iframe do Onvio
    for (const frame of page.frames()) {
      try {
        const frameBtn = frame.getByRole('button', { name: /entrar/i })
          .or(frame.locator('button, a, [role="button"]').filter({ hasText: /entrar/i }))
          .first();
        if (await frameBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          console.log('👆 Botão "Entrar" detectado em frame. Clicando...');
          await frameBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(2000);
          break;
        }
      } catch {}
    }

    // 2.1. Conta já salva/lembrada no navegador
    try {
      const savedAccount = page.locator('.account-tile, [data-testid="account-item"], button:has-text("@"), div[role="button"]:has-text("@")').first();
      if (await savedAccount.isVisible({ timeout: 1000 }).catch(() => false)) {
        console.log('👆 Conta salva encontrada no navegador. Clicando na conta...');
        await savedAccount.click({ force: true }).catch(() => {});
        await page.waitForTimeout(2000);
        continue;
      }
    } catch {}

    // 2.2. Marcar opção de lembrar dispositivo / manter conectado se visível
    try {
      const rememberCheckbox = page.locator('input[type="checkbox"]').first();
      if (await rememberCheckbox.isVisible({ timeout: 500 }).catch(() => false)) {
        const isChecked = await rememberCheckbox.isChecked().catch(() => true);
        if (!isChecked) {
          console.log('☑️ Marcando opção para lembrar este dispositivo / manter conectado...');
          await rememberCheckbox.check({ force: true }).catch(() => {});
        }
      }
    } catch {}

    // 3. Campo de e-mail do Onvio
    try {
      const emailInput = page.locator('input[type="email"], input[name*="email"], input[id*="username"], input[name*="username"]').first();
      if (await emailInput.isVisible({ timeout: 1000 })) {
        const val = await emailInput.inputValue();
        if (!val && DOMINIO_EMAIL) {
          console.log(`✍️ Preenchendo e-mail: ${DOMINIO_EMAIL}...`);
          await emailInput.fill(DOMINIO_EMAIL);
        }
        // Clica em Avançar / Continuar
        const nextBtn = page.locator('button:has-text("Avançar"), button:has-text("Continuar"), button:has-text("Next"), button[type="submit"]').first();
        if (await nextBtn.isVisible({ timeout: 1000 })) {
          console.log('👆 Clicando em Avançar no e-mail...');
          await nextBtn.click();
          await page.waitForTimeout(2000);
          continue;
        }
      }
    } catch {}

    // 4. Campo de senha
    try {
      const passInput = page.locator('input[type="password"]').first();
      if (await passInput.isVisible({ timeout: 1000 })) {
        const val = await passInput.inputValue();
        if (!val && DOMINIO_SENHA) {
          console.log('✍️ Preenchendo senha configurada...');
          await passInput.fill(DOMINIO_SENHA);
        }
        // Clica em Entrar / Sign in
        const submitBtn = page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Sign in")').first();
        if (await submitBtn.isVisible({ timeout: 1000 })) {
          console.log('👆 Clicando em Entrar na tela de senha...');
          await submitBtn.click();
          await page.waitForTimeout(3000);
          continue;
        }
      }
    } catch {}

    // 5. Se o login foi concluído e caiu no portal suporte
    if (url.includes('suporte.dominioatendimento.com') && !url.includes('bkp-realizado') && !url.includes('login')) {
      console.log('➡️ Navegando direto para a página de backups...');
      await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
      continue;
    }

    // 6. Se houver tela de código do Outlook
    if (url.includes('mfa') || url.includes('challenge') || url.includes('code') || url.includes('verification')) {
      console.log('📬 Aguardando confirmação do código do Outlook na tela...');
    }

    await page.waitForTimeout(2000);
  }

  throw new Error('Tempo limite excedido aguardando login.');
}

// Download de um tipo específico de backup
async function downloadBackup(page: Page, type: 'COMPLETO' | 'MODIFICACOES') {
  console.log(`\n====================================================`);
  console.log(`🎯 BAIXANDO BACKUP: [ ${type} ]`);
  console.log(`====================================================`);

  const tabText = type === 'COMPLETO' ? 'COMPLETO' : 'SOMENTE MODIFICAÇÕES';
  console.log(`🔎 Alternando para a aba "${tabText}"...`);

  try {
    // Localiza e clica na aba desejada
    const tabBtn = page.getByText(tabText, { exact: true })
      .or(page.locator(`button:has-text("${tabText}"), a:has-text("${tabText}"), input[value*="${tabText}"], span:has-text("${tabText}"), td:has-text("${tabText}"), [title*="${tabText}"]`))
      .first();

    if (await tabBtn.isVisible({ timeout: 5000 })) {
      await tabBtn.click();
      console.log(`🖱️ Aba "${tabText}" selecionada.`);
      await page.waitForTimeout(2000);
    }

    // Clica no botão PESQUISAR para recarregar os dados da tabela
    const pesquisarBtn = page.locator('button:has-text("PESQUISAR"), input[value*="PESQUISAR"], a:has-text("PESQUISAR")').first();
    if (await pesquisarBtn.isVisible({ timeout: 3000 })) {
      await pesquisarBtn.click();
      console.log('🔍 Botão PESQUISAR acionado. Aguardando tabela atualizar...');
      await page.waitForTimeout(4000);
    }
  } catch (err) {
    console.warn(`Aviso ao alternar aba ${type}:`, err);
  }

  // Localiza a linha correta pelo tipo (Completo ou Modificações) para garantir que não baixe o tipo errado
  const typeRegex = type === 'COMPLETO' ? /completo/i : /modifica/i;
  let targetRow = page.locator('table tbody tr').filter({ hasText: typeRegex }).first();

  if (!await targetRow.isVisible({ timeout: 6000 }).catch(() => false)) {
    console.log(`ℹ️ Linha específica contendo "${type}" não foi filtrada; pegando primeira linha da tabela...`);
    targetRow = page.locator('table tbody tr:first-child');
  }

  if (!await targetRow.isVisible({ timeout: 15000 })) {
    console.log(`⚠️ Nenhum registro encontrado para o tipo ${type}.`);
    return null;
  }

  const rowText = (await targetRow.innerText().catch(() => '')) || '';
  console.log(`📋 Registro encontrado: ${rowText.replace(/\s+/g, ' ').slice(0, 80)}...`);

  // Localiza o botão/link de download na linha (coluna de ações com ícone de download)
  const downloadBtn = targetRow.locator('td:nth-child(2) a, td:nth-child(2) button, a, button, [onclick], [title*="Download"], [title*="Baixar"], i, img').first();

  console.log(`⬇️ Iniciando download do backup ${type}...`);
  if (type === 'COMPLETO') {
    console.log(`⏳ NOTA: O backup COMPLETO costuma ter cerca de 5 GB.`);
    console.log(`   O download pode levar alguns minutos dependendo da sua conexão.`);
    console.log(`   Por favor, aguarde e não feche o terminal!`);
  }

  try {
    // Aguarda o disparo do download
    const [ download ] = await Promise.all([
      page.waitForEvent('download', { timeout: 300000 }), // até 5 min para iniciar
      downloadBtn.click()
    ]);

    const suggestedName = download.suggestedFilename() || `backup_${type}_${Date.now()}.dom`;
    const finalPath = path.join(BACKUP_DIR, suggestedName);

    console.log(`📥 Salvando arquivo: ${suggestedName} em ${BACKUP_DIR}...`);
    
    // Aguarda a gravação completa no disco
    await download.saveAs(finalPath);

    const stats = fs.statSync(finalPath);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);

    console.log(`\n🎉 SUCESSO! BACKUP ${type} CONCLUÍDO!`);
    console.log(`📄 Arquivo: ${suggestedName}`);
    console.log(`📦 Tamanho: ${sizeMb} MB`);
    console.log(`📍 Caminho: ${finalPath}`);

    return finalPath;
  } catch (err) {
    console.error(`❌ Erro durante o download de ${type}:`, err);
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
    console.log(`🌐 Acessando: ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Trata o fluxo de login
    await handleLoginFlow(page);

    await page.waitForTimeout(3000);

    // 1. Baixa o backup COMPLETO mais recente (...C.dom)
    await downloadBackup(page, 'COMPLETO');

    await page.waitForTimeout(3000);

    // 2. Baixa o backup de MODIFICAÇÕES mais recente (...M.dom)
    await downloadBackup(page, 'MODIFICACOES');

    // 3. Aplica retenção inteligente
    cleanOldBackups(1);

    console.log('\n✨ Todos os backups foram baixados e organizados com sucesso!');

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
      if (process.argv.includes('--keep-open')) {
        console.log('👀 Modo --keep-open ativado. O navegador permanecerá aberto.');
        await new Promise(() => {}); // Aguarda indefinidamente
      } else if (hasError) {
        console.log('⚠️ Mantendo navegador aberto por 45 segundos para análise...');
        await page.waitForTimeout(45000);
      } else {
        console.log('⏳ Sucesso! Aguardando 10 segundos antes de fechar o navegador...');
        await page.waitForTimeout(10000);
      }
      await context.close();
    }
    console.log('🏁 Robô finalizado.');
  }
}

run().catch(console.error);
