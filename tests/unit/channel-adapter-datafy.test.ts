import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/channels/graph-parceiro/credentials", () => ({
  resolveGraphPartnerCreds: vi.fn(),
  graphPartnerGraphBase: () => "https://cloud.example.test/v1",
}));
vi.mock("@/lib/channels/meta/send-template-for-session", () => ({
  sendTemplateForSession: vi.fn(),
}));
vi.mock("@/lib/channels/cloud/fetch-media", () => ({
  fetchCloudInboundMedia: vi.fn(async () => ({ buffer: Buffer.from([1, 2, 3]), mime: "audio/ogg" })),
}));

import { datafyAdapter } from "@/lib/channels/adapters/datafy";
import { fetchCloudInboundMedia } from "@/lib/channels/cloud/fetch-media";
import { resolveGraphPartnerCreds } from "@/lib/channels/graph-parceiro/credentials";
import { sendTemplateForSession } from "@/lib/channels/meta/send-template-for-session";
import type { OutboundEnvelope } from "@/lib/channels/types";

const CREDS = {
  phoneNumberId: "106540352242922",
  wabaId: "366634483210360",
  token: "sk_live_abc",
  rootUrl: "https://cloud.example.test",
  source: "session" as const,
};

function envelope(over: Partial<OutboundEnvelope> = {}): OutboundEnvelope {
  return {
    organizationId: "org-1",
    sessionRef: "106540352242922",
    to: "5531999998888",
    kind: "text",
    body: "olá",
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(resolveGraphPartnerCreds).mockReset();
  vi.mocked(resolveGraphPartnerCreds).mockResolvedValue(CREDS);
  vi.restoreAllMocks();
});

describe("adapter datafy", () => {
  it("endereça por E.164 em dígitos e recusa grupo", () => {
    expect(datafyAdapter.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: "+55 (31) 99999-8888", waIdentity: null })).toBe("5531999998888");
    expect(datafyAdapter.resolveRecipient({ isGroup: true, groupChatId: "g", phoneNumber: null, waIdentity: null })).toBeNull();
    expect(datafyAdapter.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null })).toBeNull();
  });

  it("envia texto pela base do parceiro com o token da sessão", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.X" }] }), { status: 200 }),
    );

    const r = await datafyAdapter.send(envelope());

    expect(r.externalId).toBe("wamid.X");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://cloud.example.test/v1/106540352242922/messages");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_abc");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "5531999998888" });
    expect(body.text.body).toBe("olá");
  });

  it("sem credencial é NOOP (não lança)", async () => {
    vi.mocked(resolveGraphPartnerCreds).mockResolvedValue(null);
    const r = await datafyAdapter.send(envelope());
    expect(r.externalId).toBeNull();
  });

  it("erro da API vira exceção com o código do provider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 131047, message: "window closed" } }), {
        status: 400,
      }),
    );
    await expect(datafyAdapter.send(envelope())).rejects.toThrow(/datafy_131047/);
  });

  it("sendTemplate usa o transporte do parceiro (host + token), não o da Meta", async () => {
    vi.mocked(sendTemplateForSession).mockResolvedValue("wamid.T");

    const r = await datafyAdapter.sendTemplate!({
      organizationId: "org-1",
      sessionRef: "106540352242922",
      to: "5531999998888",
      name: "pedido_confirmado",
      language: "pt_BR",
      values: { "1": "João" },
    });

    expect(r.externalId).toBe("wamid.T");
    const chamada = vi.mocked(sendTemplateForSession).mock.calls[0];
    expect(chamada?.[1].transport).toEqual({
      phoneNumberId: "106540352242922",
      token: "sk_live_abc",
      graphBase: "https://cloud.example.test/v1",
      errorPrefix: "datafy",
    });
    expect(chamada?.[1].organizationId).toBe("org-1");
  });

  it("checkHealth mapeia 401 para FAILED e rede para reachable=false", async () => {
    const health = datafyAdapter.checkHealth!;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    expect(await health({ organizationId: "org-1", sessionRef: "1" })).toMatchObject({
      reachable: true,
      status: "FAILED",
    });

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
    expect(await health({ organizationId: "org-1", sessionRef: "1" })).toMatchObject({
      reachable: false,
      status: null,
    });
  });

  it("fetchInboundMedia passa o media id e a credencial da sessão para o helper neutro", async () => {
    const r = await datafyAdapter.fetchInboundMedia!({
      organizationId: "org-1",
      sessionRef: "106540352242922",
      url: "3001880776842122",
      hintMime: "audio/ogg; codecs=opus",
    });

    expect(r.mime).toBe("audio/ogg");
    const [entrada, creds] = vi.mocked(fetchCloudInboundMedia).mock.calls[0]!;
    expect(entrada).toEqual({ mediaId: "3001880776842122", hintMime: "audio/ogg; codecs=opus" });
    expect(creds).toEqual({ token: "sk_live_abc", graphBase: "https://cloud.example.test/v1" });
  });

  it("sem credencial o download falha alto — não devolve mídia vazia", async () => {
    vi.mocked(resolveGraphPartnerCreds).mockResolvedValue(null);
    await expect(
      datafyAdapter.fetchInboundMedia!({ organizationId: "org-1", sessionRef: "1", url: "2" }),
    ).rejects.toThrow(/datafy_not_configured/);
  });

  it("com citação manda `context.message_id` (paridade com o canal por QR)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.R" }] }), { status: 200 }));

    await datafyAdapter.send(envelope({ replyToExternalId: "wamid.ORIG" }));

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    expect(body.context).toEqual({ message_id: "wamid.ORIG" });
  });

  it("sem citação NÃO manda `context`", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.R" }] }), { status: 200 }));

    await datafyAdapter.send(envelope());

    const body = JSON.parse(String(fetchSpy.mock.calls[0]![1]?.body));
    expect(body).not.toHaveProperty("context");
  });
});
