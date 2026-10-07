import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ai/knowledge/sources/:id/entrada — Fase B da Análise.
 *
 * O dono preenche os campos SEMÂNTICOS (nunca o texto cru com `[TAGS]`); o
 * sistema MONTA a entrada no PADRÃO da base (`[ID] [OBJECAO] [CATEGORIA] …`) e a
 * anexa à fonte FAQ → emite `knowledge_source.updated` → o indexador reescreve o
 * índice sozinho. Offline: nada disto toca o atendimento.
 *
 * Auth: role >= manager · organization_id do JWT, nunca do body.
 */
const bodySchema = z.object({
  pergunta: z.string().trim().min(1).max(400),
  resposta: z.string().trim().min(1).max(2_000),
  categoria: z.string().trim().max(60).optional(),
  acao: z.string().trim().max(200).optional(),
  nao_afirmar: z.string().trim().max(300).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id: sourceId } = await params;

  const authz = await requireRole("manager", { requestId, resource: "ai_knowledge" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org: activeOrg } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = undefined;
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: fonte } = await admin
    .from("ai_knowledge_sources")
    .select("id, source_type, agent_id")
    .eq("id", sourceId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  const ks = fonte as { id: string; source_type: string; agent_id: string } | null;
  if (!ks) return fail("not_found", t("Fonte de conhecimento não encontrada."), 404, { requestId });
  if (ks.source_type !== "faq") {
    return fail("validation_failed", t("Esta fonte não é de perguntas e respostas."), 422, { requestId });
  }

  // Próximo [ID] a partir dos itens existentes (ex.: PRE-025 → PRE-026).
  const { data: itens } = await admin
    .from("ai_faq_items")
    .select("question, position")
    .eq("knowledge_source_id", sourceId)
    .eq("organization_id", activeOrg.orgId);
  const linhas = (itens ?? []) as Array<{ question: string | null; position: number | null }>;
  let prefixo = "ENT";
  let maior = 0;
  for (const it of linhas) {
    const m = /\[ID\]\s*([A-Za-z]+)-(\d+)/.exec(it.question ?? "");
    if (m) {
      prefixo = m[1]!.toUpperCase();
      maior = Math.max(maior, Number(m[2]));
    }
  }
  const novoId = `${prefixo}-${String(maior + 1).padStart(3, "0")}`;
  const categoria = input.categoria ?? prefixo.toLowerCase();

  // MONTA no PADRÃO da base (o dono nunca digita as tags).
  const question =
    `[ID] ${novoId} [OBJECAO] "${input.pergunta}" [CATEGORIA] ${categoria} ` +
    `[INTENCAO] ${categoria} [TIPO] resposta [TAGS] ${categoria}`;
  const answer =
    `[RESPOSTA] ${input.resposta}` +
    (input.acao ? ` [ACAO] ${input.acao}` : "") +
    (input.nao_afirmar ? ` [NAO_AFIRMAR] ${input.nao_afirmar}` : "");

  const proximaPosicao = linhas.reduce((n, it) => Math.max(n, (it.position ?? 0) + 1), 0);
  const { error: insErr } = await admin.from("ai_faq_items").insert({
    organization_id: activeOrg.orgId,
    knowledge_source_id: sourceId,
    question,
    answer,
    tags: [categoria],
    locale: "pt-BR",
    position: proximaPosicao,
  });
  if (insErr) {
    console.error("[analise] insert ai_faq_items failed:", insErr.message);
    return fail("internal_error", t("Não consegui salvar a entrada."), 500, { requestId });
  }

  // Reindexa (fire-and-forget) — o índice da fonte se refaz sozinho.
  const { error: emitErr } = await admin.rpc("emit_event" as never, {
    p_event_type: "knowledge_source.updated",
    p_entity_kind: "ai_knowledge_source",
    p_entity_id: sourceId,
    p_payload: {
      knowledge_source_id: sourceId,
      agent_id: ks.agent_id,
      source_type: ks.source_type,
      triggered_by: "analise",
    },
    p_organization_id: activeOrg.orgId,
  } as never);
  if (emitErr) {
    console.warn("[analise] emit_event failed (non-blocking):", emitErr.message);
  }

  return ok({ id: novoId, queued: true as const }, { requestId });
}
