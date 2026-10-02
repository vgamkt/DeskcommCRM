import { describe, expect, it } from "vitest";
import { alvosDeJevDe, briefDoTurnoDe } from "./config";

describe("alvosDeJevDe", () => {
  it("Jev desligada por padrão (sem JEV_ENABLED) → nenhum alvo", () => {
    expect(alvosDeJevDe({ JEV_PROVIDER: "opencode", JEV_API_KEY: "k" })).toEqual([]);
  });

  it("JEV_ENABLED falso/vazio → nenhum alvo", () => {
    expect(alvosDeJevDe({ JEV_ENABLED: "0", JEV_API_KEY: "k" })).toEqual([]);
    expect(alvosDeJevDe({ JEV_ENABLED: "", JEV_API_KEY: "k" })).toEqual([]);
  });

  it("ligada com provedor+chave monta o alvo (sem modelo)", () => {
    expect(alvosDeJevDe({ JEV_ENABLED: "1", JEV_PROVIDER: "opencode", JEV_API_KEY: " k " })).toEqual([
      { provider: "opencode", apiKey: "k" },
    ]);
  });

  it("inclui o modelo quando informado", () => {
    expect(
      alvosDeJevDe({
        JEV_ENABLED: "true",
        JEV_PROVIDER: "typesafe",
        JEV_API_KEY: "k",
        JEV_MODEL: "jev-1.13.0",
      }),
    ).toEqual([{ provider: "typesafe", apiKey: "k", model: "jev-1.13.0" }]);
  });

  it("sem chave (ou sem provedor) não monta alvo", () => {
    expect(alvosDeJevDe({ JEV_ENABLED: "1", JEV_PROVIDER: "opencode" })).toEqual([]);
    expect(alvosDeJevDe({ JEV_ENABLED: "1", JEV_API_KEY: "k" })).toEqual([]);
  });

  it("inclui o fallback quando preenchido (primário → fallback)", () => {
    const alvos = alvosDeJevDe({
      JEV_ENABLED: "1",
      JEV_PROVIDER: "opencode",
      JEV_API_KEY: "a",
      JEV_MODEL: "jev-1.13-free",
      JEV_FALLBACK_PROVIDER: "openrouter",
      JEV_FALLBACK_API_KEY: "b",
      JEV_FALLBACK_MODEL: "typesafe/jev-1.13",
    });
    expect(alvos).toEqual([
      { provider: "opencode", apiKey: "a", model: "jev-1.13-free" },
      { provider: "openrouter", apiKey: "b", model: "typesafe/jev-1.13" },
    ]);
  });

  it("fallback incompleto é ignorado sem derrubar o primário", () => {
    expect(
      alvosDeJevDe({
        JEV_ENABLED: "1",
        JEV_PROVIDER: "opencode",
        JEV_API_KEY: "a",
        JEV_FALLBACK_PROVIDER: "openrouter",
      }),
    ).toEqual([{ provider: "opencode", apiKey: "a" }]);
  });
});

describe("briefDoTurnoDe", () => {
  it("desligado por padrão (sem JEV_BRIEF_ENABLED)", () => {
    expect(briefDoTurnoDe({})).toBe(false);
    expect(briefDoTurnoDe({ JEV_ENABLED: "1" })).toBe(false);
  });

  it("aceita 1/true; rejeita 0/vazio/lixo", () => {
    expect(briefDoTurnoDe({ JEV_BRIEF_ENABLED: "1" })).toBe(true);
    expect(briefDoTurnoDe({ JEV_BRIEF_ENABLED: "true" })).toBe(true);
    expect(briefDoTurnoDe({ JEV_BRIEF_ENABLED: " FALSE " })).toBe(false);
    expect(briefDoTurnoDe({ JEV_BRIEF_ENABLED: "0" })).toBe(false);
  });
});
