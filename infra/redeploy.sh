#!/usr/bin/env bash
# Pull the current main and bring the stack up on it.
#
# The database is left alone unless RESET_DB=1. Seeding wipes every account,
# including the Telegram ones people create by opening the bot, so a routine
# deploy must not touch it.
#
#   BOT_TOKEN=... BOT_USERNAME=... bash redeploy.sh   # code only
#   RESET_DB=1 bash redeploy.sh                       # wipe and reseed
set -euo pipefail

REPO=/opt/poker
cd "$REPO"

echo "── code ─────────────────────────────────────────────"
git fetch --quiet origin main
git reset --hard --quiet origin/main
git --no-pager log --oneline -1

cd "$REPO/infra"

if [ -n "${BOT_TOKEN:-}" ]; then
  echo "── bot credentials ──────────────────────────────────"
  sed -i "s#^TELEGRAM_BOT_TOKEN=.*#TELEGRAM_BOT_TOKEN=${BOT_TOKEN}#" .env
  sed -i "s#^TELEGRAM_BOT_USERNAME=.*#TELEGRAM_BOT_USERNAME=${BOT_USERNAME}#" .env
  echo "token set (${#BOT_TOKEN} chars), username @${BOT_USERNAME}"
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "── build ────────────────────────────────────────────"
docker compose build --quiet

if [ "${RESET_DB:-0}" = "1" ]; then
  echo "── database ─────────────────────────────────────────"
  docker compose up -d db
  for _ in $(seq 1 30); do
    if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" </dev/null >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  # Every `exec -T` gets /dev/null: reading the terminal would let it swallow
  # whatever is left of this script when the script itself arrives on stdin.
  docker compose exec -T db psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' </dev/null
  echo "schema recreated"
fi

echo "── stack ────────────────────────────────────────────"
docker compose up -d --remove-orphans

echo "waiting for the API to finish migrating and start listening"
for _ in $(seq 1 60); do
  if docker compose exec -T api node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" </dev/null >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

if [ "${RESET_DB:-0}" = "1" ]; then
  echo "── demo data ────────────────────────────────────────"
  docker compose exec -T api pnpm run db:seed </dev/null
fi

echo "── result ───────────────────────────────────────────"
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
