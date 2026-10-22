import { describe, expect, it } from "vitest";
import {
  MOTO_NENHUMA,
  motoEscolhidaDaRespostaDeJev,
  perguntaDeMotoEscolhidaJev,
} from "./moto-escolhida";

function respostaChoice(choice: string) {
  return { moto: { type: "choice" as const, choice, confidence: 1, probabilities: {} } };
}

describe("perguntaDeMotoEscolhidaJev", () => {
  it("oferece 'nenhuma' + uma opção por candidata", () => {
    const p = perguntaDeMotoEscolhidaJev(["Honda CB 300", "Yamaha Factor"]).moto;
    expect(p?.type).toBe("choice");
    if (!p || p.type !== "choice") throw new Error("esperava choice");
    expect(Object.keys(p.criteria).sort()).toEqual(["Honda CB 300", "Yamaha Factor", MOTO_NENHUMA]);
  });

  it("traz as regras que substituem os gates: 'SEM REFERÊNCIA' e 'ÚNICA EM FOCO'", () => {
    const p = perguntaDeMotoEscolhidaJev(["Yamaha Factor 150"]).moto;
    if (!p || p.type !== "choice") throw new Error("esperava choice");
    expect(p.instructions).toContain("SEM REFERÊNCIA");
    expect(p.instructions).toContain("ÚNICA EM FOCO");
  });

  it('nome + ANO identifica UMA candidata e NÃO pode ser substituída por parecida', () => {
    const p = perguntaDeMotoEscolhidaJev(['HONDA CB 300 R 2011', 'HONDA CB 300 R FLEX 2015']).moto;
    if (!p || p.type !== 'choice') throw new Error('esperava choice');
    expect(p.instructions).toContain('NÃO SUBSTITUA');
    expect(p.instructions).toContain('CB 300 R 2011');
    expect(p.instructions).toMatch(/NÃO autoriza trocar/);
  });

  it('escolha + objeção na MESMA frase é ESCOLHA (não "nenhuma")', () => {
    const p = perguntaDeMotoEscolhidaJev(['Honda CB 300 R 2011']).moto;
    if (!p || p.type !== 'choice') throw new Error('esperava choice');
    expect(p.instructions).toContain('ESCOLHA + OBJEÇÃO');
    expect(p.instructions).toContain('NÃO anula');
    expect(p.instructions).toMatch(/achei caro/);
  });

  it("o texto da LOJA (modelo) não cria escolha; só desambigua uma deíctica do cliente", () => {
    const p = perguntaDeMotoEscolhidaJev(["Honda CG 160 Fan", "Yamaha NMax 160"]).moto;
    if (!p || p.type !== "choice") throw new Error("esperava choice");
    expect(p.instructions).toContain("NÃO cria escolha sozinho");
    expect(p.instructions).toMatch(/DESAMBIGUAR/);
    expect(p.instructions).toMatch(/Sao paulo|CNH/);
  });
});

describe("motoEscolhidaDaRespostaDeJev", () => {
  it("devolve o nome escolhido", () => {
    expect(motoEscolhidaDaRespostaDeJev(respostaChoice("Yamaha Factor"))).toBe("Yamaha Factor");
  });
  it("'nenhuma' (qualquer caixa) → null", () => {
    expect(motoEscolhidaDaRespostaDeJev(respostaChoice("nenhuma"))).toBeNull();
    expect(motoEscolhidaDaRespostaDeJev(respostaChoice("NENHUMA"))).toBeNull();
  });
  it("ausente/outro tipo → null", () => {
    expect(motoEscolhidaDaRespostaDeJev({})).toBeNull();
  });
});
