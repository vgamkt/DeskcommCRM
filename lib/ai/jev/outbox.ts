/**
 * OUTBOX da Jev — retry DURÁVEL das decisões que esgotaram por TPM/instabilidade.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * O motor da Jev tenta 12× dentro do turno e, se esgotar, o ponto cai no modelo
 * de chat: o agente SEMPRE responde. Mas a decisão da Jev se PERDIA. Se o
 * provedor estourou o limite de tokens por minuto (TPM), aquela decisão só
 * voltaria num turno futuro, se voltasse.
 *
 * Este outbox grava a decisão que falhou como evento em `event_log`
 * (`jev.decision_retry`) — a fila DURÁVEL que já sobrevive a restart, tem
 * backoff e reaper. O drain genérico do worker reprocessa; quando o TPM cede, a
 * Jev decide e a decisão fica registrada.
 *
 * ⚠️ NÃO guarda segredo: o payload leva só `point` + `state` + `questions`. Os
 * alvos (com a API key) são re-resolvidos no retry por `alvosDeJevDaOrg`.
 * ⚠️ NÃO bloqueia o turno: enfileirar é best-effort; falha ao persistir não
 * derruba a resposta (que já saiu pelo fallback).
 *
 * LIMITE DECLARADO: o retry reprocessa e REGISTRA a decisão; ele não a aplica
 * retroativamente a um turno que já terminou (decisão tardia seria stale). Para
 * os pontos assíncronos o consumidor original já tem fallback; aqui o ganho é a
 * garantia de que a decisão acontece e fica auditável.
 */
import type pg from 'pg';
import { z } from 'zod';

import { getRequestPool } from '@/lib/agent-engine/db/request-pool';
import type { EventHandler, HandlerResult } from '@/lib/event-log/dispatcher';
import { logger } from '@/lib/logger';

import { decidir } from './index';
import { alvosDeJevDaOrg } from './resolver';
import { registrarDecisaoJev } from './telemetria';
import type { PerguntasDeJev } from './tipos';

export const EVENTO_DE_RETRY_DA_JEV = 'jev.decision_retry';

const payloadSchema = z.object({
  point: z.string().min(1),
  state: z.unknown(),
  questions: z.record(z.string(), z.unknown()),
  perguntasObrigatorias: z.array(z.string()).optional(),
});

export interface DecisaoParaOutbox {
  organizationId: string;
  point: string;
  state: unknown;
  questions: PerguntasDeJev;
  perguntasObrigatorias?: string[];
}

/**
 * Grava a decisão que esgotou como evento durável. Best-effort: NUNCA lança —
 * o turno já respondeu pelo fallback e não pode cair por causa da persistência.
 */
export async function enfileirarDecisaoJev(
  db: { query: pg.Pool['query'] },
  args: DecisaoParaOutbox,
): Promise<void> {
  try {
    await db.query(
      `insert into event_log (organization_id, event_type, entity_kind, entity_id, payload, status)
       values ($1, $2, 'jev_point', null, $3::jsonb, 'pending')`,
      [
        args.organizationId,
        EVENTO_DE_RETRY_DA_JEV,
        JSON.stringify({
          point: args.point,
          state: args.state,
          questions: args.questions,
          ...(args.perguntasObrigatorias !== undefined
            ? { perguntasObrigatorias: args.perguntasObrigatorias }
            : {}),
        }),
      ],
    );
  } catch (err) {
    logger.warn('[jev.outbox] não consegui persistir a decisão pendente', {
      point: args.point,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Handler do `event_log`: re-resolve os alvos do ponto e tenta a Jev de novo.
 * `error` faz o drain reagendar com backoff (a fila durável cuida do resto).
 */
export const jevRetryHandler: EventHandler = {
  key: 'jev_retry',
  events: [EVENTO_DE_RETRY_DA_JEV],
  async handle(row): Promise<HandlerResult> {
    const parsed = payloadSchema.safeParse(row.payload);
    if (!parsed.success) {
      return { consumer_key: 'jev_retry', status: 'skipped', detail: 'payload inválido' };
    }
    const { point, state, questions, perguntasObrigatorias } = parsed.data;
    let alvos: Awaited<ReturnType<typeof alvosDeJevDaOrg>>;
    try {
      alvos = await alvosDeJevDaOrg(getRequestPool(), row.organization_id, point);
    } catch (err) {
      return {
        consumer_key: 'jev_retry',
        status: 'error',
        detail: err instanceof Error ? err.message : 'falha ao resolver alvos',
      };
    }
    if (alvos.length === 0) {
      return { consumer_key: 'jev_retry', status: 'skipped', detail: 'sem alvos Jev para o ponto' };
    }
    const decisao = await decidir({
      alvos,
      state,
      questions: questions as PerguntasDeJev,
      ...(perguntasObrigatorias !== undefined ? { perguntasObrigatorias } : {}),
    });
    if (decisao === null) {
      return { consumer_key: 'jev_retry', status: 'error', detail: 'Jev esgotou de novo' };
    }
    registrarDecisaoJev(logger, point, decisao);
    return {
      consumer_key: 'jev_retry',
      status: 'ok',
      detail: `${point}:${decisao.provider}/${decisao.model}`,
    };
  },
};
