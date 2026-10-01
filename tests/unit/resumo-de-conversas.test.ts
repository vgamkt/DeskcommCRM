import { describe, expect, it } from "vitest";

import {
  montarPromptDeResumo,
  montarTranscricao,
  rotuloDoAutor,
  textoDaMensagem,
  type MensagemResumivel,
} from "@/lib/conversas/resumo";

/**
 * A parte PURA do informante "Resumo de Conversas": quem falou, qual texto entra
 * e como o pedido é montado. A orquestração (banco/envio) fica no cron; aqui se
 * prova o que ele manda ao modelo — o que, se errado, produz um resumo que o
 * gerente não entende ou que inventa informação.
 */

function msg(over: Partial<MensagemResumivel> = {}): MensagemResumivel {
  return {
    direction: "inbound",
    sent_via: null,
    body: null,
    media_derived_text: null,
    type: "text",
    ...over,
  };
}

describe("rotuloDoAutor", () => {
  it("cliente, bot e atendente pelo celular são distinguíveis", () => {
    expect(rotuloDoAutor({ direction: "inbound", sent_via: null })).toBe("Cliente");
    expect(rotuloDoAutor({ direction: "outbound", sent_via: "crm" })).toContain("Sistema");
    // O gerente precisa saber quando um HUMANO entrou — é o sinal de handoff.
    expect(rotuloDoAutor({ direction: "outbound", sent_via: "external_device" })).toContain("celular");
  });
});

describe("textoDaMensagem", () => {
  it("usa o corpo quando existe", () => {
    expect(textoDaMensagem(msg({ body: "oi" }))).toBe("oi");
  });

  it("cai no derivado da mídia (áudio já transcrito) quando não há corpo", () => {
    expect(textoDaMensagem(msg({ body: "", media_derived_text: "Quero uma moto" }))).toBe(
      "Quero uma moto",
    );
  });

  it("mídia sem texto vira rótulo do tipo, não string vazia", () => {
    expect(textoDaMensagem(msg({ type: "image", body: null }))).toBe("[image]");
  });
});

describe("montarTranscricao", () => {
  it("rotula cada linha e ignora o que não tem texto", () => {
    const t = montarTranscricao([
      msg({ direction: "inbound", body: "Gostei dessa" }),
      msg({ direction: "outbound", sent_via: "crm", body: "" }),
      msg({ direction: "outbound", sent_via: "crm", body: "Boa escolha!" }),
    ]);
    expect(t).toBe("Cliente: Gostei dessa\nSistema/Atendente: Boa escolha!");
  });
});

describe("montarPromptDeResumo", () => {
  it("primeira rodada pede o resumo do zero", () => {
    const p = montarPromptDeResumo({
      nomeContato: "Maria",
      resumoAnterior: null,
      transcricao: "Cliente: oi",
    });
    const texto = String(p.messages[0]!.content);
    expect(texto).toContain("Conversa com Maria");
    expect(texto).toContain("Cliente: oi");
    expect(texto).toContain("Escreva o resumo para o gerente.");
    expect(texto).not.toContain("ATUALIZE");
  });

  it("com resumo anterior pede ATUALIZAÇÃO levando o resumo e só o que veio depois", () => {
    const p = montarPromptDeResumo({
      nomeContato: null,
      resumoAnterior: "Cliente aguardava o preço da Biz.",
      transcricao: "Cliente: e aí, conseguiu?",
    });
    const texto = String(p.messages[0]!.content);
    expect(texto).toContain("Cliente aguardava o preço da Biz.");
    expect(texto).toContain("Cliente: e aí, conseguiu?");
    expect(texto).toMatch(/ATUALIZADO/i);
  });

  it("sem nome de contato, não inventa um — fala 'o cliente'", () => {
    const p = montarPromptDeResumo({ nomeContato: null, resumoAnterior: null, transcricao: "x" });
    expect(String(p.messages[0]!.content)).toContain("Conversa com o cliente");
  });
});