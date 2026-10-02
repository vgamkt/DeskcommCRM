import { describe, expect, it } from "vitest";
import { alvosDeJevDe, briefDoTurnoDe, fallbackDeJevDe } from "./config";
import { motorDeJevDe } from "./motor";

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

describe("fallbackDeJevDe", () => {
  it("monta o fallback SEM exigir JEV_ENABLED (serve ao primário vindo do binding)", () => {
    expect(
      fallbackDeJevDe({ JEV_FALLBACK_PROVIDER: "openrouter", JEV_FALLBACK_API_KEY: "k" }),
    ).toEqual([{ provider: "openrouter", apiKey: "k" }]);
  });

  it("vazio quando incompleto", () => {
    expect(fallbackDeJevDe({ JEV_FALLBACK_PROVIDER: "openrouter" })).toEqual([]);
    expect(fallbackDeJevDe({})).toEqual([]);
  });
});

describe("motorDeJevDe", () => {
  it("vazio sem env (usa o MOTOR_PADRAO)", () => {
    expect(motorDeJevDe({})).toEqual({});
  });

  it("lê as chaves válidas", () => {
    expect(
      motorDeJevDe({
        JEV_MAX_TENTATIVAS: "20",
        JEV_TIMEOUT_MS: "3000",
        JEV_CAP_TOTAL_MS: "90000",
        JEV_BASE_MS: "250",
        JEV_MAX_MS: "5000",
      }),
    ).toEqual({
      maxTentativas: 20,
      timeoutPorTentativaMs: 3000,
      capTotalMs: 90000,
      baseMs: 250,
      maxMs: 5000,
    });
  });

  it("ignora JEV_MAX_TENTATIVAS < 10 (regra do dono: a Jev insiste)", () => {
    expect(motorDeJevDe({ JEV_MAX_TENTATIVAS: "3" })).toEqual({});
  });

  it("clampa JEV_MAX_TENTATIVAS em 100", () => {
    expect(motorDeJevDe({ JEV_MAX_TENTATIVAS: "9999" })).toEqual({ maxTentativas: 100 });
  });

  it("ignora valores inválidos/negativos", () => {
    expect(motorDeJevDe({ JEV_TIMEOUT_MS: "abc", JEV_CAP_TOTAL_MS: "-5" })).toEqual({});
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
