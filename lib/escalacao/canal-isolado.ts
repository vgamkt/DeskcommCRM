/**
 * CANAL ISOLADO — o canal que NÃO influencia o atendimento dos outros.
 *
 * Por que existe: um telefone pessoal (ou de teste) ligado ao CRM pode falar com
 * os MESMOS contatos que o número comercial. Quando uma pessoa responde à mão
 * nesse telefone, o CRM grava `conversations.bot_silenced_until = 'infinity'`
 * naquele contato (atendimento manual durável, `atendimento-manual.ts`) — e como
 * o silêncio é por CONTATO, ele também calava a IA no número comercial. Medido
 * ao vivo (2026-10-06): o dono respondia um contato pelo celular pessoal (0101)
 * e a Marcela parava de responder a mesma pessoa no número comercial (2501).
 *
 * A marca `channel_sessions.metadata.ai_isolado = true` corta essa ponte:
 *   - resposta manual nesse canal NÃO pausa a IA (não grava o silêncio durável);
 *   - silêncio já existente nesse canal NÃO conta como handoff para o turno de
 *     outro canal (`isLeadInHandoff`).
 *
 * É opt-in e por canal: ausente/false = comportamento de sempre.
 */
export const AI_CANAL_ISOLADO_KEY = "ai_isolado";

/** `true` só quando o jsonb traz exatamente `ai_isolado: true`. Falha fechado. */
export function canalIsolado(metadata: unknown): boolean {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>)[AI_CANAL_ISOLADO_KEY] === true;
}
