import { describe, expect, it, vi } from "vitest";

import { loadUnansweredInboundBurst } from "@/lib/agent-engine/agent/inbound-turn";
import { motoEscolhidaPeloCliente } from "@/lib/agent-engine/agent/catalogo-da-conversa";
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import type { MotoDoCatalogo } from "@/lib/agent-engine/agent/fotos-do-catalogo";

/**
 * FASE 1 do Árbitro de Turno — a ESCOLHA lê a RAJADA + a CITAÇÃO de cada mensagem.
 *
 * Medido ao vivo (2026-10-07): o cliente citou a foto da CB 300 R FLEX e mandou
 * "Essa"; 6 s depois mandou "Sao paulo". O drain coalesceu e PINOU a última
 * ("Sao paulo"); a detecção de escolha lia só a pinada + a citação DELA (vazia) →
 * perdeu a escolha → o bot deu a moto ERRADA (a CBX 250 Twister, que era a "moto
 * em foco"). Com a rajada + a citação de cada mensagem, a CB 300 R FLEX é achada.
 */

const CATALOGO: MotoDoCatalogo[] = [
  { nome: "HONDA CBX 250 Twister", fotos: [], ano: "2008", cor: "Cinza" },
  { nome: "YAMAHA XMax 250", fotos: [], ano: "2023", cor: "Vermelho" },
  { nome: "HONDA CB 300 F Twister", fotos: [], ano: "2022", cor: "Vermelho" },
  { nome: "HONDA CB 300 R", fotos: [], ano: "2011", cor: "Preto" },
  { nome: "HONDA CB 300 R FLEX", fotos: [], ano: "2015", cor: "Preto" },
];

// A legenda da foto que o cliente CITOU ao dizer "Essa".
const CITACAO = "HONDA CB 300 R FLEX 2015 Cor: Preto Preço: R$ 14.990,00 Quilometragem: 103.000 km";

function pool(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { db: { query } as unknown as Queryable, query };
}

describe("loadUnansweredInboundBurst — rajada COM citação", () => {
  it("devolve textos (cronológico) e citações", async () => {
    // desc: "Sao paulo" (pinada) primeiro, "Essa" (com citação) depois.
    const { db } = pool([
      { body: "Sao paulo", media_derived_text: null, citacao: null },
      { body: "Essa", media_derived_text: null, citacao: CITACAO },
    ]);
    const r = await loadUnansweredInboundBurst(db, { tenantId: "o", conversationId: "c" });
    expect(r.textos).toEqual(["Essa", "Sao paulo"]);
    expect(r.citacoes).toEqual([CITACAO]);
  });
});

describe("escolha pela CITAÇÃO que veio na rajada (a correção)", () => {
  it("ANTES (lê só a pinada 'Sao paulo' + citação vazia) → não acha escolha", () => {
    const escolhida = motoEscolhidaPeloCliente("", "Sao paulo", CATALOGO, [], "");
    expect(escolhida).toBeUndefined();
  });

  it("DEPOIS (lê a rajada + a citação) → acha a CB 300 R FLEX citada", () => {
    const textoDoCliente = ["Essa", "Sao paulo"].join("\n");
    const escolhida = motoEscolhidaPeloCliente("", textoDoCliente, CATALOGO, [], CITACAO);
    expect(escolhida?.nome).toBe("HONDA CB 300 R FLEX");
  });

  it("a 'moto em foco' (CBX) NÃO vence quando a citação aponta outra — NÃO oferece outra", () => {
    const textoDoCliente = ["Essa", "Sao paulo"].join("\n");
    const escolhida = motoEscolhidaPeloCliente("", textoDoCliente, CATALOGO, [], CITACAO);
    expect(escolhida?.nome).not.toBe("HONDA CBX 250 Twister");
  });
});
