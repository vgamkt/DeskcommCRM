import { describe, expect, it, vi } from "vitest";

import { apiTranscriptionProvider, transcricaoEmCadeia } from "@/lib/messaging/media/transcription";

describe("apiTranscriptionProvider", () => {
  it("POSTa multipart pro endpoint de transcrição e devolve o texto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "olá, quero comprar" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = apiTranscriptionProvider({ apiKey: "sk-test" }, fetchMock);
    const text = await provider.transcribe(Buffer.from([1, 2, 3]), "audio/ogg; codecs=opus");
    expect(text).toBe("olá, quero comprar");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("aceita baseUrl/model alternativos (serviço compatível) e tira a barra final", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = apiTranscriptionProvider(
      {
        apiKey: "groq-key",
        baseUrl: "https://api.groq.com/openai/",
        model: "whisper-large-v3-turbo",
      },
      fetchMock,
    );
    await provider.transcribe(Buffer.from([1]), "audio/ogg");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect((init.body as FormData).get("model")).toBe("whisper-large-v3-turbo");
  });

  it("propaga erro HTTP do provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    const provider = apiTranscriptionProvider({ apiKey: "bad" }, fetchMock);
    await expect(provider.transcribe(Buffer.from([1]), "audio/ogg")).rejects.toThrow(/transcription_401/);
  });
});

describe("transcricaoEmCadeia — fallback quando um provedor falha", () => {
  it("Groq esgotado (429) cai para a OpenRouter e devolve o texto", async () => {
    const chamadas: string[] = [];
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      chamadas.push(u);
      if (u.includes("groq")) return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify({ text: "ok no segundo" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const provider = transcricaoEmCadeia(
      [
        { apiKey: "gsk", baseUrl: "https://api.groq.com/openai" },
        { apiKey: "sk-or", baseUrl: "https://openrouter.ai/api" },
      ],
      fetchMock as unknown as typeof fetch,
    );
    expect(await provider.transcribe(Buffer.from([1]), "audio/ogg")).toBe("ok no segundo");
    expect(chamadas[0]).toContain("groq");
    expect(chamadas[1]).toContain("openrouter");
  });

  it("propaga o erro do ÚLTIMO provedor quando todos falham", async () => {
    const fetchMock = vi.fn(async () => new Response("x", { status: 429 }));
    const provider = transcricaoEmCadeia(
      [{ apiKey: "a" }, { apiKey: "b" }],
      fetchMock as unknown as typeof fetch,
    );
    await expect(provider.transcribe(Buffer.from([1]), "audio/ogg")).rejects.toThrow(
      /transcription_429/,
    );
  });

  it("sem provedores → erro claro (o chamador decide o aviso)", async () => {
    const provider = transcricaoEmCadeia([]);
    await expect(provider.transcribe(Buffer.from([1]), "audio/ogg")).rejects.toThrow(
      /transcription_sem_provedor/,
    );
  });
});
