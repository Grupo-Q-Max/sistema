import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { execFileSync } from 'node:child_process';
import type { BrowserContext, Page } from 'playwright';
import 'dotenv/config';

// Tenta obter o código de 6 dígitos do Outlook via diferentes estratégias
export async function getOutlookVerificationCode(context?: BrowserContext): Promise<string | null> {
  console.log('🔍 Buscando código de verificação da Thomson Reuters no Outlook...');

  // Estratégia 1: Outlook Web via aba do navegador (Microsoft 365 Cloud)
  if (context) {
    const webCode = await fetchViaOutlookWeb(context);
    if (webCode) {
      console.log(`✅ Código obtido via Outlook Web: ${webCode}`);
      return webCode;
    }
  }

  // Estratégia 2: Outlook Desktop via COM Object (se Outlook estiver instalado/aberto na VM)
  const comCode = fetchViaOutlookCom();
  if (comCode) {
    console.log(`✅ Código obtido via Outlook Desktop: ${comCode}`);
    return comCode;
  }

  // Estratégia 3: IMAP (se configurado no .env)
  const imapCode = await fetchViaImap();
  if (imapCode) {
    console.log(`✅ Código obtido via IMAP: ${imapCode}`);
    return imapCode;
  }

  return null;
}

// 1. Busca via Outlook Web (Microsoft 365 Cloud na caixa compartilhada sistemas@grupoqmax.com.br)
async function fetchViaOutlookWeb(context: BrowserContext): Promise<string | null> {
  let mailTab: Page | null = null;
  try {
    mailTab = await context.newPage();
    const targetUrl = process.env.OUTLOOK_SHARED_URL || 'https://outlook.cloud.microsoft/mail/sistemas@grupoqmax.com.br/?ui=pt-BR&rs=BR';
    console.log(`🌐 Acessando caixa compartilhada no Outlook Web: sistemas@grupoqmax.com.br...`);

    await mailTab.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await mailTab.bringToFront().catch(() => {});
    await mailTab.waitForTimeout(2500);

    // Verifica se precisa de login na conta Microsoft
    const checkNeedsLogin = async (): Promise<boolean> => {
      if (!mailTab || mailTab.isClosed()) return false;
      const currentUrl = mailTab.url();
      if (/login\.microsoft|login\.live|login\.windows|signin|oauth2/i.test(currentUrl)) return true;
      return await mailTab.evaluate(() => {
        const hasLoginInput = !!document.querySelector('input[type="email"], input[name="loginfmt"], #i0116, #i0118, #idSIButton9');
        const text = (document.body.innerText || '').toLowerCase();
        const hasLoginText = text.includes('insira sua senha') || text.includes('entrar na sua conta') || text.includes('escolha uma conta') || text.includes('pick an account');
        return hasLoginInput || hasLoginText;
      }).catch(() => false);
    };

    let needsLogin = await checkNeedsLogin();

    if (needsLogin) {
      console.log('\n================================================================');
      console.log('⚠️  LOGIN NO OUTLOOK WEB NECESSÁRIO (PRIMEIRA VEZ)');
      console.log('    1. A aba do Outlook Web foi aberta no seu navegador.');
      console.log('    2. Digite seu e-mail e senha da Microsoft.');
      console.log('    3. Marque "Continuar conectado? (Sim)" para salvar a sessão.');
      console.log('    ⏳ Aguardando você concluir o login (até 3 minutos)...');
      console.log('================================================================\n');

      const maxLoginWaitMs = 180000; // 3 minutos para logar com calma
      const loginStart = Date.now();

      while (Date.now() - loginStart < maxLoginWaitMs) {
        if (!mailTab || mailTab.isClosed()) {
          console.log('⚠️ A aba do Outlook foi fechada manualmente.');
          return null;
        }

        const stillNeedsLogin = await checkNeedsLogin();
        const url = mailTab.url();
        const isInsideMailbox = /outlook\.(cloud\.microsoft|office\.com|office365\.com)\/mail/i.test(url) && !stillNeedsLogin;

        if (isInsideMailbox) {
          console.log('✅ Login no Outlook Web concluído com sucesso!');
          console.log('💾 Sessão gravada no perfil DominioBotProfile (não pedirá login nas próximas vezes).');
          await mailTab.waitForTimeout(4000);
          break;
        }

        await mailTab.waitForTimeout(2000);
      }
    }

    // Garante que está na caixa compartilhada sistemas@grupoqmax.com.br
    const currentUrl = mailTab.url();
    if (!currentUrl.includes('sistemas@grupoqmax.com.br')) {
      console.log('📬 Navegando para a caixa compartilhada sistemas@grupoqmax.com.br...');
      await mailTab.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await mailTab.waitForTimeout(4000);
    }

    console.log('🔍 Monitorando e abrindo o e-mail da Thomson Reuters na caixa de entrada...');

    // Monitora a chegada e leitura do e-mail por até 60 segundos
    const searchStart = Date.now();
    while (Date.now() - searchStart < 60000) {
      if (!mailTab || mailTab.isClosed()) return null;

      // 1. Primeiro verifica se o código já está visível em algum lugar da tela
      const pageText = await mailTab.evaluate(() => document.body.innerText || '').catch(() => '');
      const instantMatch = pageText.match(/para Onvio:?\s*(\d{6})/i) ||
        pageText.match(/dois fatores[\s\S]{1,60}?(\d{6})/i);

      if (instantMatch && instantMatch[1]) {
        const code = instantMatch[1];
        console.log(`🎯 Código extraído diretamente da tela: ${code}`);
        await mailTab.close().catch(() => {});
        return code;
      }

      // 2. Localiza especificamente o item da Thomson Reuters pelo assunto ou remetente
      const emailSubject = mailTab.locator('span:has-text("Seu código de autenticação de dois fatores"), div:has-text("Seu código de autenticação de dois fatores")')
        .or(mailTab.locator('text=/Seu código de autenticação de dois fatores/i'))
        .first();

      const emailSender = mailTab.locator('span:has-text("Thomson Reuters"), div:has-text("Thomson Reuters")').first();

      const targetItem = (await emailSubject.isVisible({ timeout: 1500 }).catch(() => false))
        ? emailSubject
        : (await emailSender.isVisible({ timeout: 1500 }).catch(() => false))
          ? emailSender
          : null;

      if (targetItem) {
        console.log('📩 E-mail da Thomson Reuters localizado na lista! Abrindo para leitura...');

        // Clica no assunto com force
        await targetItem.click({ force: true }).catch(() => {});
        await mailTab.waitForTimeout(500);

        // Pressiona Enter no teclado para forçar o Outlook a abrir no painel de leitura
        await mailTab.keyboard.press('Enter').catch(() => {});
        await mailTab.waitForTimeout(1500);

        // Se ainda não abriu, tenta duplo clique
        await targetItem.dblclick({ force: true }).catch(() => {});
        await mailTab.waitForTimeout(1500);

        // Extrai o texto do corpo da mensagem
        const updatedText = await mailTab.evaluate(() => {
          const bodyEl = document.querySelector('[role="main"], [aria-label*="Conteúdo da mensagem" i], .ReadingPaneContainer, #ItemHeaderTitle, div[tabindex="-1"]') || document.body;
          return bodyEl ? bodyEl.innerText || '' : '';
        }).catch(() => '');

        const onvioMatch = updatedText.match(/para Onvio:?\s*(\d{6})/i) ||
          updatedText.match(/dois fatores:?\s*(\d{6})/i) ||
          updatedText.match(/(?<!\d)(\d{6})(?!\d)/);

        if (onvioMatch && onvioMatch[1]) {
          const code = onvioMatch[1];
          console.log(`🎯 Código extraído com sucesso do e-mail: ${code}`);
          await mailTab.close().catch(() => {});
          return code;
        }
      }

      await mailTab.waitForTimeout(3000);
    }
  } catch (err) {
    console.warn('Aviso ao consultar Outlook Web:', err);
  } finally {
    if (mailTab && !mailTab.isClosed()) {
      await mailTab.close().catch(() => {});
    }
  }

  return null;
}

// 2. Busca via IMAP (Outlook / Office 365 / Hotmail)
async function fetchViaImap(): Promise<string | null> {
  const email = process.env.OUTLOOK_EMAIL || process.env.DOMINIO_EMAIL || '';
  const password = process.env.OUTLOOK_PASSWORD || process.env.DOMINIO_SENHA || '';
  const host = process.env.OUTLOOK_IMAP_HOST || 'outlook.office365.com';
  const port = Number(process.env.OUTLOOK_IMAP_PORT || 993);

  if (!email || !password) {
    return null;
  }

  try {
    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: {
        user: email,
        pass: password,
      },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      // Busca mensagens dos últimos 10 minutos
      const sinceDate = new Date(Date.now() - 10 * 60 * 1000);
      const messages = await client.search({ since: sinceDate }, { uid: true });

      if (messages && messages.length > 0) {
        // Pega a mensagem mais recente
        const latestUid = messages[messages.length - 1];
        const downloaded = await client.download(String(latestUid));

        if (downloaded && downloaded.content) {
          const parsed = await simpleParser(downloaded.content);
          const fullText = `${parsed.subject || ''} ${parsed.text || ''}`;

          // Verifica se é da Thomson Reuters / Onvio
          const isFromReuters = /thomson|reuters|onvio|dominio/i.test(parsed.from?.text || '') ||
            /thomson|reuters|onvio|dominio|código|codigo|segurança/i.test(parsed.subject || '');

          if (isFromReuters) {
            const match = fullText.match(/\b(\d{6})\b/);
            if (match && match[1]) {
              return match[1];
            }
          }
        }
      }
    } finally {
      lock.release();
      await client.logout();
    }
  } catch (err: any) {
    // IMAP pode não estar habilitado
  }

  return null;
}

// 2. Busca via Outlook Desktop (PowerShell COM Object com Base64 seguro para evitar erro de shell)
function fetchViaOutlookCom(): string | null {
  try {
    const psScript = `
      $ErrorActionPreference = 'SilentlyContinue'
      try {
        $outlook = $null
        try {
          $outlook = [System.Runtime.InteropServices.Marshal]::GetActiveObject("Outlook.Application")
        } catch {}
        if (-not $outlook) {
          $outlook = New-Object -ComObject Outlook.Application
        }
        if (-not $outlook) { exit 1 }

        $mapi = $outlook.GetNamespace("MAPI")
        $inbox = $mapi.GetDefaultFolder(6) # 6 = olFolderInbox
        $items = $inbox.Items
        $items.Sort("[ReceivedTime]", $true)
        $recent = $items | Select-Object -First 5

        foreach ($mail in $recent) {
          $subject = "$($mail.Subject)"
          $body = "$($mail.Body)"
          $sender = "$($mail.SenderName) $($mail.SenderEmailAddress)"
          $combined = "$sender $subject $body"

          if ($combined -match "thomson|reuters|onvio|dominio|código|codigo|verificação|identidade") {
            if ($combined -match "(?<!\d)(\d{6})(?!\d)") {
              [Console]::Out.WriteLine($matches[1])
              exit 0
            }
          }
        }
      } catch {
        exit 1
      }
    `;

    // Codifica em UTF-16LE Base64 para execução 100% segura sem interferência do CMD
    const base64 = Buffer.from(psScript, 'utf16le').toString('base64');
    const rawOutput = execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      base64
    ], {
      timeout: 8000,
      encoding: 'utf-8',
    });

    // Remove eventuais tags CLIXML do PowerShell e busca 6 dígitos
    const cleanOutput = rawOutput.replace(/<[^>]+>/g, '').trim();
    const match = cleanOutput.match(/\b(\d{6})\b/);
    if (match && match[1]) {
      return match[1];
    }
  } catch {}

  return null;
}

