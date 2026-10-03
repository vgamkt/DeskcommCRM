/**
 * ESTADO DA NEGOCIAÇÃO — persistência ESTRUTURADA em `negotiation_state`.
 *
 * POR QUE: a negociação de objeção ("achei caro") precisa sobreviver à conversa e
 * ao tempo. Se o cliente voltar a falar DIAS depois, o sistema reconhece em que
 * tentativa está e se já foi encaminhado. A chave é `topic` (`objecao:<motivo>:<moto>`):
 * a contagem é POR assunto; mudou o assunto → nova linha (reinicia).
 *
 * Nunca lança: falha de banco devolve `null`/no-op (o turno segue com a régua antiga).
 */
import type pg from 'pg';

import { normalizarNomeDeMoto } from '@/lib/agent-engine/agent/fotos-do-catalogo';

export type MotivoNegociacao = 'preco' | 'km' | 'ano' | 'outro';
export type StatusNegociacao = 'negociando' | 'aguardando_confirmacao' | 'encaminhado' | 'encerrado';

export interface NegotiationState {
  id: string;
  contactId: string;
  conversationId: string | null;
  topic: string;
  motivo: MotivoNegociacao;
  attempts: number;
  valorPropostaCents: number | null;
  status: StatusNegociacao;
  awaitingConfirmation: boolean;
  encaminhadoAt: string | null;
}

/** Chave do estado: `objecao:<motivo>:<moto normalizada>` (moto vazia vira `_`). */
export function topicDeObjecao(motivo: string, motoNome: string | null | undefined): string {
  const m = (motoNome ?? '').trim();
  const moto = m === '' ? '_' : normalizarNomeDeMoto(m);
  return `objecao:${motivo}:${moto}`;
}

interface LinhaBruta {
  id: string;
  contact_id: string;
  conversation_id: string | null;
  topic: string;
  motivo: string;
  attempts: number;
  valor_proposta_cents: string | number | null;
  status: string;
  awaiting_confirmation: boolean;
  encaminhado_at: string | null;
}

function mapear(r: LinhaBruta): NegotiationState {
  return {
    id: r.id,
    contactId: r.contact_id,
    conversationId: r.conversation_id,
    topic: r.topic,
    motivo: r.motivo as MotivoNegociacao,
    attempts: r.attempts,
    valorPropostaCents:
      r.valor_proposta_cents === null ? null : Number(r.valor_proposta_cents),
    status: r.status as StatusNegociacao,
    awaitingConfirmation: r.awaiting_confirmation,
    encaminhadoAt: r.encaminhado_at,
  };
}

const COLS = `id, contact_id, conversation_id, topic, motivo, attempts,
              valor_proposta_cents, status, awaiting_confirmation, encaminhado_at`;

/** A negociação ABERTA do contato (status != 'encerrado'), a mais recente. */
export async function carregarNegociacao(
  db: pg.Pool,
  organizationId: string,
  contactId: string,
): Promise<NegotiationState | null> {
  try {
    const { rows } = await db.query<LinhaBruta>(
      `select ${COLS} from public.negotiation_state
        where organization_id = $1 and contact_id = $2 and status <> 'encerrado'
        order by updated_at desc limit 1`,
      [organizationId, contactId],
    );
    return rows[0] ? mapear(rows[0]) : null;
  } catch {
    return null;
  }
}

/** Cria/incrementa a tentativa do tópico (UPSERT) e devolve o estado resultante. */
export async function registrarTentativa(
  db: pg.Pool,
  args: {
    organizationId: string;
    contactId: string;
    conversationId: string | null;
    topic: string;
    motivo: MotivoNegociacao;
    valorCents?: number | null;
  },
): Promise<NegotiationState | null> {
  try {
    const { rows } = await db.query<LinhaBruta>(
      `insert into public.negotiation_state
         (organization_id, contact_id, conversation_id, topic, motivo,
          attempts, valor_proposta_cents, status, ultima_msg_em)
       values ($1, $2, $3, $4, $5, 1, $6, 'negociando', now())
       on conflict (organization_id, contact_id, topic) do update
         set attempts = public.negotiation_state.attempts + 1,
             conversation_id = excluded.conversation_id,
             motivo = excluded.motivo,
             valor_proposta_cents = coalesce(excluded.valor_proposta_cents,
                                             public.negotiation_state.valor_proposta_cents),
             status = 'negociando',
             awaiting_confirmation = false,
             encaminhado_at = null,
             ultima_msg_em = now()
       returning ${COLS}`,
      [args.organizationId, args.contactId, args.conversationId, args.topic, args.motivo, args.valorCents ?? null],
    );
    return rows[0] ? mapear(rows[0]) : null;
  } catch {
    return null;
  }
}

/** Não lança: best-effort. */
export async function marcarAguardandoConfirmacao(
  db: pg.Pool,
  organizationId: string,
  contactId: string,
  topic: string,
): Promise<void> {
  try {
    await db.query(
      `update public.negotiation_state
          set awaiting_confirmation = true, status = 'aguardando_confirmacao', ultima_msg_em = now()
        where organization_id = $1 and contact_id = $2 and topic = $3`,
      [organizationId, contactId, topic],
    );
  } catch {
    // best-effort
  }
}

/** Não lança: best-effort. Encerra a objeção após a negativa (mas o contato segue atendido). */
export async function marcarEncaminhado(
  db: pg.Pool,
  organizationId: string,
  contactId: string,
  topic: string,
): Promise<void> {
  try {
    await db.query(
      `update public.negotiation_state
          set status = 'encaminhado', awaiting_confirmation = false,
              encaminhado_at = now(), ultima_msg_em = now()
        where organization_id = $1 and contact_id = $2 and topic = $3`,
      [organizationId, contactId, topic],
    );
  } catch {
    // best-effort
  }
}
