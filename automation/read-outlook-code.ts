import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { execSync } from 'node:child_process';
import 'dotenv/config';

// Tenta obter o código de 6 dígitos do Outlook via diferentes estratégias
export async function getOutlookVerificationCode(): Promise<string | null> {
  console.log('🔍 Buscando código de verificação da Thomson Reuters no Outlook...');

  // Estratégia 1: IMAP (se configurado no .env)
  const imapCode = await fetchViaImap();
  if (imapCode) {
    console.log(`✅ Código obtido via IMAP: ${imapCode}`);
    return imapCode;
  }

  // Estratégia 2: Outlook Desktop via COM Object (se Outlook estiver instalado na VM)
  const comCode = fetchViaOutlookCom();
  if (comCode) {
    console.log(`✅ Código obtido via Outlook Desktop: ${comCode}`);
    return comCode;
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
      // Busca mensagens dos últimos 5 minutos
      const sinceDate = new Date(Date.now() - 5 * 60 * 1000);
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
    // IMAP pode falhar se não houver app password ou se basic auth estiver restrito
  }

  return null;
}

// 2. Busca via Outlook Desktop (PowerShell COM Object)
function fetchViaOutlookCom(): string | null {
  try {
    const psScript = `
      try {
        $outlook = New-Object -ComObject Outlook.Application -ErrorAction Stop
        $mapi = $outlook.GetNamespace("MAPI")
        $inbox = $mapi.GetDefaultFolder(6) # olFolderInbox
        $items = $inbox.Items
        $items.Sort("[ReceivedTime]", $true)
        $recent = $items | Select-Object -First 3
        foreach ($mail in $recent) {
          $subject = $mail.Subject
          $body = $mail.Body
          $sender = $mail.SenderName
          $combined = "$sender $subject $body"
          if ($combined -match "(thomson|reuters|onvio|dominio|código|codigo)") {
            if ($combined -match "\\b(\\d{6})\\b") {
              Write-Output $matches[1]
              exit 0
            }
          }
        }
      } catch {
        exit 1
      }
    `.replace(/\r?\n/g, ' ');

    const output = execSync(`powershell -NoProfile -Command "${psScript}"`, {
      timeout: 5000,
      encoding: 'utf-8',
    }).trim();

    if (/^\d{6}$/.test(output)) {
      return output;
    }
  } catch {}

  return null;
}

