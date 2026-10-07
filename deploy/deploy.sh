#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${TARGET_DIR:-/var/www/html/grqm/sistema}"
echo "==> Iniciando deploy em $TARGET_DIR..."

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# Atualiza ou clona o repositório
if [ -d ".git" ]; then
  echo "==> Repositório existente. Atualizando código da branch main..."
  git fetch origin main
  git reset --hard origin/main
else
  echo "==> Clonando repositório inicial..."
  git clone https://github.com/Grupo-Q-Max/sistema.git .
fi

# Instala dependências
echo "==> Instalando dependências..."
npm ci --prefer-offline --no-audit

# Gera cliente Prisma
echo "==> Gerando Prisma Client..."
npx prisma generate

# Build da aplicação frontend (Vite)
echo "==> Gerando build de produção..."
npm run build

# Reiniciar serviço da API se existir
echo "==> Reiniciando serviço..."
if command -v pm2 >/dev/null 2>&1 && pm2 list | grep -qE "sistema|fechamento"; then
  pm2 reload sistema || pm2 restart sistema || pm2 restart fechamento
elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q '^fechamento.service'; then
  sudo systemctl restart fechamento
else
  echo "==> Deploy concluído. Caso utilize Nginx/Apache, os arquivos estáticos em dist/ foram atualizados."
fi

echo "==> Deploy finalizado com sucesso!"
