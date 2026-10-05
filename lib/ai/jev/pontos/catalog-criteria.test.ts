import { describe, expect, it } from "vitest";
import {
  criteriosDaRespostaDeJev,
  perguntaDeCriteriosDeJev,
  type EntradaDeCriterios,
} from "./catalog-criteria";
import type { RespostasDeJev } from "../tipos";

const entrada: EntradaDeCriterios = {
  colunas: ["preco", "cilindrada", "marca"],
  estoque: [
    { nome: "Honda CB 300", valores: { preco: "14990", cilindrada: "293.5", marca: "Honda" } },
    { nome: "Yamaha Factor 150", valores: { preco: "15400", cilindrada: "150", marca: "Yamaha" } },
  ],
};

describe("perguntaDeCriteriosDeJev", () => {
  it("inclui intencao, principal, exigidos por coluna e faixas", () => {
    const q = perguntaDeCriteriosDeJev(entrada);
    expect(q.intencao?.type).toBe("choice");
    expect(q.principal?.type).toBe("choice");
    expect(q["exigidos_preco"]?.type).toBe("noul");
    expect(q["exigidos_marca"]?.type).toBe("noul");
    expect(q.cx_preco?.type).toBe("choice");
    expect(q.cx_cilindrada?.type).toBe("choice");
    expect(q.modo_preco?.type).toBe("choice");
    expect(q.modo_cilindrada?.type).toBe("choice");
    expect(q["parecida_0"]?.type).toBe("noul");
    expect(q["parecida_1"]?.type).toBe("noul");
  });

  it("não cria faixa de preço quando não há coluna de preço", () => {
    const q = perguntaDeCriteriosDeJev({ colunas: ["marca"], estoque: [] });
    expect(q.cx_preco).toBeUndefined();
    expect(q.cx_cilindrada).toBeUndefined();
  });
});

describe("criteriosDaRespostaDeJev", () => {
  it("mapeia intenção, exigidos, principal, faixas e hipóteses", () => {
    const respostas: RespostasDeJev = {
      intencao: { type: "choice", choice: "pedido", confidence: 1, probabilities: {} },
      principal: { type: "choice", choice: "preco", confidence: 1, probabilities: {} },
      exigidos_preco: { type: "noul", noul: 0.9 },
      exigidos_cilindrada: { type: "noul", noul: 0.2 },
      exigidos_marca: { type: "noul", noul: 0.1 },
      cx_preco: { type: "choice", choice: "15 a 20 mil", confidence: 1, probabilities: {} },
      cx_cilindrada: { type: "choice", choice: "161 a 250", confidence: 1, probabilities: {} },
      parecida_0: { type: "noul", noul: 0.8 },
      parecida_1: { type: "noul", noul: 0.3 },
    };
    const c = criteriosDaRespostaDeJev(respostas, entrada);
    expect(c.intencao).toBe("pedido");
    expect(c.exigidos).toEqual(["preco"]);
    expect(c.principal).toBe("preco");
    // Faixas com margem de ±30% (regra do dono).
    expect(c.faixas.preco).toEqual({ min: 10500, max: 26000 });
    expect(c.faixas.cilindrada).toEqual({ min: 113, max: 325 });
    expect(c.hipoteses).toEqual([
      { nome: "Honda CB 300", preco: "14990", cilindrada: "293.5", marca: "Honda" },
    ]);
    expect(c.criterios).toEqual({});
  });

  it("faixa 'não citou' não vira faixa", () => {
    const respostas: RespostasDeJev = {
      cx_preco: { type: "choice", choice: "não citou", confidence: 1, probabilities: {} },
    };
    expect(criteriosDaRespostaDeJev(respostas, entrada).faixas).toEqual({});
  });

  it("'teto' (até) usa só o limite superior — não inventa um mínimo", () => {
    const respostas: RespostasDeJev = {
      cx_preco: { type: "choice", choice: "15 a 20 mil", confidence: 1, probabilities: {} },
      modo_preco: { type: "choice", choice: "teto", confidence: 1, probabilities: {} },
    };
    expect(criteriosDaRespostaDeJev(respostas, entrada).faixas.preco).toEqual({ max: 26000 });
  });

  it("'intervalo' mantém min e max", () => {
    const respostas: RespostasDeJev = {
      cx_preco: { type: "choice", choice: "15 a 20 mil", confidence: 1, probabilities: {} },
      modo_preco: { type: "choice", choice: "intervalo", confidence: 1, probabilities: {} },
    };
    expect(criteriosDaRespostaDeJev(respostas, entrada).faixas.preco).toEqual({
      min: 10500,
      max: 26000,
    });
  });
});

describe("potência (atributo-chave) e marca", () => {
  const entradaPotencia: EntradaDeCriterios = {
    colunas: ["categoria", "cilindrada", "potencia", "marca"],
    estoque: [],
  };

  it("cria faixa de POTÊNCIA e a mapeia com margem ±30%", () => {
    const q = perguntaDeCriteriosDeJev(entradaPotencia);
    expect(q.cx_potencia?.type).toBe("choice");
    expect(q.modo_potencia?.type).toBe("choice");
    const r: RespostasDeJev = {
      cx_potencia: { type: "choice", choice: "21 a 30", confidence: 1, probabilities: {} },
    };
    expect(criteriosDaRespostaDeJev(r, entradaPotencia).faixas.potencia).toEqual({
      min: 15,
      max: 39,
    });
  });

  it("a exigência de MARCA avisa para não contar marca DENTRO do nome do modelo", () => {
    const q = perguntaDeCriteriosDeJev(entradaPotencia);
    expect(String(q["exigidos_marca"]?.instructions)).toMatch(/DENTRO do nome/i);
  });

  it("a hipótese 'parecida' pesa TODOS os atributos igualmente e NÃO exclui por marca", () => {
    const q = perguntaDeCriteriosDeJev({
      colunas: ["categoria"],
      estoque: [{ nome: "Honda CB 300" }],
    });
    const instrucao = String(q["parecida_0"]?.instructions);
    expect(instrucao).toMatch(/PESO IGUAL/i);
    expect(instrucao).toMatch(/NUNCA exclua por marca/i);
  });
});

describe("marca por si (marca_alvo)", () => {
  it("cria a pergunta marca_alvo com as marcas REAIS do estoque", () => {
    const q = perguntaDeCriteriosDeJev(entrada);
    expect(q.marca_alvo?.type).toBe("choice");
    const crit = q.marca_alvo?.criteria as Record<string, string> | undefined;
    expect(crit?.["Honda"]).toBeTruthy();
    expect(crit?.["Yamaha"]).toBeTruthy();
    expect(crit?.["nenhuma"]).toBeTruthy();
  });

  it("marca_alvo=Honda vira exigência + faixa de texto ['Honda']", () => {
    const r: RespostasDeJev = {
      marca_alvo: { type: "choice", choice: "Honda", confidence: 1, probabilities: {} },
    };
    const c = criteriosDaRespostaDeJev(r, entrada);
    expect(c.exigidos).toContain("marca");
    expect(c.faixas.marca).toEqual(["Honda"]);
  });

  it("marca_alvo=nenhuma não exige marca", () => {
    const r: RespostasDeJev = {
      marca_alvo: { type: "choice", choice: "nenhuma", confidence: 1, probabilities: {} },
    };
    const c = criteriosDaRespostaDeJev(r, entrada);
    expect(c.exigidos).not.toContain("marca");
    expect(c.faixas.marca).toBeUndefined();
  });
});
