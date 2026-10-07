import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { loadUnansweredInboundTexts } from "@/lib/agent-engine/agent/inbound-turn";
import type { Queryable } from "@/lib/agent-engine/queue/queue";

/**
 * A RAJADA DISPARA OS DOIS FLUXOS — o defeito medido ao vivo em 2026-10-06.
 *
 * O cliente mandou "Queria dar uma moto na troca" e, 6 s depois, "E financiar o
 * resto". O drain COALESCE a rajada num job só e pina a ÚLTIMA mensagem em
 * `inbound_message_id`. O gatilho de fluxo lia só o texto pinado — então só o
 * Financiamento foi reconhecido, o Troca nunca entrou na fila, e o cliente (que
 * pediu os DOIS processos) ficou num fluxo só.
 *
 * `loadUnansweredInboundTexts` devolve a rajada inteira (mesma régua de
 * `inboundsNaoRespondidos`, que já alimenta o handoff/opt-out), lida do banco
 * porque o gatilho roda antes de o LeadContext abrir.
 */

function pool(rows: { body?: string | null; media_derived_text?: string | null }[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { db: { query } as unknown as Queryable, query };
}

describe("loadUnansweredInboundTexts — a rajada, não a última mensagem", () => {
  it("recorta por organização e conversa, só inbound, e depois da última outbound", async () => {
    // O banco devolve as RECENTES primeiro (desc); a função devolve cronológico.
    const { db, query } = pool([{ body: "E financiar o resto" }, { body: "Queria dar uma moto na troca" }]);
    const textos = await loadUnansweredInboundTexts(db, { tenantId: "org-1", conversationId: "conv-1" });

    expect(textos).toEqual(["Queria dar uma moto na troca", "E financiar o resto"]);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/organization_id\s*=\s*\$1/);
    expect(sql).toMatch(/conversation_id\s*=\s*\$2/);
    expect(sql).toMatch(/direction\s*=\s*'inbound'/);
    // A janela é "desde a última outbound": sem ela, mensagens já respondidas
    // reabririam fluxos antigos a cada rajada.
    expect(sql).toMatch(/direction\s*=\s*'outbound'/);
    expect(sql).toMatch(/order by created_at desc/);
    expect(sql).toMatch(/limit 20/);
    expect(params).toEqual(["org-1", "conv-1"]);
  });

  it("áudio (corpo vazio) entra pela transcrição; vazios são pulados", async () => {
    const { db } = pool([
      { body: null, media_derived_text: "E financiar o resto" },
      { body: "  ", media_derived_text: "" },
      { body: "Queria dar uma moto na troca", media_derived_text: null },
    ]);
    await expect(
      loadUnansweredInboundTexts(db, { tenantId: "o", conversationId: "c" }),
    ).resolves.toEqual(["Queria dar uma moto na troca", "E financiar o resto"]);
  });

  it("sem mensagem pendente devolve lista vazia (nada a disparar)", async () => {
    const { db } = pool([]);
    await expect(
      loadUnansweredInboundTexts(db, { tenantId: "o", conversationId: "c" }),
    ).resolves.toEqual([]);
  });
});

const FONTE = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"),
  "utf8",
);

describe("fiação — o gatilho de fluxo lê a rajada inteira", () => {
  it("a intenção usa o contexto UNIFICADO (rajada + citação), não a mensagem pinada", () => {
    // Fase 2 do Árbitro: as intenções saem do mesmo contexto do turno (rajada +
    // citação), sem segunda consulta.
    expect(FONTE).toMatch(/loadUnansweredInboundBurst\(pool,/);
    expect(FONTE).toMatch(/const textoDoGatilho =/);
    expect(FONTE).toMatch(/\[textoDoClienteDoTurno, textoCitadoDoTurno\]/);
  });

  it("a decisão por INTENÇÃO e o gatilho por palavra (fallback) usam o texto da rajada", () => {
    // A intenção é a fonte; o regex de palavra é só o último recurso.
    expect(FONTE).toMatch(
      /escolherFluxosPorIA\([\s\S]*?texto: textoDoGatilho,/,
    );
    expect(FONTE).toMatch(
      /escolherFluxosPeloGatilho\(pool, \{[\s\S]*?texto: textoDoGatilho,/,
    );
  });

  it("o regex de palavra é só fallback (quando a IA devolve ok:false)", () => {
    expect(FONTE).toMatch(/porIntencao\.ok\s*\?[\s\S]*?porIntencao\.fluxos[\s\S]*?: await escolherFluxosPeloGatilho/);
  });
});
