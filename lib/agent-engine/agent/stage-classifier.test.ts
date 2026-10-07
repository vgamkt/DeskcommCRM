import { beforeEach, describe, expect, it, vi } from "vitest";

const decidirMock = vi.fn();
const runModelCallMock = vi.fn();
const alvosMock = vi.fn();

vi.mock("../../ai/jev/index", () => ({
  decidir: (...args: unknown[]) => decidirMock(...args),
}));
// A Jev agora só liga por BINDING na UI (ai_purpose_bindings) — o fallback de
// ambiente (`JEV_ENABLED`) foi removido em 2026-10-03. O teste liga/desliga
// mockando o resolvedor, não uma env var.
vi.mock("../../ai/jev/resolver", () => ({
  alvosDeJevDaOrg: (...args: unknown[]) => alvosMock(...args),
}));
vi.mock("../edge/llm/run-model-call", () => ({
  runModelCall: (...args: unknown[]) => runModelCallMock(...args),
}));

import {
  classifyStage,
  estagioDaRespostaDeJev,
  perguntaDeEstagioDeJev,
} from "./stage-classifier";

const log = {
  info: vi.fn(),
  warn: vi.fn(),
} as unknown as Parameters<typeof classifyStage>[4]["log"];

const db = {} as never;
const cfg = {} as never;
const ids = { tenantId: "org-1", leadId: "lead-1" };
const args = { context: { mensagens: [] } as never, currentStage: "new" as const };

/** Um alvo de Jev (o modelo escolhido na tela), como `alvosDeJevDaOrg` devolve. */
const ALVO = { provider: "opencode", apiKey: "k", model: "jev-1.13-free" };

function respostaChoice(choice: string) {
  return {
    provider: "opencode",
    model: "jev-1.13-free",
    respostas: { estagio: { type: "choice", choice, confidence: 1, probabilities: {} } },
    usage: { input_tokens: 1, output_tokens: 1 },
    tentativas: 1,
  };
}

beforeEach(() => {
  decidirMock.mockReset();
  runModelCallMock.mockReset();
  alvosMock.mockReset();
  // Default: sem binding → Jev desligada.
  alvosMock.mockResolvedValue([]);
});

describe("classifyStage com a Jev (Jev-first, chat como último recurso)", () => {
  it("Jev ligada (binding) e responde → usa o estágio dela e NÃO chama o chat", async () => {
    alvosMock.mockResolvedValue([ALVO]);
    decidirMock.mockResolvedValue(respostaChoice("negotiating"));
    const s = await classifyStage(db, cfg, ids, args, { log });
    expect(s).toBe("negotiating");
    expect(decidirMock).toHaveBeenCalledTimes(1);
    expect(runModelCallMock).not.toHaveBeenCalled();
  });

  it("Jev ligada mas esgotou (null) → cai no modelo de chat", async () => {
    alvosMock.mockResolvedValue([ALVO]);
    decidirMock.mockResolvedValue(null);
    runModelCallMock.mockResolvedValue({ result: { text: "qualifying" } });
    const s = await classifyStage(db, cfg, ids, args, { log });
    expect(s).toBe("qualifying");
    expect(decidirMock).toHaveBeenCalledTimes(1);
    expect(runModelCallMock).toHaveBeenCalledTimes(1);
  });

  it("sem binding (default) → comportamento atual: só o chat", async () => {
    runModelCallMock.mockResolvedValue({ result: { text: "contacted" } });
    const s = await classifyStage(db, cfg, ids, args, { log });
    expect(s).toBe("contacted");
    expect(decidirMock).not.toHaveBeenCalled();
  });
});

describe("helpers da Jev para o estágio", () => {
  it("a pergunta choice cobre todos os estágios do enum", () => {
    const pergunta = perguntaDeEstagioDeJev().estagio;
    expect(pergunta?.type).toBe("choice");
    if (!pergunta || pergunta.type !== "choice") throw new Error("esperava pergunta choice");
    expect(Object.keys(pergunta.criteria)).toHaveLength(7);
  });

  it("resposta ausente ou fora do enum → null (o chamador cai no chat)", () => {
    expect(estagioDaRespostaDeJev({})).toBeNull();
    expect(
      estagioDaRespostaDeJev({
        estagio: { type: "choice", choice: "xpto", confidence: 1, probabilities: {} },
      }),
    ).toBeNull();
  });
});
