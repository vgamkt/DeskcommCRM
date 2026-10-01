import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A MÍDIA DE ENTRADA DA FAMÍLIA CLOUD — o download em dois passos, autenticado.
 *
 * Este helper é o que destrava a paridade com o canal por QR para áudio→
 * transcrição, imagem→descrição e PDF→texto. O que se prova aqui é o CONTRATO
 * medido contra a API real do parceiro:
 *
 *   GET {base}/{media_id}        → 200 { url, mime_type }
 *   GET {url}  (Bearer)          → 200 bytes        (401 sem Bearer)
 *
 * E — tão importante quanto — que o handle vem do PAYLOAD (assinatura opcional
 * no parceiro) e por isso NÃO pode virar SSRF: o id entra numa URL contra a base
 * FIXA do provedor, e a URL devolvida passa pelos dois guardas do repo.
 */
vi.mock("@/lib/automation/outbound-ip", () => ({
  assertDestinoResolvidoSeguro: vi.fn(async () => {}),
}));

import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { fetchCloudInboundMedia } from "@/lib/channels/cloud/fetch-media";
import { MediaTooLargeError } from "@/lib/messaging/media/types";

const CREDS = { token: "sk_live_x", graphBase: "https://cloud.example.test/v1" };

function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function respostaBytes(bytes: number[], headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(assertDestinoResolvidoSeguro).mockClear();
});

describe("fetchCloudInboundMedia", () => {
  it("resolve pelo id, manda Bearer nos DOIS passos e devolve os bytes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respostaJson({ id: "3001", url: "https://cdn.example.test/media/3001/download", mime_type: "audio/ogg" }),
      )
      .mockResolvedValueOnce(respostaBytes([0x4f, 0x67, 0x67, 0x53], { "content-type": "audio/ogg" }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchCloudInboundMedia({ mediaId: "3001", hintMime: "audio/ogg; codecs=opus" }, CREDS);

    expect(r.mime).toBe("audio/ogg");
    expect(Array.from(r.buffer)).toEqual([0x4f, 0x67, 0x67, 0x53]);

    const [metaUrl, metaInit] = fetchMock.mock.calls[0]!;
    expect(metaUrl).toBe("https://cloud.example.test/v1/3001");
    expect((metaInit.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_x");

    const [dlUrl, dlInit] = fetchMock.mock.calls[1]!;
    expect(dlUrl).toBe("https://cdn.example.test/media/3001/download");
    expect((dlInit.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_x");

    expect(assertDestinoResolvidoSeguro).toHaveBeenCalledWith("cdn.example.test");
  });

  it("handle fora do formato de id é RECUSADO sem chamar fetch (anti path traversal/SSRF)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const ruim of ["../../etc/passwd", "https://evil.test/x", "a/b", "id com espaço"]) {
      await expect(fetchCloudInboundMedia({ mediaId: ruim }, CREDS)).rejects.toThrow(
        /cloud_media_id_invalido/,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem `url` na resposta do provedor → erro nomeado, sem baixar", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respostaJson({ id: "1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCloudInboundMedia({ mediaId: "1" }, CREDS)).rejects.toThrow(
      /cloud_media_sem_url/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("o content-type da RESPOSTA manda; o mime_type do provedor é fallback", async () => {
    const semContentType = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ url: "https://cdn.example.test/a", mime_type: "image/jpeg" }))
      .mockResolvedValueOnce(respostaBytes([1, 2, 3]));
    vi.stubGlobal("fetch", semContentType);

    const r = await fetchCloudInboundMedia({ mediaId: "1", hintMime: "application/octet-stream" }, CREDS);
    expect(r.mime).toBe("image/jpeg");
  });

  it("URL de download em host privado é RECUSADA antes de baixar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ url: "http://169.254.169.254/latest/meta-data/" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCloudInboundMedia({ mediaId: "1" }, CREDS)).rejects.toThrow(/unsafe_url/);
    // O guard é antes do download: a credencial NÃO pode sair para o host privado.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("acima do teto de bytes → MediaTooLargeError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ url: "https://cdn.example.test/a" }))
      .mockResolvedValueOnce(
        respostaBytes([1, 2, 3], { "content-length": String(60 * 1024 * 1024) }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCloudInboundMedia({ mediaId: "1" }, CREDS)).rejects.toBeInstanceOf(
      MediaTooLargeError,
    );
  });

  it("provedor recusando o passo 1 vira erro com o status", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(respostaJson({}, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCloudInboundMedia({ mediaId: "1" }, CREDS)).rejects.toThrow(
      /cloud_media_meta_401/,
    );
  });
});
