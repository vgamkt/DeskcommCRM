/**
 * Ponto da Jev: `narracao` — a mensagem final do redator é FALA AO CLIENTE ou
 * NARRAÇÃO INTERNA (bastidor/outro idioma/relato a terceiro)?
 *
 * Substitui a regex `internal_vocabulary` como DECISOR (a regex só virava
 * fallback e, pior, derrubava o turno com falso positivo).
 */
import { describe, expect, it } from "vitest";

import { perguntaDeNarracaoJev, vereditoDeNarracaoDaJev } from "./narracao";

describe("vereditoDeNarracaoDaJev", () => {
  it("choice 'narracao' → ehNarracao true", () => {
    expect(
      vereditoDeNarracaoDaJev({ narracao: { type: "choice", choice: "narracao", confidence: 0.9, probabilities: {} } }),
    ).toEqual({ ehNarracao: true });
  });
  it("choice 'mensagem' → ehNarracao false", () => {
    expect(
      vereditoDeNarracaoDaJev({ narracao: { type: "choice", choice: "mensagem", confidence: 0.9, probabilities: {} } }),
    ).toEqual({ ehNarracao: false });
  });
  it("resposta ausente → ehNarracao false (não bloqueia por falta de veredito)", () => {
    expect(vereditoDeNarracaoDaJev({})).toEqual({ ehNarracao: false });
  });
});

describe("perguntaDeNarracaoJev", () => {
  it("declara a pergunta 'narracao' do tipo choice", () => {
    const q = perguntaDeNarracaoJev();
    expect(q.narracao?.type).toBe("choice");
    expect(Object.keys(q.narracao?.criteria ?? {})).toEqual(["mensagem", "narracao"]);
  });
});
