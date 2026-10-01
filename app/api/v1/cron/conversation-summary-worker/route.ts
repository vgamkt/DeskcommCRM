/**
 * GET/POST /api/v1/cron/conversation-summary-worker — o informante "Resumo de
 * Conversas".
 *
 * ─── O que ele faz por tick ─────────────────────────────────────────────────
 *
 * Reclama (claim atômico, SKIP LOCKED) as conversas cujo debounce venceu —
 * `conversation_summary_state.next_eval_at <= now()` — e, para cada uma:
 *
 *   1. lê as mensagens NOVAS desde `last_summarized_message_at` (até `batch_size`);
 *   2. pede ao ponto `resumo_de_conversas` o resumo/atualização;
 *   3. salva o resumo no estado e avança o corte;
 *   4. envia o texto para o número cadastrado.
 *
 * ─── O que ele NÃO faz ──────────────────────────────────────────────────────
 *
 * NÃO varre `conversations`. O gatilho `fn_conversation_summary_touch` (AFTER
 * INSERT em `messages`) empurra o `next_eval_at` de cada conversa a cada
 * mensagem; o cron só lê o índice parcial `conversation_summary_state_due_idx`.
 * Sem mensagem nova, a linha nem aparece.
 *
 * ─── Destino ────────────────────────────────────────────────────────────────
 *
 * Nesta versão só NÚMERO. Envio a grupo é recusado no canal oficial/parceiro e
 * fica para depois. O destino é tratado como um contato da org — a conversa do
 * gerente aparece no inbox e tem o bot silenciado para o agente não responder
 * no lugar dele.
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ok, fail } from "@/lib/api/wrappers";
import { ensureConversation, sessaoProntaParaEnvio } from "@/lib/automation/start-conversation";
import { capabilitiesOf } from "@/lib/channels/capabilities";
import {
  CHANNEL_SESSION_REF_COLUMNS,
  getAdapter,
  resolveSessionRef,
  type ChannelProvider,
  type ChannelSessionRef,
} from "@/lib/channels";
import { canonicalPhoneBR } from "@/lib/channels/phone-variants";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { createPool } from "@/lib/agent-engine/db/pool";
import { comporMensagemDoResumo, gerarResumoDeConversa, montarCabecalhoDoResumo, montarTranscricao, type MensagemResumivel } from "@/lib/conversas/resumo";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Teto por tick — a próxima passada pega o resto. */
const CLAIM_LIMIT = 20;
const LEASE_SECONDS = 120;

type Admin = ReturnType<typeof createAdminClient>;

interface EstadoReclamado {
  id: string;
  organization_id: string;
  conversation_id: string;
  contact_id: string | null;
  current_summary: string | null;
  last_summarized_message_at: string | null;
}

interface Settings {
  enabled: boolean;
  channel_session_id: string | null;
  destination: string | null;
  destination_is_group: boolean;
  destination_contact_id: string | null;
  interval_minutes: number;
  batch_size: number;
  instructions: string | null;
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();

  let estados: EstadoReclamado[];
  try {
    const { data, error } = await admin.rpc("fn_claim_due_conversation_summaries" as never, {
      p_limit: CLAIM_LIMIT,
      p_lease_seconds: LEASE_SECONDS,
    } as never);
    if (error) throw new Error(error.message);
    estados = (data ?? []) as EstadoReclamado[];
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[conversation-summary.cron] claim falhou", { detail, requestId });
    return fail("internal_error", detail, 500, { requestId });
  }

  const pool = createPool(process.env.SUPABASE_DB_URL ?? "");
  const resumo = { reclamadas: estados.length, resumidas: 0, enviadas: 0, erros: 0 };

  try {
    for (const estado of estados) {
      try {
        const resultado = await processarEstado(admin, pool, estado);
        if (resultado === "resumida") resumo.resumidas++;
        if (resultado === "enviada") resumo.enviadas++;
      } catch (err) {
        resumo.erros++;
        const detail = err instanceof Error ? err.message : String(err);
        logger.error("[conversation-summary.cron] estado falhou", {
          state_id: estado.id,
          conversation_id: estado.conversation_id,
          detail,
        });
        await admin
          .from("conversation_summary_state")
          .update({ last_error: detail.slice(0, 300), claimed_until: null })
          .eq("id", estado.id);
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }

  return ok(resumo, { requestId });
}

/** Devolve o desfecho mais relevante para o resumo do tick. */
async function processarEstado(
  admin: Admin,
  pool: ReturnType<typeof createPool>,
  estado: EstadoReclamado,
): Promise<"resumida" | "enviada" | "ignorada"> {
  const org = estado.organization_id;

  const { data: settingsRow } = await admin
    .from("conversation_summary_settings")
    .select("enabled, channel_session_id, destination, destination_is_group, destination_contact_id, interval_minutes, batch_size, instructions")
    .eq("organization_id", org)
    .maybeSingle();
  const settings = settingsRow as Settings | null;
  if (!settings?.enabled) {
    await soltar(admin, estado.id);
    return "ignorada";
  }

  // Guarda anti-laço (defesa em profundidade): a conversa com o próprio destino
  // não vira informante nem que o gatilho já a tenha rastreado antes de o
  // destino ser resolvido.
  if (settings.destination_contact_id && estado.contact_id === settings.destination_contact_id) {
    await soltar(admin, estado.id);
    return "ignorada";
  }

  // Mensagens novas desde o corte. `created_at` é a ordem de ENTRADA no sistema
  // (sempre presente), que é o que o corte incremental quer — `sent_at` pode vir
  // do relógio do aparelho.
  let query = admin
    .from("messages")
    .select("direction, sent_via, body, media_derived_text, type, created_at")
    .eq("organization_id", org)
    .eq("conversation_id", estado.conversation_id)
    .order("created_at", { ascending: false })
    .limit(settings.batch_size);
  if (estado.last_summarized_message_at) {
    query = query.gt("created_at", estado.last_summarized_message_at);
  }
  const { data: novas, error: erroNovas } = await query;
  if (erroNovas) throw new Error(erroNovas.message);

  const mensagens = (novas ?? []) as Array<MensagemResumivel & { created_at: string }>;
  if (mensagens.length === 0) {
    await soltar(admin, estado.id);
    return "ignorada";
  }

  // Do mais antigo ao mais novo, para o modelo ler na ordem natural.
  const emOrdem = [...mensagens].reverse();
  const transcricao = montarTranscricao(emOrdem);
  const maxCreatedAt = mensagens.reduce(
    (acc, m) => (m.created_at > acc ? m.created_at : acc),
    mensagens[0]!.created_at,
  );

  const { data: contato } = estado.contact_id
    ? await admin.from("contacts").select("name, display_name, phone_number, custom_fields").eq("id", estado.contact_id).maybeSingle()
    : { data: null };
  const contatoRow = contato as {
    name: string | null;
    display_name: string | null;
    phone_number: string | null;
    custom_fields: Record<string, unknown> | null;
  } | null;
  const nomeContato = contatoRow?.display_name ?? contatoRow?.name ?? null;

  const texto = await gerarResumoDeConversa(pool, {
    tenantId: org,
    nomeContato,
    resumoAnterior: estado.current_summary,
    transcricao,
    instrucoes: settings.instructions,
  });
  if (!texto) throw new Error("resumo_vazio");

  // Cabeçalho do informante: quem é o cliente + link para a conversa, acima do
  // resumo. O resumo SALVO (current_summary) continua sendo só o texto — o
  // cabeçalho entra apenas na mensagem enviada, para não poluir o prompt da
  // próxima atualização.
  const cabecalho = montarCabecalhoDoResumo({
    nome: nomeContato,
    telefone: contatoRow?.phone_number ?? null,
    custom: contatoRow?.custom_fields ?? {},
  });
  const mensagem = comporMensagemDoResumo(cabecalho, texto);

  await admin
    .from("conversation_summary_state")
    .update({
      current_summary: texto,
      last_summarized_message_at: maxCreatedAt,
      last_summarized_at: new Date().toISOString(),
      last_error: null,
      claimed_until: null,
      // Só reagenda se chegou mensagem NOVA durante o processamento; senão
      // fica quieto até o próximo gatilho.
      next_eval_at: await haMensagemMaisNova(admin, org, estado.conversation_id, maxCreatedAt)
        ? new Date(Date.now() + settings.interval_minutes * 60_000).toISOString()
        : null,
    })
    .eq("id", estado.id);

  const enviada = await enviarResumo(admin, org, settings, mensagem, estado.id);
  return enviada ? "enviada" : "resumida";
}

async function haMensagemMaisNova(
  admin: Admin,
  org: string,
  conversationId: string,
  depoisDe: string,
): Promise<boolean> {
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", org)
    .eq("conversation_id", conversationId)
    .gt("created_at", depoisDe)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function soltar(admin: Admin, id: string): Promise<void> {
  // Zera TAMBÉM o next_eval_at: sem isto, "ignorada" deixava o alvo vencido e o
  // cron reclamava a mesma linha a cada minuto para sempre (medido: 105
  // tentativas numa conversa sem nada a fazer). O próximo gatilho de mensagem
  // rearma o relógio.
  await admin
    .from("conversation_summary_state")
    .update({ claimed_until: null, next_eval_at: null })
    .eq("id", id);
}

/**
 * Envia o resumo ao destino. Cria (uma vez) o contato e a conversa do gerente na
 * sessão escolhida e silencia o bot ali — o agente não pode responder no lugar do
 * gerente. Devolve `false` quando não há destino/canal configurado (não é erro).
 */
async function enviarResumo(
  admin: Admin,
  org: string,
  settings: Settings,
  texto: string,
  stateId: string,
): Promise<boolean> {
  const destino = (settings.destination ?? "").trim();
  if (!destino) {
    logger.warn("[conversation-summary.cron] sem destino configurado", { organization_id: org });
    return false;
  }

  const sessionId = settings.channel_session_id ?? (await sessaoProntaParaEnvio(admin, org));
  if (!sessionId) {
    logger.warn("[conversation-summary.cron] sem sessão de canal", { organization_id: org });
    return false;
  }

  // Grupo: NOTIFICAÇÃO pura — sai pelo ADAPTADOR direto, sem criar contato nem
  // conversa placeholder (o schema exige `contact_id` e os gatilhos de conversa
  // disparariam roteamento/atendimento para um alvo que não é cliente). Só vale
  // em canal com `groups: full` (o por QR); o oficial/parceiro recusa grupo.
  if (settings.destination_is_group) {
    return enviarParaGrupo(admin, org, sessionId, destino, texto);
  }

  const digits = destino.replace(/\D/g, "");
  if (!digits) return false;

  const existente = await encontrarContatoPorTelefone(admin as never, org, digits);
  let contactId = existente?.id ?? null;
  if (!contactId) {
    const phone = canonicalPhoneBR(`+${digits}`);
    const { data, error } = await admin.rpc("fn_upsert_wa_contact" as never, {
      p_org: org,
      p_kind: "phone",
      p_phone: phone,
      p_lid: null,
      p_chat_id: digits,
      p_notify: null,
    } as never);
    if (error || !data) {
      logger.warn("[conversation-summary.cron] não criei o contato do destino", {
        organization_id: org,
        detail: error?.message ?? "sem id",
      });
      return false;
    }
    contactId = data as string;
  }

  // Grava a chave EXATA do destino para a guarda anti-laço (o gatilho e a
  // checagem aqui comparam por id de contato).
  if (contactId && settings.destination_contact_id !== contactId) {
    await admin
      .from("conversation_summary_settings")
      .update({ destination_contact_id: contactId })
      .eq("organization_id", org);
  }

  const conversationId = await ensureConversation(admin, org, contactId, sessionId);

  // NÃO silenciamos o bot aqui (era `bot_silenced_until='infinity'`). Esse campo
  // é o marcador de HANDOFF HUMANO e `isLeadInHandoff` (human-handoff.ts:89) o
  // lê por CONTATO: silenciar a conversa de destino colocaria o lead INTEIRO em
  // handoff e o agente pararia de responder em TODAS as conversas dele —
  // inclusive se o número de destino for (ou já tiver sido) um cliente. O
  // informante é uma notificação de saída; não é assumir atendimento.
  await sendMessageHandler(
    admin,
    {
      organization_id: org,
      actor: { type: "webhook_source", id: stateId },
      requestId: `conversation-summary:${stateId}`,
    },
    { conversation_id: conversationId, type: "text", body: texto } as Parameters<
      typeof sendMessageHandler
    >[2],
  );
  return true;
}

/**
 * Envia a notificação para um GRUPO pelo adaptador direto.
 *
 * Não passa por `sendMessageHandler` de propósito: o sink grava `messages` e
 * exige uma `conversation`, e `conversations.contact_id` é NOT NULL — um grupo
 * obrigaria a criar um contato placeholder e a disparar os gatilhos de conversa
 * (roteamento, atendimento) para um alvo que não é cliente. Aqui é aviso, não
 * atendimento: sai pelo canal e pronto.
 *
 * Restrito a `groups: "full"` — só o canal por QR. No oficial/parceiro a
 * capability é `limited` e o adapter recusaria o destinatário.
 */
async function enviarParaGrupo(
  admin: Admin,
  org: string,
  sessionId: string,
  grupoId: string,
  texto: string,
): Promise<boolean> {
  const { data: sessao } = await admin
    .from("channel_sessions")
    .select(`provider, ${CHANNEL_SESSION_REF_COLUMNS}`)
    .eq("organization_id", org)
    .eq("id", sessionId)
    .maybeSingle();
  if (!sessao) return false;

  const provider = (sessao as { provider: string }).provider as ChannelProvider;
  if (capabilitiesOf(provider).groups !== "full") {
    logger.warn("[conversation-summary.cron] canal não envia a grupo", {
      organization_id: org,
      provider,
    });
    return false;
  }

  const adapter = getAdapter(provider);
  const sessionRef = resolveSessionRef(sessao as unknown as ChannelSessionRef);
  if (!sessionRef) return false;

  await adapter.send({ organizationId: org, sessionRef, to: grupoId, kind: "text", body: texto });
  return true;
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
