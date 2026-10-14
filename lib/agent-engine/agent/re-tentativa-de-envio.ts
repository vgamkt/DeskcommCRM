/**
 * RE-TENTATIVA DO TURNO POR ENVIO — decide se o job deve ser re-tentado após os
 * envios do turno. Pura.
 *
 * ⚠️ REGRA (medida ao vivo 2026-10-14): re-rodar o turno re-EXECUTA o modelo, que
 * NÃO é determinístico — então um retry reenvia (o ledger por `jobId+seq` não
 * dedupa conteúdo diferente) e o cliente recebe o catálogo DUPLICADO. Defeito real:
 * uma peça falhou (`datafy_error: fetch failed`, transitória) e o retry reenviou
 * moto + pergunta.
 *
 * Portanto: só re-tenta quando NADA foi entregue (`failed` presente E nenhum
 * `sent`/`already_sent`/`queued`). Com envio PARCIAL, NÃO re-tenta — o item
 * perdido é melhor que duplicar a conversa inteira.
 */
const ENVIADOS = new Set(['sent', 'already_sent', 'queued']);

export function deveReTentarTurnoPorEnvio(outcomes: readonly { kind: string }[]): boolean {
  const falhas = outcomes.filter((o) => o.kind === 'failed').length;
  const enviados = outcomes.filter((o) => ENVIADOS.has(o.kind)).length;
  return falhas > 0 && enviados === 0;
}
