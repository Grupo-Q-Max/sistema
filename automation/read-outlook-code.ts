import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { execFileSync } from 'node:child_process';
import 'dotenv/config';

// Tenta obter o código de 6 dígitos do Outlook via diferentes estratégias
export async function getOutlookVerificationCode(): Promise<string | null> {
  console.log('🔍 Buscando código de verificação da Thomson Reuters no Outlook...');

  // Estratégia 1: Outlook Desktop via COM Object (se Outlook estiver instalado/aberto na VM)
  const comCode = fetchViaOutlookCom();
  if (comCode) {
    console.log(`✅ Código obtido via Outlook Desktop: ${comCode}`);
    return comCode;
  }

  // Estratégia 2: IMAP (se configurado no .env)
  const imapCode = await fetchViaImap();
  if (imapCode) {
    console.log(`✅ Código obtido via IMAP: ${imapCode}`);
    return imapCode;
  }

  return null;
}

// 1. Busca via IMAP (Outlook / Office 365 / Hotmail)
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

