import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A MÍDIA RECEBIDA PELA FAMÍLIA CLOUD (Meta e Datafy) — OS TRÊS ELOS.
 *
 * Repete, para o canal oficial/parceiro, a lição de `midia-de-entrada-por-canal`:
 * a linha entrava com `type:"audio"`/`"image"` e SEM bytes, porque faltavam os
 * três elos ao mesmo tempo. Consertar um só deixaria os outros dois calados.
 *
 *   1. a ingestão grava `media_url` (o worker procura ali);
 *   2. a ingestão emite `media.persist_requested` (alguém acorda o worker);
 *   3. o adapter do canal implementa `fetchInboundMedia` (quem baixa é o canal).
 *
 * O valor gravado é o **media id** do provedor, não a URL do webhook: a URL é
 * efêmera, exige Bearer e a assinatura do parceiro é opcional — confiar nela
 * seria SSRF com a credencial do tenant. Ver `lib/channels/cloud/fetch-media.ts`.
 */

const INGEST = readFileSync("lib/channels/meta/ingest.ts", "utf8");
const HELPERS = readFileSync("lib/channels/cloud/fetch-media.ts", "utf8");

describe("elo 1 — a ingestão grava onde o worker procura", () => {
  it("grava `media_url` a partir do id do provedor", () => {
    expect(INGEST).toMatch(/media_url: e\.media\?\.id \?\? null/);
  });

  it("NÃO grava a URL que veio no payload (SSRF-com-credencial)", () => {
    // `e.media.url` existe no evento, mas é efêmera e não confiável. Um regresso
    // a `e.media?.url` aqui reabriria o furo que o helper fecha.
    expect(INGEST).not.toMatch(/media_url: e\.media\?\.url/);
  });
});

describe("elo 2 — alguém acorda o worker", () => {
  it("emite `media.persist_requested`", () => {
    expect(INGEST).toMatch(/p_event_type: "media\.persist_requested"/);
  });

  it("só quando HÁ mídia", () => {
    expect(INGEST).toMatch(/if \(e\.media && messageId\)/);
  });

  it("falha do emit não derruba a ingestão", () => {
    expect(INGEST).toMatch(/logger\.warn\("\[meta\.ingest\] emit media\.persist_requested falhou"/);
  });
});

describe("elo 3 — quem baixa é o canal, pelo mesmo helper neutro", () => {
  it("o canal oficial implementa `fetchInboundMedia`", () => {
    const meta = readFileSync("lib/channels/adapters/meta-cloud.ts", "utf8");
    expect(meta).toMatch(/async fetchInboundMedia\(/);
    expect(meta).toMatch(/fetchCloudInboundMedia\(/);
  });

  it("o parceiro Graph implementa `fetchInboundMedia`", () => {
    const datafy = readFileSync("lib/channels/adapters/datafy.ts", "utf8");
    expect(datafy).toMatch(/async fetchInboundMedia\(/);
    expect(datafy).toMatch(/fetchCloudInboundMedia\(/);
  });

  it("o helper recusa handle que não é id (anti path traversal/SSRF)", () => {
    expect(HELPERS).toMatch(/MEDIA_ID_RX/);
    expect(HELPERS).toMatch(/cloud_media_id_invalido/);
  });

  it("o helper guarda o host do download mesmo vindo da resposta do provedor", () => {
    expect(HELPERS).toMatch(/assertSafeOutboundUrl\(downloadUrl\)/);
    expect(HELPERS).toMatch(/assertDestinoResolvidoSeguro\(new URL\(downloadUrl\)\.hostname\)/);
  });
});
