#!/usr/bin/env bash
#
# release-local.sh — RELEASE COMPLETO NA PRÓPRIA VPS, sem depender de CI.
#
# Faz, em ordem: verifica (typecheck/lint/testes) → commit → push do código →
# build das TRÊS imagens (app, worker, scheduler) com SWAP TEMPORÁRIO (a VPS não
# tem swap e o `next build` precisa de ~4 GB) → push pro GHCR (tags `<versao>` e
# `latest`). NÃO faz o deploy dos contêineres — isso é `deploy-vps.sh`.
#
# Uso:  scripts/release-local.sh <versao>        ex.: scripts/release-local.sh 1.30.0
# Env:  SKIP_VERIFY=1   pula a verificação (NÃO recomendado)
#       SKIP_PUSH=1     não faz push do git (só commit local)
#
set -euo pipefail

cd "$(dirname "$0")/.."

VER="${1:?informe a versao, ex.: scripts/release-local.sh 1.30.0}"
OWNER="${GHCR_OWNER:-vgamkt}"
REG="ghcr.io/${OWNER}"
APP_IMG="${REG}/deskcommcrm"
WORKER_IMG="${REG}/deskcomm-worker"
SCHED_IMG="${REG}/deskcomm-scheduler"
SWAP_FILE="/swapfile-release-tmp"
SWAP_SIZE="6G"

limpar_swap() {
  if swapon --show=NAME 2>/dev/null | grep -q "^${SWAP_FILE}$"; then
    swapoff "$SWAP_FILE" || true
  fi
  rm -f "$SWAP_FILE" || true
}
trap limpar_swap EXIT

echo "== 1/6 verificação (typecheck + lint + testes) =="
if [ "${SKIP_VERIFY:-0}" = "1" ]; then
  echo "   SKIP_VERIFY=1 — pulando"
else
  docker run --rm -e NODE_OPTIONS=--max-old-space-size=6144 \
    -v "$PWD":/app -w /app node:22-slim ./node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json
  docker run --rm -v "$PWD":/app -w /app node:22-slim ./node_modules/.bin/eslint .
  # node:22 (full) e não slim: alguns testes varrem o git (`git ls-files`) e o
  # slim não traz o binário — o resultado seria `spawnSync git ENOENT`.
  docker run --rm -e NODE_OPTIONS=--max-old-space-size=6144 \
    -v "$PWD":/app -w /app node:22 ./node_modules/.bin/vitest run
fi

echo "== 2/6 commit + push do código =="
git add -A
if git diff --cached --quiet; then
  echo "   nada novo para commitar"
else
  git commit -m "release v${VER}: correções de atendimento (áudio/transcrição, nome, catálogo, CNH, fluxos, Groq, garantia)"
fi
if [ "${SKIP_PUSH:-0}" = "1" ]; then
  echo "   SKIP_PUSH=1 — não enviando"
elif [ -f /root/.gh-token ]; then
  # Token do GitHub já na VPS (não fica persistido no .git/config).
  git push "https://x-access-token:$(cat /root/.gh-token)@github.com/vgamkt/DeskcommCRM.git" HEAD
else
  git push origin HEAD
fi

echo "== 3/6 swap temporário (${SWAP_SIZE} em ${SWAP_FILE}) =="
if swapon --show=NAME 2>/dev/null | grep -q "^${SWAP_FILE}$"; then
  echo "   já ativo"
else
  fallocate -l "$SWAP_SIZE" "$SWAP_FILE" || dd if=/dev/zero of="$SWAP_FILE" bs=1M count=6144
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE"
  swapon "$SWAP_FILE"
fi
free -h | head -2

echo "== 4/6 build das imagens (app, worker, scheduler) =="
APP_IMAGE="${APP_IMG}:${VER}" \
WORKER_IMAGE="${WORKER_IMG}:${VER}" \
SCHEDULER_IMAGE="${SCHED_IMG}:${VER}" \
docker compose -f docker-compose.prod.yml -f docker-compose.build.yml --env-file .env \
  build app worker scheduler

echo "== 5/6 retag latest + push pro GHCR =="
docker tag "${APP_IMG}:${VER}"    "${APP_IMG}:latest"
docker tag "${WORKER_IMG}:${VER}" "${WORKER_IMG}:latest"
docker tag "${SCHED_IMG}:${VER}"  "${SCHED_IMG}:latest"
for img in "$APP_IMG" "$WORKER_IMG" "$SCHED_IMG"; do
  docker push "${img}:${VER}"
  docker push "${img}:latest"
done

echo "== 6/6 pronto: imagens ${VER} e latest publicadas no GHCR =="
echo "   deploy:  scripts/deploy-vps.sh"
