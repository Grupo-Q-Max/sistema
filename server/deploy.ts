import {timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'deploy', 'webmin-pull.sh');

function tokenMatches(header: string | undefined) {
  const expected = process.env.DEPLOY_TOKEN;
  if (!expected) return false;
  const got = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerDeploy(app: any) {
  app.post('/api/deploy', (req: any, res: any) => {
    if (!process.env.DEPLOY_TOKEN) {
      return res.status(503).json({error: 'Deploy não configurado neste servidor'});
    }
    if (!tokenMatches(req.headers.authorization)) {
      return res.status(401).json({error: 'Token de deploy inválido'});
    }

    const child = spawn('bash', [script], {
      cwd: process.env.DEPLOY_DIR || root,
      detached: true,
      stdio: 'ignore',
      env: {...process.env, DEPLOY_REF: String(req.body?.ref || '')},
    });
    child.unref();
    res.json({ok: true, startedAt: new Date().toISOString()});
  });
}
