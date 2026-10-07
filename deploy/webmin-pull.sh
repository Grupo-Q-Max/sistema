#!/usr/bin/env bash
set -euo pipefail

ROOT="${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

LOCK="/tmp/fechamento-deploy.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "Já existe um deploy em andamento"
  exit 0
fi

git fetch origin
git checkout -B main origin/main
npm ci
npx prisma generate
npm run build

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^fechamento.service'; then
  sudo systemctl restart fechamento
else
  echo "Serviço systemd 'fechamento' não encontrado. Atualize o código e reinicie a API no Webmin."
fi
