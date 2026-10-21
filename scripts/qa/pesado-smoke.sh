#!/usr/bin/env bash
# CAMADA REAL (smoke) do teste pesado — poucos turnos, modelo de verdade.
#
# Injeta inbound pelo webhook do WAHA e mede o que ficou persistido. Não julga
# "qualidade" do texto: exige outbound por turno e mostra os erros de modelo.
# A camada funcional (scripts/qa/pesado-funcional.sh) cobre as regras sem gastar
# token; esta cobre o que só o provedor real prova.
#
# Pré-requisitos (ambiente de teste, NUNCA produção):
#   - canal de teste com agente vinculado (versão temporária) e allowlist do
#     número de teste;
#   - contato de teste limpo.
#
# Env obrigatórias: QA_ORG_ID, QA_CHANNEL_ID, QA_FROM
# Opcionais: QA_SO="1,2,3" (subconjunto), QUIET_MS, MAX_MS, OUT_DIR,
#            APP_CONTAINER (default deskcommcrm-app-1)
#
# Exemplo:
#   QA_ORG_ID=... QA_CHANNEL_ID=... QA_FROM=5512...@c.us QA_SO=1,2,3 \
#     bash scripts/qa/pesado-smoke.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

: "${QA_ORG_ID:?defina QA_ORG_ID}"
: "${QA_CHANNEL_ID:?defina QA_CHANNEL_ID}"
: "${QA_FROM:?defina QA_FROM (JID do cliente de teste)}"
APP="${APP_CONTAINER:-deskcommcrm-app-1}"
OUT="${OUT_DIR:-.test-artifacts}"
QUIET_MS="${QUIET_MS:-45000}"
MAX_MS="${MAX_MS:-300000}"
SELECAO="${QA_SO:-1,2,3,4,5,6,7,8,9,10}"

mkdir -p "$OUT"
docker cp scripts/qa/harness-turno.js "$APP:/app/qa-harness-turno.tmp.js" >/dev/null

msgs=(
  "Oi, boa tarde! Queria ver as motos."
  "Quero uma moto para cidade, uso no dia a dia."
  "Gostei da CB 300 R 2011, mas achei um pouco caro."
  "Tá muito caro mesmo, não cabe no meu orçamento."
  "Quero ver mais opções."
  "Meu nome é Letícia."
  "Vocês financiam? Aceitam cartão? Onde fica a loja?"
  "Tem uma Lander 250?"
  "Quero dar minha moto na troca e financiar o restante."
  "Quero falar com um humano."
)

falhas=0
for i in $(seq 1 10); do
  case ",$SELECAO," in
    *",$i,"*) ;;
    *) continue ;;
  esac
  msg="${msgs[$((i-1))]}"
  n=$(printf '%02d' "$i")
  b64=$(printf '%s' "$msg" | base64 -w0)
  echo "=== TURNO $n :: $msg"
  docker exec -w /app \
    -e QA_ORG_ID="$QA_ORG_ID" -e QA_CHANNEL_ID="$QA_CHANNEL_ID" -e QA_FROM="$QA_FROM" \
    -e MSG_B64="$b64" -e QUIET_MS="$QUIET_MS" -e MAX_MS="$MAX_MS" \
    "$APP" node /app/qa-harness-turno.tmp.js > "$OUT/pesado-$n.json" 2> "$OUT/pesado-$n.err"
  outbound=$(grep -c '"direction": "outbound"' "$OUT/pesado-$n.json" 2>/dev/null || true)
  erros=$(grep -c '"status": "error"' "$OUT/pesado-$n.json" 2>/dev/null || true)
  printf '    outbound=%s erros_de_modelo=%s\n' "${outbound:-0}" "${erros:-0}"
  if [ "${outbound:-0}" -eq 0 ]; then
    echo "    FALHA: turno sem outbound (ver $OUT/pesado-$n.json)" >&2
    falhas=$((falhas+1))
  fi
  sleep 5
done

if [ "$falhas" -gt 0 ]; then
  echo "=== SMOKE FALHOU: $falhas turno(s) sem outbound ===" >&2
  exit 1
fi
echo "=== SMOKE OK ==="
