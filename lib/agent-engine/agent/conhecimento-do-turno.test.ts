import { describe, expect, it, vi } from "vitest";

import {
  renderBlocoDeConhecimento,
  montarConhecimentoDoTurno,
} from "./conhecimento-do-turno";

const TRECHO = {
  id: "chunk-1",
  fonte: "Base Valle Motos — preco",
  texto: "Pergunta: [ID] PRE-002 [OBJECAO] Achei muito cara. Resposta: ... sem prometer desconto.",
  sim: 0.6,
};

describe("renderBlocoDeConhecimento", () => {
  it("sem trechos → string vazia (não injeta nada)", () => {
    expect(renderBlocoDeConhecimento([])).toBe("");
  });

  it("com trechos → bloco com contrato de CONFERÊNCIA + CITAÇÃO e o trecho", () => {
    const b = renderBlocoDeConhecimento([TRECHO]);
    expect(b).toContain("CONFIRA antes de usar");
    expect(b).toContain("fonte_ids");
    expect(b).toContain("PRE-002");
    expect(b).toContain("Base Valle Motos — preco");
  });
});

describe("montarConhecimentoDoTurno", () => {
  it("sem fontes ou sem pergunta → [] (não busca, não chama a Jev)", async () => {
    const db = { query: vi.fn() } as never;
    expect(await montarConhecimentoDoTurno(db, "o", { pergunta: "oi", fontes: [], topK: 5, limiar: 0.4 })).toEqual([]);
    expect(await montarConhecimentoDoTurno(db, "o", { pergunta: "  ", fontes: ["s"], topK: 5, limiar: 0.4 })).toEqual([]);
  });
});
