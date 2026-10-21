import { describe, expect, it } from "vitest";

import { BreakerDeModelo } from "./breaker-de-modelo";

describe("BreakerDeModelo", () => {
  it("abre após o limite de falhas e fecha no cooldown", () => {
    let agora = 1_000;
    const b = new BreakerDeModelo({ limite: 3, cooldownMs: 60_000, agora: () => agora });
    const chave = "opencode_go|deepseek-v4.1-flash";

    expect(b.podeTentar(chave)).toBe(true);
    b.registrarFalha(chave);
    b.registrarFalha(chave);
    expect(b.podeTentar(chave)).toBe(true);
    b.registrarFalha(chave);
    expect(b.podeTentar(chave)).toBe(false);

    agora += 60_000;
    expect(b.podeTentar(chave)).toBe(true);
  });

  it("um sucesso zera as falhas", () => {
    const b = new BreakerDeModelo({ limite: 2, cooldownMs: 60_000, agora: () => 0 });
    const chave = "p|m";
    b.registrarFalha(chave);
    b.registrarSucesso(chave);
    b.registrarFalha(chave);
    expect(b.podeTentar(chave)).toBe(true);
  });

  it("chaves diferentes não se contaminam", () => {
    const b = new BreakerDeModelo({ limite: 1, cooldownMs: 60_000, agora: () => 0 });
    b.registrarFalha("p|a");
    expect(b.podeTentar("p|a")).toBe(false);
    expect(b.podeTentar("p|b")).toBe(true);
  });
});
