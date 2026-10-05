import { describe, expect, it } from "vitest";

import { parseMetaWebhook, type MessageEchoEvent } from "@/lib/channels/meta/webhook";

/**
 * Payload REAL de `smb_message_echoes` capturado do Datafy (2026-10-05) — o
 * espelho de uma mensagem que o operador mandou pelo app do WhatsApp Business
 * (coexistência). É o insumo que deixa o CRM perceber que uma pessoa assumiu.
 */
const ECHO_REAL = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "38462772406703139",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5512981672501", phone_number_id: "1304703359397659" },
            contacts: [{ wa_id: "5512997700101", user_id: "BR.29003490222617578" }],
            message_echoes: [
              {
                from: "5512981672501",
                to: "5512997700101",
                id: "wamid.HBgUQlIuMjkwMDM0OTAyMjI2MTc1NzgVFAARGCBBNUJGQzg4NDY4M0QzMDg2NjAyOTg0RTdENEFFQjNCNgA=",
                to_user_id: "BR.29003490222617578",
                timestamp: "1791239816",
                text: { body: "Teste echo" },
                type: "text",
              },
            ],
          },
          field: "smb_message_echoes",
        },
      ],
    },
  ],
};

const echoes = (env: unknown) =>
  parseMetaWebhook(env as Parameters<typeof parseMetaWebhook>[0]).filter(
    (e): e is MessageEchoEvent => e.kind === "message_echo",
  );

describe("smb_message_echoes (coexistência)", () => {
  it("extrai o echo de saída do app (from = nós, to = contato)", () => {
    const [e] = echoes(ECHO_REAL);
    expect(e).toMatchObject({
      kind: "message_echo",
      phoneNumberId: "1304703359397659",
      from: "5512981672501",
      to: "5512997700101",
      type: "text",
      text: "Teste echo",
    });
    expect(e!.externalId).toMatch(/^wamid\./);
  });

  it("timestamp vem em SEGUNDOS", () => {
    expect(echoes(ECHO_REAL)[0]!.sentAt.getTime()).toBe(1791239816 * 1000);
  });

  it("campo desconhecido continua ignorado (não vira evento)", () => {
    const outro = {
      object: "whatsapp_business_account",
      entry: [{ id: "1", changes: [{ field: "account_alerts", value: {} }] }],
    };
    expect(parseMetaWebhook(outro as never)).toHaveLength(0);
  });
});
