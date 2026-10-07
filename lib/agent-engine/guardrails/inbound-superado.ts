/**
 * "O TURNO FOI SUPERADO POR UMA INBOUND MAIS NOVA?" — checagem determinística.
 *
 * ─── O defeito (medido ao vivo 2026-10-06) ───────────────────────────────────
 * O turno decide a resposta no INÍCIO e a envia no FIM. O modelo leva 30–60s; se
 * o cliente manda outra mensagem nesse meio, o turno envia a resposta VELHA — e a
 * pergunta já respondida volta ("Para o financiamento, pode me passar seu CPF?"
 * depois de o cliente ter mandado o CPF). Não é de um fluxo nem de um turno: é de
 * QUALQUER envio. Por isso a checagem vive aqui e é usada:
 *   - no `runBeforeSend` (gate `inbound_superada`) — todo envio passa por lá;
 *   - no fim do turno, antes das contingências (não manda nada se foi superado).
 *
 * Compara a ÚLTIMA inbound da conversa com a inbound que o turno responde: se
 * forem diferentes, chegou mensagem mais nova → o PRÓXIMO turno responde com o
 * contexto atualizado (rajada inteira). Determinístico, por id — não por tempo.
 */
import type { Queryable } from '../queue/queue';

/**
 * Chegou mensagem inbound mais nova do que `triggerInboundId` nesta conversa?
 * Best-effort: qualquer falha de leitura devolve `false` (não cala o cliente por
 * causa de um SELECT que não voltou).
 */
export async function haInboundMaisNova(
  db: Queryable,
  organizationId: string,
  conversationId: string,
  triggerInboundId: string | null | undefined,
): Promise<boolean> {
  if (!triggerInboundId) return false;
  try {
    const { rows } = await db.query<{ id: string }>(
      `select id from messages
        where organization_id = $1 and conversation_id = $2 and direction = 'inbound'
        order by coalesce(sent_at, created_at) desc, created_at desc, id desc
        limit 1`,
      [organizationId, conversationId],
    );
    const ultima = rows[0]?.id;
    return ultima !== undefined && ultima !== triggerInboundId;
  } catch {
    return false;
  }
}

/**
 * A mesma checagem, a partir do JOB (`inbound_turn`): lê o payload
 * (`conversation_id` + `inbound_message_id`) e compara com a última inbound.
 * Job que não é `inbound_turn` (follow-up, operador) → `false` (não se aplica).
 */
export async function jobInboundFoiSuperado(
  db: Queryable,
  organizationId: string,
  jobId: string | null | undefined,
): Promise<boolean> {
  if (!jobId) return false;
  try {
    const { rows } = await db.query<{
      kind: string;
      conversation_id: string | null;
      inbound_message_id: string | null;
    }>(
      `select kind, payload->>'conversation_id' as conversation_id,
              payload->>'inbound_message_id' as inbound_message_id
         from job_queue where organization_id = $1 and id = $2 limit 1`,
      [organizationId, jobId],
    );
    const row = rows[0];
    if (!row || row.kind !== 'inbound_turn' || !row.conversation_id || !row.inbound_message_id) {
      return false;
    }
    return haInboundMaisNova(db, organizationId, row.conversation_id, row.inbound_message_id);
  } catch {
    return false;
  }
}
