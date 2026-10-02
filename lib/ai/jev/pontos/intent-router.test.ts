import { describe, expect, it } from "vitest";
import {
  INTENCAO_NENHUMA,
  perguntaDeIntencaoDeJev,
  vereditoDaRespostaDeJev,
  type MembroParaJev,
} from "./intent-router";

const members: MembroParaJev[] = [
  { intentName: "vendas", intentDescription: "quer comprar", examples: ["quero uma moto"] },
  { intentName: "suporte", intentDescription: "precisa de ajuda", examples: [] },
];

function respostaChoice(choice: string, confidence = 0.9) {
  return { intencao: { type: "choice" as const, choice, confidence, probabilities: {} } };
}

describe("perguntaDeIntencaoDeJev", () => {
  it("oferece 'none' + uma opção por intenção", () => {
    const p = perguntaDeIntencaoDeJev(members).intencao;
    expect(p?.type).toBe("choice");
    if (!p || p.type !== "choice") throw new Error("esperava choice");
    expect(Object.keys(p.criteria).sort()).toEqual([INTENCAO_NENHUMA, "suporte", "vendas"]);
  });
});

describe("vereditoDaRespostaDeJev", () => {
  it("devolve intenção + confiança", () => {
    expect(vereditoDaRespostaDeJev(respostaChoice("vendas", 0.8))).toEqual({
      intentName: "vendas",
      confidence: 0.8,
    });
  });

  it("'none' → intenção null, confiança preservada", () => {
    expect(vereditoDaRespostaDeJev(respostaChoice("none", 0.4))).toEqual({
      intentName: null,
      confidence: 0.4,
    });
  });

  it("ausente/outro tipo → null", () => {
    expect(vereditoDaRespostaDeJev({})).toBeNull();
  });
});
