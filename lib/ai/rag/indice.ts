/**
 * O ÍNDICE DO ACERVO — o que a Jev lê para escolher QUAIS materiais consultar.
 *
 * ─── REESCRITA AUTOMÁTICA ──────────────────────────────────────────────────
 * O indexador (`workers/rag-indexer.ts`) chama isto SEMPRE que (re)indexa uma
 * fonte. Mudar a base (salvar/embedar na tela de conhecimento) reescreve o índice
 * daquela fonte — sem passo manual.
 *
 * ─── FORMATO (medido 2026-10-07) ───────────────────────────────────────────
 *  - DETERMINÍSTICO (âncoras): `escopo` + `topicos` + `itens` ([ID] título). É
 *    exaustivo — a IA não pode "esquecer" um item.
 *  - IA (elo): `resumo` no formato "Cobre: … Não cobre: …". O "Não cobre" é o que
 *    impede a Jev de confundir materiais PARECIDOS (preço × financiamento).
 *
 * A Jev recebe só o ENXUTO (escopo + tópicos + poucos exemplos + resumo). O
 * `itens` COMPLETO fica guardado (auditoria/insumo), NÃO vai no contexto dela —
 * medido: o item completo deixa o roteamento mais barulhento.
 */
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_TRECHOS = 300;
/** Quantos exemplos vão no ENXUTO (o resto fica só no `itens`). */
export const MAX_EXEMPLOS = 5;

export interface ItemDoIndice {
  id: string;
  titulo: string;
}

export interface IndiceDaFonte {
  escopo: string;
  topicos: string[];
  exemplos: ItemDoIndice[];
  /** TODOS os itens (guardado; NÃO vai no contexto da Jev). */
  itens: ItemDoIndice[];
  /** IA: "Cobre: … Não cobre: …" (ou o determinístico, no fallback). */
  resumo: string;
  trechos: number;
  gerado_em: string;
  fonte_do_resumo: "ia" | "deterministico";
  /** P3: true quando o resumo foi ATUALIZADO (resumo anterior + itens novos). */
  incremental?: boolean;
}

/** Extrai [ID] + título (+ categoria) de um trecho. Genérico → 1ª linha. */
function itensDoTrecho(content: string): { id: string; titulo: string; categoria: string } | null {
  const bruto = String(content ?? "");
  const id = /\[ID\]\s*([A-Za-z]+-\d+)/.exec(bruto)?.[1];
  if (id !== undefined) {
    const titulo = (/\[OBJECAO\]\s*(.*?)\s*\[CATEGORIA\]/.exec(bruto)?.[1] ?? "")
      .replace(/["“”]/g, "")
      .trim();
    const categoria = (/\[CATEGORIA\]\s*([^\s[\]]+)/.exec(bruto)?.[1] ?? "").trim();
    return { id, titulo, categoria };
  }
  // Material SEM tag: usa a 1ª linha como "título" (id = posição textual).
  const linha = bruto.replace(/\s+/g, " ").trim().slice(0, 80);
  return linha === "" ? null : { id: "", titulo: linha, categoria: "" };
}

const fmtItem = (i: ItemDoIndice): string => (i.id ? `[${i.id}] "${i.titulo}"` : `"${i.titulo}"`);

const REGRAS_DO_RESUMO =
  `Responda EXATAMENTE neste formato, em 2 frases curtas e factuais:\n` +
  `Cobre: <o que ESTE material responde, usando os tópicos e os itens reais>.\n` +
  `Não cobre: <o que é de OUTRO material — cite os vizinhos que poderiam confundir>.\n\n` +
  `Regras: NÃO invente o que não está nos itens; seja concreto (cite exemplos reais); ` +
  `o "Não cobre" é o que evita a confusão entre materiais parecidos.`;

/** Prompt ASSERTIVO do resumo (cobre/não cobre). */
function promptDoResumo(
  nome: string,
  tipo: string,
  itens: readonly ItemDoIndice[],
  topicos: readonly string[],
  vizinhos: readonly string[],
  resumoAnterior?: string,
  itensNovos?: readonly ItemDoIndice[],
): string {
  // P3 — INCREMENTAL: com um resumo ANTERIOR e só os itens NOVOS/alterados, a IA
  // ATUALIZA (mantém o que continua valendo) em vez de reler a fonte inteira.
  if (
    resumoAnterior !== undefined &&
    resumoAnterior.trim() !== "" &&
    itensNovos !== undefined &&
    itensNovos.length > 0
  ) {
    return (
      `Você é o INDEXADOR do acervo de conhecimento de uma loja de motos. O material ` +
      `"${nome}" (${tipo}) MUDOU — atualize o resumo dele SEM reescrever do zero.\n\n` +
      `Resumo ATUAL:\n${resumoAnterior}\n\n` +
      `Itens NOVOS/alterados desde então: ${itensNovos.map(fmtItem).join("; ")}\n` +
      `Total agora: ${itens.length} itens. Tópicos: ${topicos.join(", ") || "—"}.\n` +
      `Outros materiais do acervo (para o LIMITE): ${vizinhos.join(", ") || "—"}.\n\n` +
      `Mantenha o que continua valendo e ACRESCENTE/SUBSTITUA só o que mudou.\n` +
      REGRAS_DO_RESUMO
    );
  }
  const listaItens = itens.slice(0, 60).map(fmtItem).join("; ");
  return (
    `Você é o INDEXADOR do acervo de conhecimento de uma loja de motos. Escreva o RESUMO que ` +
    `um classificador usará para decidir QUANDO consultar ESTE material. Ele precisa ser ` +
    `ASSERTIVO e ESPECÍFICO — nada de "assuntos gerais".\n\n` +
    `Material: "${nome}" (${tipo}), ${itens.length} itens.\n` +
    `Tópicos: ${topicos.join(", ") || "—"}.\n` +
    `Itens: ${listaItens}\n` +
    `Outros materiais do acervo (para o LIMITE): ${vizinhos.join(", ") || "—"}.\n\n` +
    REGRAS_DO_RESUMO
  );
}

async function resumirComIA(args: {
  organizationId: string;
  nome: string;
  tipo: string;
  itens: readonly ItemDoIndice[];
  topicos: readonly string[];
  vizinhos: readonly string[];
  /** P3: resumo anterior + itens novos → atualização incremental. */
  resumoAnterior?: string;
  itensNovos?: readonly ItemDoIndice[];
}): Promise<string | null> {
  try {
    const pool = getRequestPool();
    const cfg = llmEdgeConfigFromEnv({
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      LLM_CACHE_TTL: process.env.LLM_CACHE_TTL,
    });
    const { result } = await runModelCall(pool, cfg, {
      tenantId: args.organizationId,
      purpose: "resumo_de_conhecimento",
      messages: [
        {
          role: "user",
          content: promptDoResumo(
            args.nome,
            args.tipo,
            args.itens,
            args.topicos,
            args.vizinhos,
            args.resumoAnterior,
            args.itensNovos,
          ),
        },
      ],
    });
    const texto = String(result?.text ?? "").replace(/\s+/g, " ").trim();
    return texto === "" ? null : texto;
  } catch {
    return null;
  }
}

/**
 * Gera (ou REESCREVE) o índice de UMA fonte e o grava em `source_metadata.indice`.
 * Best-effort: nunca lança. Devolve o índice.
 */
export async function gerarIndiceDaFonte(
  organizationId: string,
  sourceId: string,
): Promise<IndiceDaFonte | null> {
  try {
    const admin = createAdminClient();
    const { data: fonte } = await admin
      .from("ai_knowledge_sources")
      .select("id, name, source_type, active_kb_version_id, source_metadata")
      .eq("organization_id", organizationId)
      .eq("id", sourceId)
      .maybeSingle();
    const row = fonte as
      | {
          name?: string | null;
          source_type?: string | null;
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

    // DETERMINÍSTICO: itens distintos (na ordem) + tópicos.
    const vistos = new Set<string>();
    const itens: ItemDoIndice[] = [];
    const topicos: string[] = [];
    for (const c of lista) {
      const it = itensDoTrecho(String(c.content ?? ""));
      if (it === null) continue;
      const chave = it.id || it.titulo;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      itens.push({ id: it.id, titulo: it.titulo });
      if (it.categoria !== "" && !topicos.includes(it.categoria)) topicos.push(it.categoria);
    }
    if (itens.length === 0) return null;

    // Nomes das outras fontes (para o "Não cobre" citar os vizinhos).
    const { data: todas } = await admin
      .from("ai_knowledge_sources")
      .select("name")
      .eq("organization_id", organizationId)
      .neq("id", sourceId);
    const vizinhos = ((todas ?? []) as Array<{ name: string | null }>)
      .map((v) => v.name ?? "")
      .filter((n) => n !== "");

    // P3 — INCREMENTAL: o resumo ANTERIOR + só os itens NOVOS/alterados → a IA ATUALIZA
    // (mantém o que continua valendo) em vez de reler a fonte inteira. Sem resumo
    // anterior (ou sem itens novos), cai no resumo completo (de sempre).
    const indiceAnterior = (row.source_metadata?.indice ?? null) as
      | { resumo?: unknown; itens?: Array<{ id?: unknown }> }
      | null;
    const resumoAnterior =
      typeof indiceAnterior?.resumo === "string" ? indiceAnterior.resumo : undefined;
    const idsAnteriores = new Set(
      (Array.isArray(indiceAnterior?.itens) ? indiceAnterior.itens : [])
        .map((i) => (typeof i?.id === "string" ? i.id : ""))
        .filter((x) => x !== ""),
    );
    const itensNovos =
      idsAnteriores.size === 0
        ? []
        : itens.filter((i) => i.id !== "" && !idsAnteriores.has(i.id));
    const incremental = resumoAnterior !== undefined && itensNovos.length > 0;

    // IA: o resumo assertivo (cobre/não cobre) — completo OU incremental.
    const resumoIA = await resumirComIA({
      organizationId,
      nome: row.name ?? "",
      tipo: row.source_type ?? "",
      itens,
      topicos,
      vizinhos,
      ...(incremental ? { resumoAnterior, itensNovos } : {}),
    });

    const indice: IndiceDaFonte = {
      escopo: `${row.source_type ?? "material"} · ${itens.length} itens`,
      topicos,
      exemplos: itens.slice(0, MAX_EXEMPLOS),
      itens,
      resumo:
        resumoIA ??
        `Cobre ${itens.length} itens${topicos.length > 0 ? ` de ${topicos.join(", ")}` : ""}.`,
      trechos: lista.length,
      gerado_em: new Date().toISOString(),
      fonte_do_resumo: resumoIA !== null ? "ia" : "deterministico",
      ...(incremental ? { incremental: true } : {}),
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
