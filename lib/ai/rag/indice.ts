/**
 * O ÍNDICE DO ACERVO — o que a Jev lê para escolher QUAIS materiais consultar.
 *
 * Hoje a rota de conhecimento (`knowledge_route`) recebe só `nome` + `tipo` de cada
 * fonte — pouco para decidir com acerto. O índice dá a cada fonte um `resumo` do
 * seu conteúdo, gravado em `ai_knowledge_sources.source_metadata.indice`.
 *
 * ─── REESCRITA AUTOMÁTICA (o ponto deste arquivo) ──────────────────────────
 * O indexador (`workers/rag-indexer.ts`) chama isto SEMPRE que (re)indexa uma
 * fonte. Então, quando o dono MUDA a base (salva/embeda na tela de conhecimento),
 * o índice se refaz sozinho — sem passo manual, sem migration, sem código de
 * runtime.
 *
 * ─── RESUMO POR IA (Fase 1b) ───────────────────────────────────────────────
 * O resumo é escrito por IA (ponto `resumo_de_conhecimento`), a partir do conteúdo
 * da fonte. O gatilho é por FONTE alterada (não o acervo todo). Se a IA falhar,
 * cai no resumo determinístico (amostra dos próprios trechos) — nunca fica sem
 * índice.
 */
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_TRECHOS = 40;
/** Teto da AMOSTRA (insumo do resumo + fallback), em caracteres. */
const MAX_CHARS = 2400;
/** Teto do resumo por IA (vai no contexto da Jev, por material). */
const MAX_RESUMO_IA = 400;

export interface IndiceDaFonte {
  resumo: string;
  trechos: number;
  gerado_em: string;
  /** De onde veio o resumo: 'ia' ou 'deterministico' (fallback). */
  fonte_do_resumo: "ia" | "deterministico";
}

/** Resumo por IA — `null` quando a IA não está configurada ou falhou. */
async function resumirComIA(
  organizationId: string,
  nome: string,
  amostra: string,
): Promise<string | null> {
  try {
    const pool = getRequestPool();
    const cfg = llmEdgeConfigFromEnv({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      LLM_CACHE_TTL: process.env.LLM_CACHE_TTL,
    });
    const { result } = await runModelCall(pool, cfg, {
      tenantId: organizationId,
      purpose: "resumo_de_conhecimento",
      messages: [
        {
          role: "user",
          content:
            `Você resume MATERIAL de uma base de conhecimento de uma loja de motos. ` +
            `Em 2 a 3 frases, diga os TÓPICOS que este material cobre e o que ele RESPONDE — ` +
            `o texto vai servir para um sistema escolher QUANDO consultar este material. ` +
            `Seja específico e factual; NÃO invente o que não está no material.\n\n` +
            `Material: "${nome}"\n\n${amostra}\n\nResumo:`,
        },
      ],
    });
    const texto = String(result?.text ?? "").replace(/\s+/g, " ").trim();
    return texto === "" ? null : texto.slice(0, MAX_RESUMO_IA);
  } catch {
    return null;
  }
}

/**
 * Gera (ou REESCREVE) o índice de UMA fonte a partir dos seus trechos ativos e o
 * grava em `source_metadata.indice`. Best-effort: nunca lança. Devolve o índice.
 */
export async function gerarIndiceDaFonte(
  organizationId: string,
  sourceId: string,
): Promise<IndiceDaFonte | null> {
  try {
    const admin = createAdminClient();
    const { data: fonte } = await admin
      .from("ai_knowledge_sources")
      .select("id, name, active_kb_version_id, source_metadata")
      .eq("organization_id", organizationId)
      .eq("id", sourceId)
      .maybeSingle();
    const row = fonte as
      | {
          name?: string | null;
          active_kb_version_id?: string | null;
          source_metadata?: Record<string, unknown> | null;
        }
      | null;
    const kb = row?.active_kb_version_id ?? null;
    if (!row || kb === null) return null;

    const { data: chunks } = await admin
      .from("ai_chunks")
      .select("content")
      .eq("organization_id", organizationId)
      .eq("knowledge_source_id", sourceId)
      .eq("kb_version_id", kb)
      .order("position", { ascending: true })
      .limit(MAX_TRECHOS);
    const lista = (chunks ?? []) as Array<{ content: string | null }>;
    if (lista.length === 0) return null;

    // Amostra: os primeiros trechos, com espaços colapsados, cortada no teto.
    let amostra = "";
    for (const c of lista) {
      const t = String(c.content ?? "").replace(/\s+/g, " ").trim();
      if (t === "") continue;
      if (amostra.length + t.length > MAX_CHARS) break;
      amostra += (amostra === "" ? "" : " ⁋ ") + t;
    }
    if (amostra === "") return null;

    // RESUMO POR IA (Fase 1b); fallback = a própria amostra (determinístico).
    const resumoIA = await resumirComIA(organizationId, row.name ?? "", amostra);
    const indice: IndiceDaFonte = {
      resumo: resumoIA ?? amostra,
      trechos: lista.length,
      gerado_em: new Date().toISOString(),
      fonte_do_resumo: resumoIA !== null ? "ia" : "deterministico",
    };
    await admin
      .from("ai_knowledge_sources")
      .update({ source_metadata: { ...(row.source_metadata ?? {}), indice } })
      .eq("organization_id", organizationId)
      .eq("id", sourceId);

    return indice;
  } catch {
    return null;
  }
}
