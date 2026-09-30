#!/usr/bin/env bash
#
# deploy-vps.sh — DEPLOY na VPS: puxa as imagens `latest` do GHCR e sobe
# app, worker e scheduler juntos (o app roda o cron de mídia; subir só um deixa
# o outro com código diferente no mesmo banco).
#
# Uso:  scripts/deploy-vps.sh
# Env:  IMAGES="app worker scheduler" (default) — subconjunto para subir.
#
set -euo pipefail
cd "$(dirname "$0")/.."

SERVICOS="${IMAGES:-app worker scheduler}"

echo "== pull =="
docker compose -f docker-compose.prod.yml --env-file .env pull ${SERVICOS}

echo "== up -d =="
docker compose -f docker-compose.prod.yml --env-file .env up -d --no-deps ${SERVICOS}

echo "== estado =="
docker ps --filter name=deskcommcrm --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
