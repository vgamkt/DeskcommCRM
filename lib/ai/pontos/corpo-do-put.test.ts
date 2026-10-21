import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { corpoDoPut, ehCorpoDeReserva } from "./corpo-do-put";

/**
 * REGRESSÃO DO CARD "MODELO DE RESERVA" (medido em 2026-10-21).
 *
 * A tela manda `{ fallback_provider, fallback_model }`. O schema exigia
 * `provider` e `model_id` em qualquer corpo, então o `safeParse` reprovava
 * ANTES do ramo da reserva: o botão "Salvar reserva" devolvia
 * `422 invalid_body` com "provider: expected string, received undefined" e a
 * reserva nunca era gravada — nem pela tela, nem por um PUT direto.
 */
describe("corpoDoPut — reserva global", () => {
  it("aceita o corpo que a tela manda (só fallback_*)", () => {
    const r = corpoDoPut.safeParse({
      fallback_provider: "openrouter",
      fallback_model: "z-ai/glm-5.1",
    });
    expect(r.success).toBe(true);
    expect(r.success && ehCorpoDeReserva(r.data)).toBe(true);
  });

  it("aceita limpar a reserva (os dois nulos)", () => {
    const r = corpoDoPut.safeParse({ fallback_provider: null, fallback_model: null });
    expect(r.success).toBe(true);
    expect(r.success && ehCorpoDeReserva(r.data)).toBe(true);
  });

  it("aceita reserva incompleta no schema — quem recusa o par é a rota", () => {
    // `reserva_incompleta` é regra de operação (422 com frase própria), não de
    // forma: reprovar aqui trocaria a explicação por "corpo inválido".
    const r = corpoDoPut.safeParse({ fallback_provider: "openrouter", fallback_model: null });
    expect(r.success).toBe(true);
  });
});

describe("corpoDoPut — ponto", () => {
  it("aceita o corpo de um ponto", () => {
    const r = corpoDoPut.safeParse({
      purpose: "stage_classifier",
      provider: "opencode_go",
      model_id: "deepseek-v4-flash",
    });
    expect(r.success).toBe(true);
    expect(r.success && ehCorpoDeReserva(r.data)).toBe(false);
  });

  it("aceita provedor de Jev (typesafe) no ponto", () => {
    const r = corpoDoPut.safeParse({
      purpose: "objecao__jev",
      provider: "typesafe",
      model_id: "jev-latest",
    });
    expect(r.success).toBe(true);
  });

  it("recusa provedor fora da lista", () => {
    const r = corpoDoPut.safeParse({
      purpose: "stage_classifier",
      provider: "foobar",
      model_id: "x",
    });
    expect(r.success).toBe(false);
  });

  it("aceita ponto sem provedor no schema — a rota exige no ramo do ponto", () => {
    const r = corpoDoPut.safeParse({ purpose: "stage_classifier" });
    expect(r.success).toBe(true);
    expect(r.success && ehCorpoDeReserva(r.data)).toBe(false);
  });
});

/**
 * O SCHEMA NÃO É A ROTA. Os campos ficaram opcionais para a reserva passar;
 * quem garante que um PONTO não chegue sem provedor/modelo é o guard do ramo —
 * sem ele, `corpo.provider` undefined desceria até a consulta do catálogo.
 */
describe("rota — guarda do ramo do ponto", () => {
  it("o ramo do ponto exige provedor e modelo antes de consultar o catálogo", () => {
    const fonte = readFileSync(
      join(process.cwd(), "app/api/v1/ai/providers/route.ts"),
      "utf8",
    );
    expect(fonte).toMatch(
      /if \(corpo\.provider === undefined \|\| corpo\.model_id === undefined\) \{\s*return fail\("invalid_body"/,
    );
    expect(fonte).toMatch(/if \(ehCorpoDeReserva\(corpo\)\)/);
  });
});
