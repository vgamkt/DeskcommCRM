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
    // Faixa EXATA = o que o cliente pediu (1ª oferta SÓ o que casa exatamente).
    expect(c.faixas.preco).toEqual({ min: 15000, max: 20000 });
    expect(c.faixas.cilindrada).toEqual({ min: 161, max: 250 });
    // MARGEM ±30% (regra do dono) = as SIMILARES, que vão para a fila do "ver mais".
    expect(c.faixasSimilares.preco).toEqual({ min: 10500, max: 26000 });
    expect(c.faixasSimilares.cilindrada).toEqual({ min: 113, max: 325 });
    expect(c.hipoteses).toEqual([
      { nome: "Honda CB 300", preco: "14990", cilindrada: "293.5", marca: "Honda", score: 0.8 },
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
    const c = criteriosDaRespostaDeJev(respostas, entrada);
    expect(c.faixas.preco).toEqual({ max: 20000 });
    expect(c.faixasSimilares.preco).toEqual({ max: 26000 });
  });

  it("'intervalo' mantém min e max (exato; a margem vai em faixasSimilares)", () => {
    const respostas: RespostasDeJev = {
      cx_preco: { type: "choice", choice: "15 a 20 mil", confidence: 1, probabilities: {} },
      modo_preco: { type: "choice", choice: "intervalo", confidence: 1, probabilities: {} },
    };
    const c = criteriosDaRespostaDeJev(respostas, entrada);
    expect(c.faixas.preco).toEqual({ min: 15000, max: 20000 });
    expect(c.faixasSimilares.preco).toEqual({ min: 10500, max: 26000 });
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
    const c = criteriosDaRespostaDeJev(r, entradaPotencia);
    expect(c.faixas.potencia).toEqual({ min: 21, max: 30 });
    expect(c.faixasSimilares.potencia).toEqual({ min: 15, max: 39 });
  });

  it("a exigência de MARCA avisa para não contar marca DENTRO do nome do modelo", () => {
    const q = perguntaDeCriteriosDeJev(entradaPotencia);
    expect(String(q["exigidos_marca"]?.instructions)).toMatch(/DENTRO do nome/i);
  });

  it("a hipótese 'parecida' dá peso maior à CILINDRADA (sem outro filtro) e aos FILTROS COMBINADOS, e NÃO exclui por marca", () => {
    const q = perguntaDeCriteriosDeJev({
      colunas: ["categoria"],
      estoque: [{ nome: "Honda CB 300" }],
    });
    const instrucao = String(q["parecida_0"]?.instructions);
    expect(instrucao).toMatch(/CILINDRADA é o critério que MAIS pesa/i);
    expect(instrucao).toMatch(/FILTROS COMBINADOS/i);
    expect(instrucao).toMatch(/NUNCA exclua por marca/i);
  });
});

describe("estilo/categoria por si (ESCOPO 11)", () => {
  const entradaCat: EntradaDeCriterios = {
    colunas: ["categoria"],
    estoque: [
      { nome: "XTZ 150 Crosser", valores: { categoria: "Adventure / Trilha" } },
      { nome: "CB 300 F", valores: { categoria: "Motos Seminovas" } },
    ],
  };

  it("cria categoria_alvo com as categorias REAIS do estoque", () => {
    const q = perguntaDeCriteriosDeJev(entradaCat);
    expect(q.categoria_alvo?.type).toBe("choice");
    const crit = q.categoria_alvo?.criteria as Record<string, string> | undefined;
    expect(crit?.["Adventure / Trilha"]).toBeTruthy();
    expect(crit?.["nenhuma"]).toBeTruthy();
  });

  it("categoria_alvo → exigência + faixa de texto (o motor MANTÉM o estilo)", () => {
    const r: RespostasDeJev = {
      categoria_alvo: { type: "choice", choice: "Adventure / Trilha", confidence: 1, probabilities: {} },
    };
    const c = criteriosDaRespostaDeJev(r, entradaCat);
    expect(c.exigidos).toContain("categoria");
    expect(c.faixas.categoria).toEqual(["Adventure / Trilha"]);
  });

  it("categoria_alvo='nenhuma' não exige categoria", () => {
    const r: RespostasDeJev = {
      categoria_alvo: { type: "choice", choice: "nenhuma", confidence: 1, probabilities: {} },
    };
    expect(criteriosDaRespostaDeJev(r, entradaCat).exigidos).not.toContain("categoria");
  });

  it("a exigência de ESTILO fala de manter o estilo (não completar com outros)", () => {
    const q = perguntaDeCriteriosDeJev(entradaCat);
    expect(String(q["exigidos_categoria"]?.instructions)).toMatch(/MANTER esse estilo/i);
  });
});

describe("ESCOPO 9 — moto em foco (interesse ∩ critério)", () => {
  it("com motoEmFoco, a intenção explica o REFINO e cita as motos em foco", () => {
    const q = perguntaDeCriteriosDeJev({
      ...entrada,
      motoEmFoco: ["HONDA CB 300", "HONDA CBX 250"],
    });
    expect(String(q.intencao?.instructions)).toMatch(/FOCO/i);
    expect(String(q.intencao?.instructions)).toMatch(/REFINO/i);
    expect(String(q.intencao?.instructions)).toMatch(/HONDA CB 300/);
  });

  it("com motoEmFoco, a hipótese prioriza a MESMA família/linha em foco", () => {
    const q = perguntaDeCriteriosDeJev({ ...entrada, motoEmFoco: ["HONDA CB 300"] });
    expect(String(q["parecida_0"]?.instructions)).toMatch(/INTERESSE EM FOCO/i);
  });

  it("com motoEmFoco, pedido de MODELO por nome NÃO é lido como alternativa", () => {
    const q = perguntaDeCriteriosDeJev({ ...entrada, motoEmFoco: ["HONDA CB 300"] });
    const instr = String(q.intencao?.instructions);
    // Regra que impede a regressão: pedir um modelo (mesmo de outro estilo) = "pedido".
    expect(instr).toMatch(/MODELO por NOME/i);
    expect(instr).toMatch(/PEDIDO NOVO/i);
    expect(instr).toMatch(/NUNCA responda "alternativa"/i);
  });

  it("sem motoEmFoco, NÃO injeta a regra de refino", () => {
    const q = perguntaDeCriteriosDeJev(entrada);
    expect(String(q.intencao?.instructions)).not.toMatch(/REFINO/i);
    expect(String(q["parecida_0"]?.instructions)).not.toMatch(/INTERESSE EM FOCO/i);
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
