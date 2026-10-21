#!/usr/bin/env bash
# CAMADA FUNCIONAL do teste pesado — determinística, SEM modelo real.
#
# Roda typecheck + lint dos arquivos tocados + a suíte de decisão do motor
# (agent-engine/followup/ai) contra a ÁRVORE DE TRABALHO, usando a imagem do
# worker como runtime (a VPS pode não ter Node no host). Nenhum byte vai para
# provedor de modelo.
#
# Uso:
#   bash scripts/qa/pesado-funcional.sh
#   WORKER_IMAGE=ghcr.io/vgamkt/deskcomm-worker:tag bash scripts/qa/pesado-funcional.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

IMAGE="${WORKER_IMAGE:-$(docker inspect --format '{{.Config.Image}}' deskcommcrm-worker-1 2>/dev/null || true)}"
if [ -z "$IMAGE" ]; then
  echo "WORKER_IMAGE não definido e worker não encontrado" >&2
  exit 2
fi

run() {
  docker run --rm -v "$PWD:/app" -w /app --entrypoint "$1" "$IMAGE" "${@:2}"
}

echo "=== [1/3] typecheck ==="
run ./node_modules/.bin/tsc --noEmit

echo "=== [2/3] lint (arquivos alterados) ==="
ARQUIVOS="$(git diff --name-only --diff-filter=ACMR HEAD | grep -E '\.(ts|tsx)$' || true)"
if [ -n "$ARQUIVOS" ]; then
  # shellcheck disable=SC2086
  run ./node_modules/.bin/eslint $ARQUIVOS
else
  echo "(sem arquivos TS alterados)"
fi

echo "=== [3/3] suíte funcional (sem modelo) ==="
run ./node_modules/.bin/vitest run lib/agent-engine lib/followup lib/ai
echo "=== FUNCIONAL OK ==="
