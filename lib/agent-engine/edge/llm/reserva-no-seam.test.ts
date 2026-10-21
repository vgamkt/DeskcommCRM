/**
 * A RESERVA NO SEAM — prova de ligação, sem provedor real.
 *
 * O incidente de 2026-10-20: `deepseek-v4.1-flash` respondeu 429 nos auxiliares
 * (jailbreak/checkpoint) e o turno morreu ANTES do agente; o retry do turno só
 * cobre `agent_turn`. Aqui o `generateText` é dublê: o primário falha de forma
 * transitória e o seam precisa tentar o modelo do agente publicado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  CONFIG: {
    provider: "opencode_go",
    apiKey: "chave-dublê",
    defaultModel: "modelo-padrao",
    fallbackProvider: null as string | null,
    fallbackModel: null as string | null,
    params: {},
    enabledModels: [] as string[],
    orcamento: { modo: "off", tetoCents: 0, efetivoEm: null, limiarPct: 80 },
    orcamentoIndisponivelPorque: null as string | null,
  },
  DECISAO: {
    provider: "opencode_go",
    credentialId: null as string | null,
    modelId: "modelo-ruim",
    baseUrl: null as string | null,
    origem: "binding",
    avisos: [] as string[],
  },
  chamadas: [] as string[],
  falhasGravadas: [] as string[],
}));

vi.mock("./credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./credentials")>()),
  resolveOrgLlmConfig: vi.fn(async () => h.CONFIG),
}));
vi.mock("./binding-do-ponto", () => ({
  decidirParaOSeam: vi.fn(async () => h.DECISAO),
}));
vi.mock("./orcamento", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./orcamento")>()),
  aplicarOrcamento: vi.fn(async () => {}),
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  stepCountIs: vi.fn(() => undefined),
  generateText: vi.fn(async (opts: { model: { model: string } }) => {
    const modelo = opts.model.model;
    h.chamadas.push(modelo);
    if (modelo.startsWith("modelo-ruim")) {
      throw new Error(
        "AI_APICallError: Upstream request failed: Endpoint is unavailable.",
      );
    }
    if (modelo.startsWith("modelo-fatal")) {
      throw new Error("invalid_api_key");
    }
    return {
      text: "ok",
      content: [],
      steps: [],
      finishReason: { unified: "stop" },
      warnings: [],
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    };
  }),
}));

import type { ProviderRegistry } from "./providers";
import { runModelCall } from "./run-model-call";

function bancoFalso(agente: { provider: string; model: string; credential_id: string | null } | null) {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (/from ai_agents/.test(sql)) return { rows: agente ? [agente] : [] };
      if (/insert into llm_calls/.test(sql)) {
        if (/error_code/.test(sql)) h.falhasGravadas.push(String(params?.[6] ?? "?"));
        return { rows: [{ id: "call-1" }] };
      }
      return { rows: [] };
    }),
  } as unknown as import("pg").Pool;
}

const registry = {
  opencode_go: (_apiKey: string, model: string) => ({ model }),
} as unknown as ProviderRegistry;

const input = (model: string, purpose: string) => ({
  tenantId: "org-1",
  purpose,
  model,
  messages: [{ role: "user" as const, content: "oi" }],
});

describe("runModelCall — reserva em falha transitória", () => {
  beforeEach(() => {
    h.chamadas.length = 0;
    h.falhasGravadas.length = 0;
    h.CONFIG.fallbackProvider = null;
    h.CONFIG.fallbackModel = null;
    h.DECISAO.modelId = "modelo-ruim";
  });

  it("auxiliar: primário indisponível → tenta o modelo do agente publicado", async () => {
    const db = bancoFalso({ provider: "opencode_go", model: "modelo-bom", credential_id: null });
    const out = await runModelCall(db, {} as never, input("modelo-ruim", "jailbreak_detect"), {
      registry,
    });
    expect(h.chamadas).toEqual(["modelo-ruim", "modelo-bom"]);
    expect(out.model).toBe("modelo-bom");
    expect(out.origem).toBe("modelo_do_agente");
    // O fracasso do primário não some da telemetria.
    expect(h.falhasGravadas).toContain("modelo-ruim");
  });

  it("auxiliar: erro fatal (chave inválida) NÃO consome reserva", async () => {
    h.DECISAO.modelId = "modelo-fatal-1";
    const db = bancoFalso({ provider: "opencode_go", model: "modelo-bom", credential_id: null });
    await expect(
      runModelCall(db, {} as never, input("modelo-fatal-1", "checkpoint"), { registry }),
    ).rejects.toThrow(/invalid_api_key/);
    expect(h.chamadas).toEqual(["modelo-fatal-1"]);
  });

  it("agent_turn tem retry/handoff próprio — o seam não duplica a reserva", async () => {
    h.DECISAO.modelId = "modelo-ruim-3";
    const db = bancoFalso({ provider: "opencode_go", model: "modelo-bom", credential_id: null });
    await expect(
      runModelCall(db, {} as never, input("modelo-ruim-3", "agent_turn"), { registry }),
    ).rejects.toThrow(/unavailable/);
    expect(h.chamadas).toEqual(["modelo-ruim-3"]);
  });

  it("reserva configurada na tela vem antes do modelo do agente", async () => {
    h.DECISAO.modelId = "modelo-ruim-4";
    h.CONFIG.fallbackProvider = "opencode_go";
    h.CONFIG.fallbackModel = "modelo-reserva";
    const db = bancoFalso({ provider: "opencode_go", model: "modelo-bom", credential_id: null });
    const out = await runModelCall(db, {} as never, input("modelo-ruim-4", "stage_classifier"), {
      registry,
    });
    expect(h.chamadas).toEqual(["modelo-ruim-4", "modelo-reserva"]);
    expect(out.origem).toBe("reserva_configurada");
  });
});
