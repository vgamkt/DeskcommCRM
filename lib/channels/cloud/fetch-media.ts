/**
 * Download da mídia de ENTRADA da família Cloud API (Meta e parceiros Graph).
 *
 * ─── Por que um helper neutro, e não código em cada adapter ─────────────────
 *
 * Meta e Datafy falam o MESMO dialeto: o webhook entrega o handle (`media.id`),
 * e os bytes saem de um download em DOIS passos, autenticado por Bearer:
 *
 *   1. `GET {base}/{media_id}`   → `{ url, mime_type, sha256, … }`
 *   2. `GET {url}` (com Bearer) → os bytes
 *
 * A URL do passo 2 é efêmera e NÃO é pública (medido no Datafy: devolve 401 sem
 * o Authorization). Escrever isso duas vezes garantiria que a primeira correção
 * de mídia faltasse no outro canal — é a mesma razão que extraiu
 * `lib/channels/cloud/payload.ts`.
 *
 * ─── Por que o handle, e não a URL do webhook ───────────────────────────────
 *
 * A assinatura do webhook do Datafy é OPCIONAL (`lib/channels/inbound.ts`): um
 * payload forjado por quem conheça a URL secreta não é descartado por HMAC. Se o
 * download confiasse numa URL vinda do payload, esse forjador apontaria o fetch
 * — que carrega o Bearer do tenant — para um host qualquer: SSRF com vazamento
 * de credencial, exatamente o que `channel-adapter-zernio.test.ts` documenta.
 *
 * Por isso o `media_url` da família Cloud guarda o **id opaco** do provedor, não
 * uma URL: o id só entra numa URL contra a base FIXA do provedor, e o download
 * da URL devolvida passa pelos mesmos dois guardas do repo (`assertSafeOutboundUrl`
 * + `assertDestinoResolvidoSeguro`). SSRF por construção, como no canal por QR.
 */
import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import {
  MAX_MEDIA_BYTES,
  MediaTooLargeError,
  type FetchedMedia,
} from "@/lib/messaging/media/types";

const FETCH_TIMEOUT_MS = 30_000;

/**
 * O handle do provedor é ID, não caminho. O webhook pode ser forjado (assinatura
 * opcional no parceiro), então ele nunca entra cru na URL: `../` viraria path
 * traversal no host do provedor e um `https://…` inteiro viraria SSRF.
 */
const MEDIA_ID_RX = /^[A-Za-z0-9._-]+$/;

export interface CloudMediaCreds {
  token: string;
  /** Base Graph-compatível do canal: `https://graph.facebook.com/v22.0` ou `https://cloud.datafyapi.com.br/v1`. */
  graphBase: string;
}

export async function fetchCloudInboundMedia(
  input: { mediaId: string; hintMime?: string | null },
  creds: CloudMediaCreds,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedMedia> {
  const mediaId = input.mediaId.trim();
  if (!MEDIA_ID_RX.test(mediaId)) throw new Error("cloud_media_id_invalido");

  // 1. Resolve a URL de download (chamada autenticada no provedor).
  const metaRes = await fetchImpl(`${creds.graphBase}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${creds.token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!metaRes.ok) throw new Error(`cloud_media_meta_${metaRes.status}`);

  const meta = (await metaRes.json().catch(() => ({}))) as { url?: unknown; mime_type?: unknown };
  const downloadUrl = typeof meta.url === "string" && meta.url.length > 0 ? meta.url : null;
  if (!downloadUrl) throw new Error("cloud_media_sem_url");

  // 2. A URL vem da RESPOSTA autenticada do provedor — não do payload — mas o
  //    par de guardas do repo entra mesmo assim: hospedar mídia em CDN externo é
  //    escolha legítima do provedor, e destino privado NUNCA é.
  assertSafeOutboundUrl(downloadUrl);
  await assertDestinoResolvidoSeguro(new URL(downloadUrl).hostname);

  // 3. Baixa os bytes.
  const res = await fetchImpl(downloadUrl, {
    headers: { Authorization: `Bearer ${creds.token}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`cloud_media_${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  // O `content-type` da RESPOSTA manda: é o que o arquivo realmente é. A dica do
  // webhook e o `mime_type` do provedor são fallback para quando ele falta.
  const mime =
    res.headers.get("content-type")?.split(";")[0]?.trim() ||
    (typeof meta.mime_type === "string" ? meta.mime_type : null) ||
    input.hintMime?.split(";")[0]?.trim() ||
    "application/octet-stream";

  return { buffer, mime };
}
