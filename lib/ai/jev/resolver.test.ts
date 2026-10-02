import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: (v: unknown) => v,
  decryptKey: () => "CHAVE-DECIFRADA",
}));

import type pg from "pg";
import { alvosDeJevDaOrg } from "./resolver";

type QueryResp = { rows: Record<string, unknown>[] };
function dbMock(respostas: QueryResp[] | (() => QueryResp)): pg.Pool {
  const query = vi.fn(async () =>
    typeof respostas === "function" ? respostas() : (respostas.shift() ?? { rows: [] }),
  );
  return { query } as unknown as pg.Pool;
}

beforeEach(() => {
  delete process.env.JEV_ENABLED;
});
afterEach(() => {
  delete process.env.JEV_ENABLED;
  delete process.env.JEV_PROVIDER;
  delete process.env.JEV_API_KEY;
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
});
