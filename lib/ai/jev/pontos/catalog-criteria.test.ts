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

  it("P1-A: 'cidade' orienta categoria urbana e exclui Adventure/Trilha/1000cc", () => {
    const q = perguntaDeCriteriosDeJev(entradaCat);
    const instrucao = String(q.categoria_alvo?.instructions ?? "");
    expect(instrucao).toMatch(/cidade/i);
    expect(instrucao).toMatch(/Adventure\/Trilha\/Off-road\/Esportiva\/Touring/i);
  });

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

  it("KM e POTÊNCIA só exigem se o cliente falar delas (na dúvida, NÃO)", () => {
    const q = perguntaDeCriteriosDeJev({ colunas: ["quilometragem", "potencia"], estoque: [] });
    expect(String(q["exigidos_quilometragem"]?.instructions)).toMatch(/QUILOMETRAGEM/);
    expect(String(q["exigidos_quilometragem"]?.instructions)).toMatch(/DÚVIDA, responda NÃO/);
    expect(String(q["exigidos_potencia"]?.instructions)).toMatch(/POTÊNCIA/);
    expect(String(q["exigidos_potencia"]?.instructions)).toMatch(/DÚVIDA, responda NÃO/);
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

describe("cilindrada exigida sem faixa (fallback pelo número da mensagem)", () => {
  const base = (cx: string): RespostasDeJev => ({
    intencao: { type: "choice", choice: "pedido", confidence: 1, probabilities: {} },
    exigidos_cilindrada: { type: "noul", noul: 1 },
    cx_cilindrada: { type: "choice", choice: cx, confidence: 1, probabilities: {} },
  });

  it('"moto 150" + faixa "não citou" → faixa 126–160 (exclui a 250)', () => {
    const c = criteriosDaRespostaDeJev(base("não citou"), entrada, "Vctem moto 150?");
    expect(c.exigidos).toContain("cilindrada");
    expect(c.faixas.cilindrada).toEqual({ min: 126, max: 160 });
  });

  it("não sobrescreve a faixa que a JEV escolheu", () => {
    const c = criteriosDaRespostaDeJev(base("161 a 250"), entrada, "moto 200?");
    expect(c.faixas.cilindrada).toEqual({ min: 161, max: 250 });
  });

  it("sem mensagem (ou ambígua) não inventa faixa", () => {
    expect(criteriosDaRespostaDeJev(base("não citou"), entrada).faixas.cilindrada).toBeUndefined();
    expect(
      criteriosDaRespostaDeJev(base("não citou"), entrada, "entre 150 e 300").faixas.cilindrada,
    ).toBeUndefined();
  });
});

describe('Fase 1 — valor de coluna de TEXTO pelo estoque', () => {
  const entradaCor: EntradaDeCriterios = {
    colunas: ['cor'],
    estoque: [
      { nome: 'A', valores: { cor: 'Vermelho' } },
      { nome: 'B', valores: { cor: 'Preto' } },
      { nome: 'C', valores: { cor: 'Azul' } },
    ],
  };
  const exigirCor: RespostasDeJev = { exigidos_cor: { type: 'noul', noul: 1 } };

  it('"vermelha" + exigidos_cor sem valor → Vermelho', () => {
    const c = criteriosDaRespostaDeJev(exigirCor, entradaCor, 'Quero uma moto vermelha');
    expect(c.exigidos).toContain('cor');
    expect(c.faixas.cor).toEqual(['Vermelho']);
  });

  it('cor sem match no estoque não inventa', () => {
    const c = criteriosDaRespostaDeJev(exigirCor, entradaCor, 'Quero uma moto rosa');
    expect(c.faixas.cor).toBeUndefined();
  });

  it('versão por palavra ("Fan") casa o valor real', () => {
    const entradaVersao: EntradaDeCriterios = {
      colunas: ['versao'],
      estoque: [
        { nome: 'CG 160', valores: { versao: 'FAN FLEX ONE' } },
        { nome: 'YS 250', valores: { versao: 'BLUE FLEX' } },
      ],
    };
    const c = criteriosDaRespostaDeJev(
      { exigidos_versao: { type: 'noul', noul: 1 } },
      entradaVersao,
      'Tem a versão Fan?',
    );
    expect(c.faixas.versao).toEqual(['FAN FLEX ONE']);
  });
});

describe('Fase 2 — faixa de coluna NUMÉRICA pela mensagem', () => {
  const entrada = (col: string): EntradaDeCriterios => ({ colunas: [col], estoque: [] });

  it('ano: "de 2024" → exato', () => {
    const c = criteriosDaRespostaDeJev(
      { exigidos_ano: { type: 'noul', noul: 1 } },
      entrada('ano'),
      'Quero uma moto de 2024',
    );
    expect(c.faixas.ano).toEqual({ min: 2024, max: 2024 });
  });

  it('km: "até 30 mil km" → teto 30000', () => {
    const c = criteriosDaRespostaDeJev(
      { exigidos_quilometragem: { type: 'noul', noul: 1 } },
      entrada('quilometragem'),
      'Quero uma moto até 30 mil km',
    );
    expect(c.faixas.quilometragem).toEqual({ max: 30000 });
  });

  it('preço: "até 20 mil" sem faixa da JEV → teto 20000', () => {
    const c = criteriosDaRespostaDeJev(
      { exigidos_preco: { type: 'noul', noul: 1 } },
      entrada('preco'),
      'Quero uma moto até 20 mil',
    );
    expect(c.faixas.preco).toEqual({ max: 20000 });
  });

  it('não sobrescreve a faixa que a JEV escolheu', () => {
    const c = criteriosDaRespostaDeJev(
      {
        exigidos_preco: { type: 'noul', noul: 1 },
        cx_preco: { type: 'choice', choice: 'até 10 mil', confidence: 1, probabilities: {} },
      },
      entrada('preco'),
      'Quero até 20 mil',
    );
    expect(c.faixas.preco).toEqual({ max: 10000 });
  });
});
