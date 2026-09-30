import { describe, expect, it } from "vitest";

import { extrairCitacaoWaha } from "@/lib/waha/citacao";

/**
 * O cliente responde "em cima" de uma mensagem e escreve só "Gostei dessa": sem
 * ler o `contextInfo.quotedMessage`, o motor não sabe a QUAL moto ele se refere
 * e assume a última oferecida (defeito medido ao vivo, 2026-09-28).
 */
describe("extrairCitacaoWaha", () => {
  it("lê o id e o texto de uma resposta em cima de TEXTO", () => {
    const citacao = extrairCitacaoWaha({
      extendedTextMessage: {
        text: "Gostei dessa",
        contextInfo: {
          stanzaId: "3EB0ABCDEF",
          participant: "5511999999999@s.whatsapp.net",
          quotedMessage: { conversation: "Quanto custa essa moto?" },
        },
      },
    });
    expect(citacao).toEqual({
      stanzaId: "3EB0ABCDEF",
      participant: "5511999999999@s.whatsapp.net",
      texto: "Quanto custa essa moto?",
    });
  });

  it("lê a LEGENDA da foto citada (o caso da moto com legenda)", () => {
    const citacao = extrairCitacaoWaha({
      imageMessage: {
        contextInfo: {
          stanzaId: "3EB0112233",
          quotedMessage: {
            imageMessage: { caption: "HONDA CBX 250 Twister\nCor: Cinza\nPreço: R$ 9.990,00" },
          },
        },
      },
    });
    expect(citacao?.stanzaId).toBe("3EB0112233");
    expect(citacao?.texto).toContain("HONDA CBX 250 Twister");
  });

  it("sem citação devolve null (contextInfo de anúncio/menção não conta)", () => {
    expect(
      extrairCitacaoWaha({
        extendedTextMessage: {
          text: "oi",
          contextInfo: { externalAdReplyInfo: { title: "Campanha" } },
        },
      }),
    ).toBeNull();
    expect(extrairCitacaoWaha({ conversation: "oi" })).toBeNull();
    expect(extrairCitacaoWaha(null)).toBeNull();
    expect(extrairCitacaoWaha("texto")).toBeNull();
  });

  it("mantém a citação mesmo sem id (só texto) — nunca lança", () => {
    const citacao = extrairCitacaoWaha({
      extendedTextMessage: {
        contextInfo: { quotedMessage: { conversation: "HONDA CB 300" } },
      },
    });
    expect(citacao).toEqual({ stanzaId: null, participant: null, texto: "HONDA CB 300" });
  });
});
