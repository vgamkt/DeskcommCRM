/**
 * O ÍNDICE DO ACERVO — o que a Jev lê para escolher QUAIS materiais consultar.
 *
 * Hoje a rota de conhecimento (`knowledge_route`) recebe só `nome` + `tipo` de cada
 * fonte — pouco para decidir com acerto. O índice dá a cada fonte um `resumo` do
 * seu conteúdo, gravado em `ai_knowledge_sources.source_metadata.indice`.
 *
 * ─── REESCRITA AUTOMÁTICA (o ponto deste arquivo) ──────────────────────────
 * O indexador (`workers/rag-indexer.ts`) chama isto SEMPRE que (re)indexa uma
 * fonte. Então, quando o dono MUDA a base (edita/adiciona material), o índice se
 * refaz sozinho — sem passo manual, sem migration, sem código de runtime.
 *
 * Determinístico e barato (SEM LLM): monta o resumo a partir dos PRÓPRIOS trechos
 * já indexados. Não decide nada — só descreve o material para a Jev decidir.
 */
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_TRECHOS = 40;
/** Teto do resumo, em caracteres — o índice vai no contexto da Jev (curto). */
const MAX_CHARS = 1400;

export interface IndiceDaFonte {
  resumo: string;
  trechos: number;
  gerado_em: string;
}

/**
 * Gera (ou REESCREVE) o índice de UMA fonte a partir dos seus trechos ativos e o
 * grava em `source_metadata.indice`. Best-effort: nunca lança (falha de índice não
 * pode derrubar a indexação). Devolve o índice ou `null`.
 */
export async function gerarIndiceDaFonte(
  organizationId: string,
  sourceId: string,
): Promise<IndiceDaFonte | null> {
  try {
    const admin = createAdminClient();
    const { data: fonte } = await admin
      .from("ai_knowledge_sources")
      .select("id, active_kb_version_id, source_metadata")
      .eq("organization_id", organizationId)
      .eq("id", sourceId)
      .maybeSingle();
    const row = fonte as
      | { active_kb_version_id?: string | null; source_metadata?: Record<string, unknown> | null }
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
    let resumo = "";
    for (const c of lista) {
      const t = String(c.content ?? "").replace(/\s+/g, " ").trim();
      if (t === "") continue;
      if (resumo.length + t.length > MAX_CHARS) break;
      resumo += (resumo === "" ? "" : " ⁋ ") + t;
    }
    if (resumo === "") return null;

    const indice: IndiceDaFonte = {
      resumo,
      trechos: lista.length,
      gerado_em: new Date().toISOString(),
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
