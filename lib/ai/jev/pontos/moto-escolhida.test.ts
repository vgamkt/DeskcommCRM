import { describe, expect, it } from "vitest";
import {
  MOTO_NENHUMA,
  motoEscolhidaDaRespostaDeJev,
  perguntaDeMotoEscolhidaJev,
} from "./moto-escolhida";

function respostaChoice(choice: string) {
  return { moto: { type: "choice" as const, choice, confidence: 1, probabilities: {} } };
}

describe("perguntaDeMotoEscolhidaJev", () => {
  it("oferece 'nenhuma' + uma opção por candidata", () => {
    const p = perguntaDeMotoEscolhidaJev(["Honda CB 300", "Yamaha Factor"]).moto;
    expect(p?.type).toBe("choice");
    if (!p || p.type !== "choice") throw new Error("esperava choice");
    expect(Object.keys(p.criteria).sort()).toEqual(["Honda CB 300", "Yamaha Factor", MOTO_NENHUMA]);
  });
});

describe("motoEscolhidaDaRespostaDeJev", () => {
  it("devolve o nome escolhido", () => {
    expect(motoEscolhidaDaRespostaDeJev(respostaChoice("Yamaha Factor"))).toBe("Yamaha Factor");
  });
  it("'nenhuma' (qualquer caixa) → null", () => {
    expect(motoEscolhidaDaRespostaDeJev(respostaChoice("nenhuma"))).toBeNull();
    expect(motoEscolhidaDaRespostaDeJev(respostaChoice("NENHUMA"))).toBeNull();
  });
  it("ausente/outro tipo → null", () => {
    expect(motoEscolhidaDaRespostaDeJev({})).toBeNull();
  });
});
