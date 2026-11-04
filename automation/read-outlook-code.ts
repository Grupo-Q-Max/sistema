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
    console.log(`🌐 Verificando caixa compartilhada no Outlook Web: sistemas@grupoqmax.com.br...`);

    await mailTab.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});

    // Se estiver na tela de login da Microsoft, aguarda o usuário logar na primeira vez para salvar os cookies
    if (mailTab.url().includes('login.microsoftonline.com') || mailTab.url().includes('login.live.com')) {
      console.log('\n================================================================');
      console.log('⚠️  ATENÇÃO: Faça login na sua conta Microsoft no navegador!');
      console.log('    Marque "Manter conectado (Sim)" para salvar os cookies.');
      console.log('================================================================\n');

      const loggedIn = await mailTab.waitForURL(
        url => url.toString().includes('outlook.cloud.microsoft') || url.toString().includes('outlook.office.com'),
        { timeout: 70000 }
      ).then(() => true).catch(() => false);

      if (!loggedIn) {
        console.log('ℹ️ Tempo limite aguardando login no Outlook Web.');
        await mailTab.close().catch(() => {});
        return null;
      }

      console.log('✅ Login no Outlook Web concluído! Sessão gravada no perfil.');
      await mailTab.waitForTimeout(4000);
    }

    // Aguarda a lista de mensagens carregar
    await mailTab.waitForTimeout(3500);

    // Procura mensagem recente da Thomson Reuters
    const emailItem = mailTab.locator(
      '[role="option"], [data-convid], div[aria-label*="Thomson Reuters" i], div[aria-label*="autenticação" i], span:has-text("Thomson Reuters"), span:has-text("autenticação de dois fatores")'
    ).first();

    if (await emailItem.isVisible({ timeout: 6000 }).catch(() => false)) {
      console.log('📩 Mensagem recente da Thomson Reuters localizada. Abrindo...');
      await emailItem.click({ force: true }).catch(() => {});
      await mailTab.waitForTimeout(2000);

      // Extrai o texto da mensagem exibida
      const bodyText = await mailTab.evaluate(() => {
        const bodyEl = document.querySelector('[role="main"], [aria-label*="Conteúdo da mensagem" i], .ReadingPaneContainer, #ItemHeaderTitle') || document.body;
        return bodyEl ? bodyEl.innerText || '' : '';
      }).catch(() => '');

      // Padrão do e-mail da Thomson Reuters: "Aqui está seu código de autenticação de dois fatores para Onvio: \n 338794"
      const onvioMatch = bodyText.match(/para Onvio:?\s*(\d{6})/i) ||
        bodyText.match(/dois fatores:?\s*(\d{6})/i) ||
        bodyText.match(/(?<!\d)(\d{6})(?!\d)/);

      if (onvioMatch && onvioMatch[1]) {
        const code = onvioMatch[1];
        await mailTab.close().catch(() => {});
        return code;
      }
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

