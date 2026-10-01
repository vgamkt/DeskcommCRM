import { describe, expect, it } from "vitest";

import {
  comporMensagemDoResumo,
  montarCabecalhoDoResumo,
  montarPromptDeResumo,
  montarTranscricao,
  PROMPT_PADRAO_DO_RESUMO,
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

  it("com instruções do dono, o SYSTEM É o texto dele (substitui o padrão)", () => {
    const com = montarPromptDeResumo({
      nomeContato: null,
      resumoAnterior: null,
      transcricao: "x",
      instrucoes: "fale em 3 bullets; destaque o valor",
    });
    expect(com.system).toBe("fale em 3 bullets; destaque o valor");
    expect(com.system).not.toContain("Você é o assistente");
  });

  it("sem instruções, o system é o texto PADRÃO do resumo", () => {
    const sem = montarPromptDeResumo({ nomeContato: null, resumoAnterior: null, transcricao: "x" });
    expect(sem.system).toBe(PROMPT_PADRAO_DO_RESUMO);
    expect(sem.system).toContain("Você é o assistente");
  });
});

describe("cabeçalho do informante", () => {
  it("mostra nome, cidade, CNH, moto, pagamento e o link do WhatsApp", () => {
    const cab = montarCabecalhoDoResumo({
      nome: "Vander",
      telefone: "+55 12 99770-0101",
      custom: { cidade: "sao paulo", cnh: true, moto_interesse: "Honda Biz 125", forma_pagamento: "Financiamento" },
    });
    expect(cab).toContain("*Vander*");
    expect(cab).toContain("Cidade: sao paulo");
    expect(cab).toContain("CNH: sim");
    expect(cab).toContain("Moto de interesse: Honda Biz 125");
    expect(cab).toContain("Forma de pagamento: Financiamento");
    // O telefone vira link clicável para abrir a conversa.
    expect(cab).toContain("https://wa.me/5512997700101");
  });

  it("CNH `false` vira 'não'", () => {
    expect(montarCabecalhoDoResumo({ nome: null, telefone: null, custom: { cnh: false } })).toContain("CNH: não");
  });

  it("campo sem registro fica EM BRANCO (não inventa)", () => {
    const cab = montarCabecalhoDoResumo({ nome: null, telefone: null, custom: {} });
    expect(cab).toContain("Cidade:");
    expect(cab).not.toMatch(/Cidade: \S/);
    expect(cab).not.toMatch(/Moto de interesse: \S/);
    expect(cab).not.toMatch(/WhatsApp: \S/);
  });

  it("comporMensagemDoResumo põe o cabeçalho acima do resumo", () => {
    const m = comporMensagemDoResumo("Cliente X\nWhatsApp: https://wa.me/55", "O cliente quer uma moto.");
    expect(m.indexOf("Cliente X")).toBeLessThan(m.indexOf("O cliente quer uma moto."));
  });

  it("sem cabeçalho, a mensagem é só o resumo", () => {
    expect(comporMensagemDoResumo("", "só resumo")).toBe("só resumo");
  });
});