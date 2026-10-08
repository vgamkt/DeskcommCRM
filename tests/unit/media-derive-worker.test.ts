import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadMock = vi.fn();
const updateEqMock = vi.fn();
const messageRow = {
  id: "msg1",
  organization_id: "org1",
  type: "audio" as string,
  media_mime: "audio/ogg",
  media_storage_path: "org1/conv1/msg1.ogg",
  media_derived_status: null as string | null,
};

/**
 * O dublê PRECISA saber em que tabela está.
 *
 * A versão anterior devolvia `messageRow` para qualquer `from(...)` e encadeava
 * exatamente dois `.eq`. Isso a tornava frágil nos dois eixos: o worker passou a
 * consultar `ai_purpose_bindings` (com três filtros) e o stub quebrava no
 * terceiro `.eq` — falha que aparece como "status error" e aponta para o lugar
 * errado. O Proxy devolve o chain para qualquer filtro, e a linha vem por
 * tabela: mensagem para `messages`, NENHUM binding para `ai_purpose_bindings`
 * (o caso "ninguém configurou nada", que é o comportamento anterior que estes
 * casos existem para preservar).
 */
const bindingDeVisao: { provider: string; model_id: string; credential_id: string | null } | null = null;

/** Cadeia de transcrição configurada (tabela) — `null` = nenhuma (comportamento histórico). */
let cadeiaDeTranscricao:
  | { provider: string; model_id: string; credential_id: string | null }[]
  | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      // `messages` devolve a linha; as tabelas de configuração (bindings e a
      // cadeia de transcrição) devolvem NADA — o caso "ninguém configurou", que
      // é o comportamento histórico que estes casos existem para preservar.
      const linha =
        tabela === "ai_purpose_bindings" || tabela === "ai_transcription_targets"
          ? bindingDeVisao
          : messageRow;
      const dadosDaTabela =
        tabela === "ai_transcription_targets" ? (cadeiaDeTranscricao ?? []) : linha ? [linha] : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const terminais: any = {
        maybeSingle: async () => ({ data: linha, error: null }),
        single: async () => ({ data: linha, error: null }),
        update: (patch: Record<string, unknown>) => {
          updateEqMock(patch);
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: dadosDaTabela, error: null }).then(resolve),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = new Proxy(terminais, {
        get: (alvo, prop) =>
          prop in alvo ? alvo[prop as keyof typeof alvo] : () => chain,
      });
      return chain;
    },
    storage: { from: () => ({ download: downloadMock }) },
  }),
}));

vi.mock("@/lib/messaging/media/derive", () => ({
  deriveMediaText: vi.fn(async () => "transcrição do áudio real"),
}));

// resolveOrgLlmConfig e generateText mockados: o worker precisa de credencial p/
// montar as deps, mas o teste não exercita rede.
vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({
  resolveOrgLlmConfig: vi.fn(async () => ({
    provider: "openai",
    apiKey: "sk-test",
    defaultModel: "gpt-5",
    params: {},
    enabledModels: [],
    orcamento: { modo: "off", tetoCents: 0, efetivoEm: null, limiarPct: 80 },
    orcamentoIndisponivelPorque: null,
  })),
}));

import {
  GROQ_TRANSCRIPTION_BASE,
  GROQ_TRANSCRIPTION_MODEL,
  OPENROUTER_TRANSCRIPTION_BASE,
  OPENROUTER_TRANSCRIPTION_MODEL,
  deriveMessageMedia,
  destinoDaTranscricao,
  destinoExplicitoDaTranscricao,
} from "@/workers/media-derive-worker";
import { deriveMediaText } from "@/lib/messaging/media/derive";
import { resolveOrgLlmConfig } from "@/lib/agent-engine/edge/llm/credentials";

function eventRow(attempts = 0) {
  return {
    id: "ev1",
    organization_id: "org1",
    event_type: "media.derive_requested",
    entity_kind: "message",
    entity_id: "msg1",
    payload: { message_id: "msg1" },
    metadata: {},
    consumed_by: [],
    attempts,
  };
}

describe("deriveMessageMedia", () => {
  beforeEach(() => {
    downloadMock.mockReset().mockResolvedValue({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null });
    updateEqMock.mockReset();
    messageRow.media_derived_status = null;
    messageRow.type = "audio";
    cadeiaDeTranscricao = null;
    vi.mocked(deriveMediaText).mockReset().mockResolvedValue("transcrição do áudio real");
  });

  it("baixa a mídia, deriva e grava ready", async () => {
    const r = await deriveMessageMedia(eventRow());
    expect(r.status).toBe("ok");
    expect(updateEqMock).toHaveBeenCalledWith(
      expect.objectContaining({ media_derived_text: "transcrição do áudio real", media_derived_status: "ready" }),
    );
  });

  it("pula se já derivado (idempotência)", async () => {
    messageRow.media_derived_status = "ready";
    const r = await deriveMessageMedia(eventRow());
    expect(r.status).toBe("skipped");
    expect(deriveMediaText).not.toHaveBeenCalled();
  });

  it("tipo sem derivado (sticker) → skipped sem baixar", async () => {
    messageRow.type = "sticker";
    const r = await deriveMessageMedia(eventRow());
    expect(r.status).toBe("skipped");
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("erro na derivação marca failed no último attempt", async () => {
    vi.mocked(deriveMediaText).mockRejectedValue(new Error("transcription_503"));
    const r = await deriveMessageMedia(eventRow(4));
    expect(r.status).toBe("error");
    expect(updateEqMock).toHaveBeenCalledWith(
      expect.objectContaining({ media_derived_status: "failed" }),
    );
  });

  it("usa a CADEIA ORDENADA da tabela quando ela existe (ordem manda)", async () => {
    cadeiaDeTranscricao = [
      { provider: "deepgram", model_id: "nova-3", credential_id: null },
      { provider: "groq", model_id: "whisper-large-v3-turbo", credential_id: null },
    ];
    vi.mocked(resolveOrgLlmConfig).mockClear();
    const r = await deriveMessageMedia(eventRow());
    expect(r.status).toBe("ok");
    // `resolveOrgLlmConfig` é chamado uma vez sem override (config da org) e
    // depois uma vez por item da cadeia, NA ORDEM configurada.
    const provedores = vi
      .mocked(resolveOrgLlmConfig)
      .mock.calls.map((c) => (c[3] as { provider?: string } | undefined)?.provider)
      .filter((p): p is string => typeof p === "string");
    expect(provedores).toEqual(["deepgram", "groq"]);
  });
});

describe("destinoDaTranscricao — o áudio tem caminho próprio, paralelo ao chat", () => {
  it("OpenRouter reusa a MESMA chave e o STT da OpenRouter (modelo padrão)", () => {
    expect(destinoDaTranscricao({ provedor: "openrouter", chave: "sk-or-v1-do-chat" })).toEqual({
      kind: "openai_compat",
      apiKey: "sk-or-v1-do-chat",
      baseUrl: OPENROUTER_TRANSCRIPTION_BASE,
      model: OPENROUTER_TRANSCRIPTION_MODEL,
    });
  });

  it("OpenRouter respeita um modelo de STT alternativo", () => {
    const d = destinoDaTranscricao({
      provedor: "openrouter",
      chave: "sk-or-v1-do-chat",
      model: "openai/whisper-large-v3",
    });
    expect(d?.model).toBe("openai/whisper-large-v3");
    expect(d?.baseUrl).toBe(OPENROUTER_TRANSCRIPTION_BASE);
  });

  it("Groq usa o endpoint OpenAI-compatível dela e whisper-large-v3-turbo", () => {
    expect(destinoDaTranscricao({ provedor: "groq", chave: "gsk_x" })).toEqual({
      kind: "openai_compat",
      apiKey: "gsk_x",
      baseUrl: GROQ_TRANSCRIPTION_BASE,
      model: GROQ_TRANSCRIPTION_MODEL,
    });
  });

  it("OpenAI usa api.openai.com + whisper-1 (base/model ausentes = default)", () => {
    expect(destinoDaTranscricao({ provedor: "openai", chave: "sk-openai" })).toEqual({
      kind: "openai_compat",
      apiKey: "sk-openai",
    });
  });

  it("Deepgram usa o endpoint próprio com modelo/language", () => {
    expect(destinoDaTranscricao({ provedor: "deepgram", chave: "dg_x" })).toEqual({
      kind: "deepgram",
      apiKey: "dg_x",
      model: "nova-3",
      language: "pt",
    });
  });

  it("provedor sem transcrição compatível (anthropic/google) → null", () => {
    expect(destinoDaTranscricao({ provedor: "anthropic", chave: "sk-ant" })).toBeNull();
    expect(destinoDaTranscricao({ provedor: "google", chave: "gk" })).toBeNull();
  });
});

describe("destinoExplicitoDaTranscricao — o override do .env vence tudo", () => {
  it("sem chave explícita → null (o chamador resolve pela credencial da org)", () => {
    expect(destinoExplicitoDaTranscricao({})).toBeNull();
    expect(destinoExplicitoDaTranscricao({ apiKey: "   " })).toBeNull();
    expect(destinoExplicitoDaTranscricao({ apiKey: "", baseUrl: "https://x" })).toBeNull();
  });

  it("chave explícita leva base e modelo (ex.: Groq)", () => {
    expect(
      destinoExplicitoDaTranscricao({
        apiKey: "gsk_groq",
        baseUrl: "https://api.groq.com/openai",
        model: "whisper-large-v3-turbo",
      }),
    ).toEqual({
      kind: "openai_compat",
      apiKey: "gsk_groq",
      baseUrl: "https://api.groq.com/openai",
      model: "whisper-large-v3-turbo",
    });
  });
});
