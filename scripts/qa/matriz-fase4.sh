#!/usr/bin/env bash
set -uo pipefail
cd /root/DeskcommCRM
APP=deskcommcrm-app-1; OUT=.test-artifacts/matriz-fase4; rm -rf "$OUT"; mkdir -p "$OUT"
rodar() {
  local tag="$1" msg="$2"
  bash /root/arquivos/scripts/limpeza/limpar-teste-completo.sh 5512981325924 >/dev/null 2>&1
  local b64; b64=$(printf '%s' "$msg"|base64 -w0)
  echo "=== $tag :: $msg"
  docker exec -w /app -e QA_ORG_ID=e40dc035-b553-4383-8aac-311d29abcfdc -e QA_CHANNEL_ID=9d9d8ddc-c211-4181-a5e0-153f3d54b598 -e QA_FROM=5512981325924@c.us -e MSG_B64="$b64" -e QUIET_MS=25000 -e MAX_MS=180000 "$APP" node /app/qa-harness-turno.tmp.js > "$OUT/$tag.json" 2> "$OUT/$tag.err"
  echo "    outbound=$(grep -c '"direction": "outbound"' "$OUT/$tag.json" 2>/dev/null||true)"
}
rodar 01-cor "Quero uma moto vermelha."
rodar 02-marca "Quero uma moto Honda."
rodar 03-categoria "Quero uma moto de trilha."
rodar 04-cc160 "Quero uma 160."
rodar 05-cc160-cor "Quero uma 160 vermelha."
rodar 06-preco20 "Quero uma moto até 20 mil."
rodar 07-km30 "Quero uma moto até 30 mil km."
rodar 08-ano2024 "Quero uma moto de 2024."
rodar 09-combinado "Quero uma Honda vermelha até 20 mil."
rodar 10-trilha25 "Quero uma moto de trilha até 25 mil."
rodar 11-modelo "Quero uma CB 250."
echo FIM
