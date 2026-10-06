import { describe, expect, it } from "vitest";
import {
  OPCAO_NENHUM,
  fluxosDaRespostaDeJev,
  perguntasDeFluxosDeJev,
  type FluxoParaJev,
} from "./flow-intent";

const fluxos: FluxoParaJev[] = [
  { nome: "Qualificação", gatilhos: ["gostei dessa", "quero essa"] },
  { nome: "Financiamento", gatilhos: ["quero financiar"] },
  { nome: "Troca", gatilhos: ["moto na troca"] },
];

function respostas(principal: string, adicionais: Record<number, number>): unknown {
  const r: Record<string, unknown> = {
    fluxo_principal: { type: "choice", choice: principal, confidence: 1, probabilities: {} },
  };
  for (const [i, noul] of Object.entries(adicionais)) {
    r[`fluxo_adicional_${i}`] = { type: "noul", noul };
  }
  return r;
}

describe("perguntasDeFluxosDeJev", () => {
  it("oferece 'none' + um critério por fluxo no principal, e um noul por fluxo", () => {
    const p = perguntasDeFluxosDeJev(fluxos);
    expect(p.fluxo_principal?.type).toBe("choice");
    if (!p.fluxo_principal || p.fluxo_principal.type !== "choice") throw new Error("esperava choice");
    expect(Object.keys(p.fluxo_principal.criteria).sort()).toEqual([
      "Financiamento",
      "Qualificação",
      "Troca",
      OPCAO_NENHUM,
    ]);
    expect(p.fluxo_adicional_0?.type).toBe("noul");
    expect(p.fluxo_adicional_1?.type).toBe("noul");
    expect(p.fluxo_adicional_2?.type).toBe("noul");
  });
});

describe("fluxosDaRespostaDeJev", () => {
  it("um só fluxo: o principal", () => {
    expect(fluxosDaRespostaDeJev(respostas("Financiamento", {}) as never, fluxos)).toEqual([
      "Financiamento",
    ]);
  });

  it("dois fluxos: principal + adicional, na ordem", () => {
    const r = respostas("Troca", { 1: 0.95 }); // principal Troca, adicional idx1=Financiamento
    expect(fluxosDaRespostaDeJev(r as never, fluxos)).toEqual(["Troca", "Financiamento"]);
  });

  it("adicional abaixo do limiar (0.5) não entra", () => {
    const r = respostas("Troca", { 1: 0.2 });
    expect(fluxosDaRespostaDeJev(r as never, fluxos)).toEqual(["Troca"]);
  });

  it("principal 'none' e nenhum adicional → vazio", () => {
    expect(fluxosDaRespostaDeJev(respostas("none", {}) as never, fluxos)).toEqual([]);
  });

  it("adicional igual ao principal não duplica", () => {
    const r = respostas("Troca", { 2: 0.9 }); // principal Troca, adicional idx2=Troca
    expect(fluxosDaRespostaDeJev(r as never, fluxos)).toEqual(["Troca"]);
  });

  it("resposta vazia/inválida → lista vazia (nunca lança)", () => {
    expect(fluxosDaRespostaDeJev({} as never, fluxos)).toEqual([]);
  });
});
