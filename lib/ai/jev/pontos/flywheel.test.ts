import { describe, expect, it } from "vitest";
import {
  perguntaDeVereditoDeHigieneJev,
  vereditoDaRespostaDeJev,
  type VereditoDeHigiene,
} from "./flywheel";

function respostaChoice(choice: string) {
  return { veredito: { type: "choice" as const, choice, confidence: 1, probabilities: {} } };
}

describe("perguntaDeVereditoDeHigieneJev", () => {
  it("é uma pergunta choice com os três veredictos", () => {
    const p = perguntaDeVereditoDeHigieneJev().veredito;
    expect(p?.type).toBe("choice");
    if (!p || p.type !== "choice") throw new Error("esperava choice");
    expect(Object.keys(p.criteria).sort()).toEqual(["no", "unknown", "yes"]);
  });
});

describe("vereditoDaRespostaDeJev", () => {
  it("aceita os três veredictos", () => {
    for (const v of ["yes", "no", "unknown"] as VereditoDeHigiene[]) {
      expect(vereditoDaRespostaDeJev(respostaChoice(v))).toBe(v);
    }
  });

  it("normaliza caixa/espaços", () => {
    expect(vereditoDaRespostaDeJev(respostaChoice(" YES "))).toBe("yes");
  });

  it("resposta ausente, de outro tipo ou fora do enum → null", () => {
    expect(vereditoDaRespostaDeJev({})).toBeNull();
    expect(
      vereditoDaRespostaDeJev({
        veredito: { type: "score", score: 1, confidence: 1 },
      }),
    ).toBeNull();
    expect(vereditoDaRespostaDeJev(respostaChoice("talvez"))).toBeNull();
  });
});
