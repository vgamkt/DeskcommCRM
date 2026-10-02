import { describe, expect, it } from "vitest";
import {
  OPCAO_NENHUM,
  nomeDoFluxoDaRespostaDeJev,
  perguntaDeFluxoDeJev,
  type FluxoParaJev,
} from "./flow-intent";

const fluxos: FluxoParaJev[] = [
  { nome: "Qualificação", gatilhos: ["gostei dessa", "quero essa"] },
  { nome: "Financiamento", gatilhos: ["quero financiar"] },
];

function respostaChoice(choice: string) {
  return { fluxo: { type: "choice" as const, choice, confidence: 1, probabilities: {} } };
}

describe("perguntaDeFluxoDeJev", () => {
  it("oferece 'none' mais um critério por fluxo", () => {
    const p = perguntaDeFluxoDeJev(fluxos).fluxo;
    expect(p?.type).toBe("choice");
    if (!p || p.type !== "choice") throw new Error("esperava choice");
    expect(Object.keys(p.criteria).sort()).toEqual(["Financiamento", "Qualificação", OPCAO_NENHUM]);
  });
});

describe("nomeDoFluxoDaRespostaDeJev", () => {
  it("devolve o nome escolhido", () => {
    expect(nomeDoFluxoDaRespostaDeJev(respostaChoice("Financiamento"))).toBe("Financiamento");
  });

  it("'none' (qualquer caixa) → null", () => {
    expect(nomeDoFluxoDaRespostaDeJev(respostaChoice("none"))).toBeNull();
    expect(nomeDoFluxoDaRespostaDeJev(respostaChoice("NONE"))).toBeNull();
  });

  it("ausente/outro tipo → null", () => {
    expect(nomeDoFluxoDaRespostaDeJev({})).toBeNull();
    expect(nomeDoFluxoDaRespostaDeJev(respostaChoice("  "))).toBeNull();
  });
});
