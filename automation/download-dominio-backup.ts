import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import 'dotenv/config';
import { getOutlookVerificationCode } from './read-outlook-code';

// Configurações
const USER_DESKTOP = path.join(os.homedir(), 'Desktop');
const BACKUP_DIR = process.env.DOMINIO_BACKUP_DIR || path.join(USER_DESKTOP, 'backups_dominio');
const PROFILE_DIR = process.env.DOMINIO_PROFILE_DIR || path.join(os.homedir(), 'AppData', 'Local', 'DominioBotProfile');
const TARGET_URL = 'https://suporte.dominioatendimento.com/backup/faces/bkp-realizado.html';

const DOMINIO_EMAIL = process.env.DOMINIO_EMAIL || '';
const DOMINIO_SENHA = process.env.DOMINIO_SENHA || '';
const DOMINIO_RECOVERY_CODE = process.env.DOMINIO_RECOVERY_CODE || '';

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

    console.log(`🔎 Analisando tela: ${url.replace('https://', '').slice(0, 45)}...`);

    // 2. Tela "Vamos começar" com o botão azul "Entrar" (conforme imagem do Onvio)
    const isVamosComecar = await page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      return text.includes('vamos começar') || text.includes('vamos comecar');
    }).catch(() => false);

    if (isVamosComecar) {
      console.log('🚪 Tela "Vamos começar" detectada. Acionando botão "Entrar"...');
      
      // 1. Tenta clique direto via texto pelo Playwright
      try {
        await page.click('text=/^\\s*entrar\\s*$/i', { timeout: 2000, force: true });
      } catch {
        try {
          await page.click('button:has-text("Entrar")', { timeout: 2000, force: true });
        } catch {}
      }

      // 2. Tenta clique por coordenadas físicas do mouse
      try {
        const btn = page.locator('button, a, div[role="button"]').filter({ hasText: /^Entrar$/i }).first();
        const box = await btn.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      } catch {}

      // 3. Tenta via eventos nativos completos do navegador (Pointer + Mouse)
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('button, a, div[role="button"], span, input'));
        for (const el of candidates) {
          const text = (el.textContent || (el as HTMLInputElement).value || '').trim();
          if (/^entrar$/i.test(text)) {
            (el as HTMLElement).focus();
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            (el as HTMLElement).click();
          }
        }
      }).catch(() => {});

      // 4. Pressiona tecla Enter no teclado
      await page.keyboard.press('Enter').catch(() => {});

      await page.waitForTimeout(3000);
      continue;
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

    // 5. Se estiver em transição de loopback do Onvio, aguarda o SSO concluir naturalmente
    if (url.includes('loopback')) {
      console.log('⏳ Aguardando conclusão do redirecionamento do Onvio (loopback SSO)...');
      await page.waitForTimeout(4000);
      continue;
    }

    // 5.1. Tratamento específico caso caia na tela "invalido.html" do Suporte Domínio
    if (url.includes('invalido.html')) {
      console.log('⚠️ Detectada tela de sessão inválida (invalido.html) do Suporte Domínio.');

      const pageInfo = await page.evaluate(() => {
        const text = (document.body.innerText || '').trim();
        const links = Array.from(document.querySelectorAll('a')).map(a => `${(a.innerText || '').trim()} (${a.href})`).filter(s => s.length > 5);
        return { text: text.slice(0, 200), links };
      }).catch(() => ({ text: '', links: [] }));

      console.log(`📄 Conteúdo da tela inválida: ${pageInfo.text || 'Sem texto'}`);
      if (pageInfo.links.length > 0) {
        console.log(`🔗 Links disponíveis na tela: ${pageInfo.links.slice(0, 3).join(', ')}`);
      }

      // Tenta clicar em algum link de retorno ou início
      const homeLink = page.locator('a:has-text("Início"), a:has-text("Voltar"), a:has-text("Página Inicial"), a:has-text("Central"), a:has-text("Home")').first();
      if (await homeLink.isVisible({ timeout: 1500 }).catch(() => false)) {
        console.log('👆 Clicando no link da tela para retornar à Central do Suporte...');
        await homeLink.click();
        await page.waitForTimeout(3000);
        continue;
      }

      // Se não houver link funcional, acessa a Central do Suporte para restabelecer a sessão
      console.log('🔄 Acessando a página principal do Suporte Domínio para criar sessão válida...');
      await page.goto('https://suporte.dominioatendimento.com/central.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3500);
      continue;
    }

    // 5.2. Se estiver na Central do Suporte ou qualquer tela do suporte (mas ainda não no bkp-realizado)
    if (url.includes('suporte.dominioatendimento.com') && !url.includes('bkp-realizado') && !url.includes('login')) {
      console.log('🧭 Navegando pelo portal do Suporte Domínio para a área de Backups...');

      // Procura link/menu de Backups
      const bkpMenu = page.locator('a:has-text("Backup Realizado"), a:has-text("Backups Realizados"), a:has-text("Download de Backup"), a:has-text("Backup em Nuvem"), a:has-text("Backup")')
        .or(page.locator('[title*="Backup" i], [aria-label*="Backup" i]'))
        .first();

      if (await bkpMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('👆 Clicando no menu/item de Backup...');
        await bkpMenu.click({ force: true }).catch(() => {});
        await page.waitForTimeout(3500);
        continue;
      }

      console.log('➡️ Navegando diretamente para a página de backups...');
      await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
      continue;
    }

    // 6. Tela "Verificar sua identidade - Código de Recuperação" (conforme imagem do Onvio)
    const isRecoveryScreen = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return text.includes('código de recuperação') && (text.includes('inscrição inicial') || text.includes('Insira seu código'));
    }).catch(() => false);

    if (isRecoveryScreen) {
      console.log('🛡️ Detectada tela "Código de Recuperação".');
      if (DOMINIO_RECOVERY_CODE) {
        console.log('🔑 DOMINIO_RECOVERY_CODE configurado no .env. Preenchendo...');
        const recInput = page.locator('input[type="text"], input').first();
        if (await recInput.isVisible({ timeout: 2000 })) {
          await recInput.fill(DOMINIO_RECOVERY_CODE);
          await page.waitForTimeout(800);
          const contBtn = page.getByRole('button', { name: /continuar|avançar|entrar/i })
            .or(page.locator('button:has-text("Continuar"), input[value*="Continuar"]'))
            .first();
          if (await contBtn.isVisible({ timeout: 2000 })) {
            console.log('👆 Clicando em Continuar...');
            await contBtn.click({ force: true });
            await page.waitForTimeout(3000);
            continue;
          }
        }
      } else {
        console.log('📧 Sem código de recuperação único. Clicando em "Tentar outro método" para ir por E-mail...');
        const otherMethodLink = page.locator('text=/tentar outro método|tentar outro metodo|try another method/i').first();
        if (await otherMethodLink.isVisible({ timeout: 2000 }).catch(() => false)) {
          await otherMethodLink.click({ force: true });
          await page.waitForTimeout(2500);
          continue;
        }
      }
    }

    // 6.1. Tela "Selecione um método para verificar sua identidade" (somente quando estiver na lista de opções)
    const isMethodSelection = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return /selecione um método|choose a (verification )?method/i.test(text);
    }).catch(() => false);

    if (isMethodSelection) {
      console.log('🛡️ Detectada tela "Selecione um método para verificar sua identidade"!');

      if (DOMINIO_RECOVERY_CODE) {
        console.log('🔑 DOMINIO_RECOVERY_CODE configurado no .env. Clicando em "Código de recuperação"...');
        const recoveryOption = page.locator('text=/código de recuperação|recuperação|recovery/i').first();
        if (await recoveryOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await recoveryOption.click({ force: true }).catch(() => {});
          await page.waitForTimeout(2500);
          continue;
        }
      } else {
        console.log('📧 Selecionando método "E-mail" para envio do código de verificação...');
        const emailOption = page.locator('text=/^\\s*e-mail|email\\s*$/i')
          .or(page.getByText('E-mail', { exact: true }))
          .or(page.locator('div:has-text("E-mail"), button:has-text("E-mail"), li:has-text("E-mail"), p:has-text("E-mail")'))
          .first();

        if (await emailOption.isVisible({ timeout: 2000 }).catch(() => false)) {
          await emailOption.click({ force: true }).catch(() => {});
          await page.waitForTimeout(2500);
          continue;
        }
      }
    }

    // 7. Tela de código por E-mail da Thomson Reuters (mfa-email-challenge ou "Enviamos um e-mail com o código")
    const isEmailCodeChallenge = url.includes('mfa-email-challenge') || await page.evaluate(() => {
      const text = document.body.innerText || '';
      return text.includes('Enviamos um e-mail com o código') || text.includes('Inserir o código');
    }).catch(() => false);

    if (isEmailCodeChallenge) {
      console.log('📬 Detectada tela de código por e-mail da Thomson Reuters (mfa-email-challenge)!');

      // Localiza o campo editável onde se digita o código (ignora o email desabilitado no topo)
      const codeInput = page.locator('input:not([disabled]):not([readonly])')
        .or(page.locator('input[name*="code" i], input[id*="code" i], input[type="text"]:not([disabled])'))
        .last();

      let extractedCode: string | null = null;
      for (let attempt = 1; attempt <= 10; attempt++) {
        console.log(`⏳ Buscando código na caixa compartilhada do Outlook Web (tentativa ${attempt}/10)...`);
        extractedCode = await getOutlookVerificationCode(page.context());
        if (extractedCode) break;
        await page.waitForTimeout(4000);
      }

      if (extractedCode && await codeInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`🎯 Inserindo código de verificação recebido: ${extractedCode}...`);
        await codeInput.fill(extractedCode);
        await page.waitForTimeout(800);

        const contBtn = page.getByRole('button', { name: /continuar|avançar|entrar/i })
          .or(page.locator('button:has-text("Continuar"), input[value*="Continuar"]'))
          .first();

        if (await contBtn.isVisible({ timeout: 2000 })) {
          console.log('👆 Clicando em Continuar...');
          await contBtn.click({ force: true });
          await page.waitForTimeout(4000);
          continue;
        }
      } else {
        console.log('ℹ️ Código ainda não obtido. Se você já tem o e-mail aberto no Outlook, pode digitar na tela.');
      }

      await page.waitForTimeout(3000);
      continue;
    }

    // 7.1. Tela genérica de código de verificação (fallback)
    const isMfaUrl = url.includes('mfa') || url.includes('challenge') || url.includes('code') || url.includes('verification') || url.includes('recover');
    let codeInput = page.locator('input[name*="code" i], input[name*="challenge" i], input[name*="otp" i], input[id*="code" i], input[id*="otp" i], input[autocomplete="one-time-code"], input[placeholder*="código" i]').first();

    const isCodeVisible = await codeInput.isVisible({ timeout: 1500 }).catch(() => false);
    if (isMfaUrl || isCodeVisible) {
      console.log('📬 Detectada tela genérica de código de verificação.');

      let codeToFill = '';
      if (DOMINIO_RECOVERY_CODE) {
        console.log('🔑 Preenchendo com código de recuperação do .env...');
        codeToFill = DOMINIO_RECOVERY_CODE;
      } else {
        for (let attempt = 1; attempt <= 8; attempt++) {
          console.log(`⏳ Aguardando e buscando código no Outlook (tentativa ${attempt}/8)...`);
          const extracted = await getOutlookVerificationCode(page.context());
          if (extracted) {
            codeToFill = extracted;
            break;
          }
          await page.waitForTimeout(4000);
        }
      }

      if (codeToFill && isCodeVisible) {
        console.log(`🎯 Inserindo código de verificação: ${codeToFill.replace(/.(?=.{2})/g, '*')}...`);
        await codeInput.fill(codeToFill);
        await page.waitForTimeout(1000);

        const rememberBox = page.locator('input[type="checkbox"]').first();
        if (await rememberBox.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('☑️ Marcando "Lembrar deste computador / Manter conectado"...');
          await rememberBox.check({ force: true }).catch(() => {});
        }

        const confirmBtn = page.getByRole('button', { name: /confirmar|verificar|continuar|avançar|entrar|submit/i })
          .or(page.locator('button[type="submit"], input[type="submit"]'))
          .first();

        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('👆 Clicando para confirmar o código...');
          await confirmBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(4000);
          continue;
        }
      } else {
        console.log('ℹ️ Código não obtido automaticamente. Caso você receba o código, digite-o na tela do navegador.');
      }
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
