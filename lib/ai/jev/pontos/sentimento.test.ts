import { describe, expect, it } from "vitest";
import {
  NIVEIS_DE_SENTIMENTO,
  perguntaDeSentimentoDeJev,
  sentimentoDaRespostaDeJev,
} from "./sentimento";

function respostaScore(score: number) {
  return { sentimento: { type: "score" as const, score, confidence: 1 } };
}

describe("perguntaDeSentimentoDeJev", () => {
  it("é uma pergunta score com os níveis do mais negativo ao mais positivo", () => {
    const p = perguntaDeSentimentoDeJev().sentimento;
    expect(p?.type).toBe("score");
    if (!p || p.type !== "score") throw new Error("esperava score");
    expect(p.criteria).toHaveLength(NIVEIS_DE_SENTIMENTO.length);
  });
});

describe("sentimentoDaRespostaDeJev", () => {
  it("normaliza as pontas para 0 e 1 e o meio para 0.5", () => {
    expect(sentimentoDaRespostaDeJev(respostaScore(0))).toBe(0);
    expect(sentimentoDaRespostaDeJev(respostaScore(2))).toBe(0.5);
    expect(sentimentoDaRespostaDeJev(respostaScore(4))).toBe(1);
  });

  it("faz clamp fora da escala", () => {
    expect(sentimentoDaRespostaDeJev(respostaScore(-1))).toBe(0);
    expect(sentimentoDaRespostaDeJev(respostaScore(99))).toBe(1);
  });

  it("resposta ausente, de outro tipo ou sem número → null", () => {
    expect(sentimentoDaRespostaDeJev({})).toBeNull();
    expect(
      sentimentoDaRespostaDeJev({
        sentimento: { type: "choice", choice: "x", confidence: 1, probabilities: {} },
      }),
    ).toBeNull();
  });
});

describe("perguntaDeSentimentoDeJev — pedido neutro não herda a reclamação anterior", () => {
  it("manda a mensagem atual prevalecer sobre o histórico", () => {
    const p = perguntaDeSentimentoDeJev().sentimento;
    if (!p || p.type !== "score") throw new Error("esperava score");
    expect(p.instructions).toMatch(/MENSAGEM ATUAL PREVALECE/i);
    expect(p.instructions).toMatch(/quero ver mais opções/i);
    expect(p.instructions).toMatch(/NO MÍNIMO neutro \(índice 2\)/i);
  });
});
