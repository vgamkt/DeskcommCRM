import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: (v: unknown) => v,
  decryptKey: () => "CHAVE-DECIFRADA",
}));

import type pg from "pg";
import { alvosDeJevDaOrg, jevLigadaParaBrief } from "./resolver";
import { ehModeloDeJev } from "./cliente";

type QueryResp = { rows: Record<string, unknown>[] };
function dbMock(respostas: QueryResp[] | (() => QueryResp)): pg.Pool {
  const query = vi.fn(async () =>
    typeof respostas === "function" ? respostas() : (respostas.shift() ?? { rows: [] }),
  );
  return { query } as unknown as pg.Pool;
}

beforeEach(() => {
  // O `.env` da instalação (produção) pode trazer JEV_* — o teste tem de medir o
  // que ele MESMO monta, não o ambiente da máquina.
  for (const k of [
    "JEV_ENABLED",
    "JEV_PROVIDER",
    "JEV_API_KEY",
    "JEV_MODEL",
    "JEV_FALLBACK_PROVIDER",
    "JEV_FALLBACK_API_KEY",
    "JEV_FALLBACK_MODEL",
  ])
    delete process.env[k];
});
afterEach(() => {
  for (const k of [
    "JEV_ENABLED",
    "JEV_PROVIDER",
    "JEV_API_KEY",
    "JEV_MODEL",
    "JEV_FALLBACK_PROVIDER",
    "JEV_FALLBACK_API_KEY",
    "JEV_FALLBACK_MODEL",
  ])
    delete process.env[k];
});

describe("alvosDeJevDaOrg", () => {
  it("binding Jev-capaz monta o alvo com a chave decifrada", async () => {
    const db = dbMock([
      { rows: [{ provider: "opencode", credential_id: "c1", model_id: "jev-1.13-free" }] },
      { rows: [{ api_key_encrypted: "x", api_key_iv: "y", api_key_tag: "z" }] },
    ]);
    expect(await alvosDeJevDaOrg(db, "org", "stage_classifier")).toEqual([
      { provider: "opencode", apiKey: "CHAVE-DECIFRADA", model: "jev-1.13-free" },
    ]);
  });

  it("binding de provedor NÃO Jev-capaz cai no ambiente (off → [])", async () => {
    const db = dbMock([
      { rows: [{ provider: "anthropic", credential_id: "c1", model_id: "claude" }] },
    ]);
    expect(await alvosDeJevDaOrg(db, "org", "stage_classifier")).toEqual([]);
  });

  it("sem binding cai no ambiente (off → [])", async () => {
    const db = dbMock([{ rows: [] }]);
    expect(await alvosDeJevDaOrg(db, "org", "stage_classifier")).toEqual([]);
  });

  it("erro de leitura do binding cai no ambiente, sem lançar", async () => {
    const db = dbMock(() => {
      throw new Error("db down");
    });
    expect(await alvosDeJevDaOrg(db, "org", "stage_classifier")).toEqual([]);
  });

  it("sem binding usa o ambiente quando ligado", async () => {
    process.env.JEV_ENABLED = "1";
    process.env.JEV_PROVIDER = "opencode";
    process.env.JEV_API_KEY = "k";
    const db = dbMock([{ rows: [] }]);
    expect(await alvosDeJevDaOrg(db, "org", "stage_classifier")).toEqual([
      { provider: "opencode", apiKey: "k" },
    ]);
  });

  it("binding de provedor Jev-capaz com modelo de CHAT NÃO vira alvo (a UI manda; não cai no ambiente)", async () => {
    process.env.JEV_ENABLED = "1";
    process.env.JEV_PROVIDER = "opencode";
    process.env.JEV_API_KEY = "k";
    const db = dbMock([
      { rows: [{ provider: "openrouter", credential_id: "c1", model_id: "openai/gpt-4o-mini" }] },
    ]);
    expect(await alvosDeJevDaOrg(db, "org", "stage_classifier")).toEqual([]);
  });

  it("binding Jev-capaz ganha o FALLBACK do ambiente como segundo alvo (failover)", async () => {
    process.env.JEV_FALLBACK_PROVIDER = "opencode";
    process.env.JEV_FALLBACK_API_KEY = "fk";
    const db = dbMock([
      { rows: [{ provider: "openrouter", credential_id: "c1", model_id: "typesafe/jev-1.13" }] },
      { rows: [{ api_key_encrypted: "x", api_key_iv: "y", api_key_tag: "z" }] },
    ]);
    expect(await alvosDeJevDaOrg(db, "org", "stage_classifier")).toEqual([
      { provider: "openrouter", apiKey: "CHAVE-DECIFRADA", model: "typesafe/jev-1.13" },
      { provider: "opencode", apiKey: "fk" },
    ]);
  });

  it("binding Jev-capaz sem modelo explícito usa o modelo padrão da base Jev", async () => {
    const db = dbMock([
      { rows: [{ provider: "opencode", credential_id: "c1", model_id: null }] },
      { rows: [{ api_key_encrypted: "x", api_key_iv: "y", api_key_tag: "z" }] },
    ]);
    expect(await alvosDeJevDaOrg(db, "org", "stage_classifier")).toEqual([
      { provider: "opencode", apiKey: "CHAVE-DECIFRADA", model: "jev-1.13-free" },
    ]);
  });
});

describe("ehModeloDeJev", () => {
  it("reconhece a família Jev e rejeita modelos de chat", () => {
    expect(ehModeloDeJev("opencode", "jev-1.13-free")).toBe(true);
    expect(ehModeloDeJev("openrouter", "typesafe/jev-1.13")).toBe(true);
    expect(ehModeloDeJev("typesafe", "qualquer-coisa")).toBe(true);
    expect(ehModeloDeJev("openrouter", "openai/gpt-4o-mini")).toBe(false);
    expect(ehModeloDeJev("anthropic", "claude-sonnet-4-5")).toBe(false);
    expect(ehModeloDeJev("openai", null)).toBe(false);
  });
});

describe("jevLigadaParaBrief", () => {
  it("true com binding de modelo Jev; false com binding só de chat", async () => {
    const dbJev = dbMock([{ rows: [{ provider: "opencode", model_id: "jev-1.13-free" }] }]);
    expect(await jevLigadaParaBrief(dbJev, "org")).toBe(true);
    const dbChat = dbMock([{ rows: [{ provider: "openrouter", model_id: "openai/gpt-4o-mini" }] }]);
    expect(await jevLigadaParaBrief(dbChat, "org")).toBe(false);
  });

  it("sem binding nenhum, decide pelo ambiente", async () => {
    delete process.env.JEV_ENABLED;
    const db = dbMock([{ rows: [] }]);
    expect(await jevLigadaParaBrief(db, "org")).toBe(false);
  });
});
