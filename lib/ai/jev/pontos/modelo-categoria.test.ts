/**
 * Ponto `modelo_categoria` da Jev — DEGRAU 2 do "modelo citado".
 *
 * Quando o cliente cita um modelo que NÃO está no estoque e a REFERÊNCIA
 * (`modelos`) não tem a categoria dele, a Jev responde a qual categoria do
 * catálogo o modelo pertence — uma ESCOLHA FECHADA sobre as categorias reais
 * (Scooter, Street, Trail…), nunca texto livre. Módulo PURO.
 */
import { describe, expect, it } from "vitest";

import { perguntaDeCategoriaDeModeloJev, categoriaDoModeloDaJev } from "./modelo-categoria";

describe("categoriaDoModeloDaJev", () => {
  it("choice de uma categoria real → devolve a categoria", () => {
    expect(
      categoriaDoModeloDaJev({ categoria: { type: "choice", choice: "Trail", confidence: 0.9, probabilities: {} } }),
    ).toEqual({ categoria: "Trail" });
  });
  it("choice 'nenhuma' → null", () => {
    expect(
      categoriaDoModeloDaJev({ categoria: { type: "choice", choice: "nenhuma", confidence: 0.9, probabilities: {} } }),
    ).toEqual({ categoria: null });
  });
  it("resposta ausente → null", () => {
    expect(categoriaDoModeloDaJev({})).toEqual({ categoria: null });
  });
});

describe("perguntaDeCategoriaDeModeloJev", () => {
  it("monta uma choice com as categorias reais + 'nenhuma'", () => {
    const q = perguntaDeCategoriaDeModeloJev(["Scooter", "Street", "Trail"], "Lander");
    expect(q.categoria?.type).toBe("choice");
    expect(Object.keys(q.categoria?.criteria ?? {})).toEqual(["Scooter", "Street", "Trail", "nenhuma"]);
  });
});
