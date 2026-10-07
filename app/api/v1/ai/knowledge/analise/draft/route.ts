import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/ai/knowledge/analise/draft — Fase B da Análise.
 *
 * Recebe um `case_id` (um atendimento em que a IA não resolveu bem) e RASCUNHA,
 * por IA, a entrada que faltava na base — no formato dos campos semânticos que o
 * formulário usa. O dono SEMPRE revisa antes de salvar. Offline.
 */
const bodySchema = z.object({ case_id: z.string().uuid() });

interface Rascunho {
  pergunta: string;
  resposta: string;
  categoria?: string;
  acao?: string;
  nao_afirmar?: string;
}

function parseRascunho(texto: string): Rascunho | null {
  const m = /\{[\s\S]*\}/.exec(texto);
  if (m === null) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const pergunta = typeof o.pergunta === "string" ? o.pergunta.trim() : "";
    const resposta = typeof o.resposta === "string" ? o.resposta.trim() : "";
    if (pergunta === "" || resposta === "") return null;
    return {
      pergunta,
      resposta,
      ...(typeof o.categoria === "string" && o.categoria.trim() !== ""
        ? { categoria: o.categoria.trim() }
        : {}),
      ...(typeof o.acao === "string" && o.acao.trim() !== "" ? { acao: o.acao.trim() } : {}),
      ...(typeof o.nao_afirmar === "string" && o.nao_afirmar.trim() !== ""
        ? { nao_afirmar: o.nao_afirmar.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
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
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId });
  }

  const admin = createAdminClient();
  const { data: caso } = await admin
    .from("agent_cases")
    .select("id, title, summary, blocker, context_snapshot")
    .eq("id", parsed.data.case_id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  const c = caso as
    | { title: string; summary: string; blocker: string; context_snapshot: unknown }
    | null;
  if (!c) return fail("not_found", t("Caso não encontrado."), 404, { requestId });

  const snap = (c.context_snapshot ?? {}) as {
    last_messages?: Array<{ direction?: string; body?: string }>;
  };
  const conversa = (snap.last_messages ?? [])
    .map((m) => `${m.direction === "inbound" ? "Cliente" : "Loja"}: ${m.body ?? ""}`)
    .join("\n");

  try {
    const pool = getRequestPool();
    const cfg = llmEdgeConfigFromEnv({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      LLM_CACHE_TTL: process.env.LLM_CACHE_TTL,
    });
    const { result } = await runModelCall(pool, cfg, {
      tenantId: activeOrg.orgId,
      purpose: "sugestao_de_conhecimento",
      messages: [
        {
          role: "user",
          content:
            `Um agente de IA não resolveu bem este atendimento. Rascunhe a entrada de FAQ que FALTOU ` +
            `na base de conhecimento — a que teria evitado o problema. Seja fiel ao que a conversa ` +
            `mostra; NÃO invente política da loja (se a conversa não diz, escreva a resposta pedindo ` +
            `para confirmar com o responsável).\n\n` +
            `Motivo do caso: ${c.blocker}\n\nConversa:\n${conversa || c.summary}\n\n` +
            `Responda SOMENTE JSON: {"pergunta":"<o que o cliente perguntou>","resposta":"<o que responder>",` +
            `"categoria":"<palavra curta, ex.: preco>","acao":"<opcional>","nao_afirmar":"<opcional, o que NÃO prometer>"}`,
        },
      ],
    });
    const rascunho = parseRascunho(String(result?.text ?? ""));
    if (rascunho === null) {
      return fail("internal_error", t("A IA não conseguiu rascunhar; preencha à mão."), 502, {
        requestId,
      });
    }
    return ok(rascunho, { requestId });
  } catch (err) {
    console.error("[analise-draft] falha:", err instanceof Error ? err.message : String(err));
    return fail("internal_error", t("A IA não conseguiu rascunhar; preencha à mão."), 502, {
      requestId,
    });
  }
}
