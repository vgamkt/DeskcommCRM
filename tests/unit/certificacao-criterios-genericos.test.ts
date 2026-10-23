import { describe, expect, it } from "vitest";

import type { CatalogoMapeamento } from "@/lib/external-db/catalogo";
import { numeroDaCelula, parsePreco } from "@/lib/agent-engine/agent/similaridade";

import type { MotoDoCatalogo } from "@/lib/agent-engine/agent/fotos-do-catalogo";
import {
  filtrarPorExigencias,
  hipotesesDeMaiorNota,
  selecionarPorIntencao,
} from "@/lib/agent-engine/agent/selecao-por-intencao";

/**
 * FASE 4 — CERTIFICAÇÃO dos critérios genéricos (2026-10-23).
 *
 * Matriz de INVARIANTES: cada coluna/combinação que a JEV pode marcar tem de
 * filtrar de verdade, sem vazar outra cc/cor/marca, e a 1ª (principais) não pode
 * trazer a hipótese fora do filtro rígido (ex.: CB 300 num pedido de 160).
 * Teste de unidade, sem LLM e sem tocar no runtime.
 */

const MAPEAMENTO: CatalogoMapeamento = {
  connectionId: "c1",
  schemaName: "public",
  tableName: "motos",
  colNome: "nome",
  colVersao: null,
  colAno: "ano",
  colCor: "cor",
  colKm: "quilometragem",
  colPreco: "preco",
  colImagem: "imagem_url",
  colEstoque: null,
  colCilindrada: "cilindrada",
  colTipo: "categoria",
  buscaOperador: "contem",
  similaridadeDeterministica: true,
  similaresQtd: 3,
  colunas: [
    { coluna: "nome", comparar: true, ordem: 1, compoeNome: true },
    { coluna: "categoria", comparar: true, ordem: 2 },
    { coluna: "cilindrada", comparar: true, ordem: 2 },
    { coluna: "marca", comparar: true, ordem: 3 },
    { coluna: "cor", comparar: true, ordem: 3 },
    { coluna: "preco", comparar: true, ordem: 4 },
    { coluna: "ano", comparar: true, ordem: 4 },
    { coluna: "quilometragem", comparar: true, ordem: 4 },
  ],
  colSimilares: "moto_similar",
};

function moto(
  nome: string,
  dados: {
    marca: string;
    categoria: string;
    cor: string;
    cilindrada: string;
    preco: string;
    ano: string;
    km: string;
  },
): MotoDoCatalogo {
  return {
    nome,
    fotos: [`http://x/${nome.replace(/\s+/g, "-")}.jpg`],
    preco: dados.preco,
    valores: { nome, ...dados, quilometragem: dados.km, moto_similar: "" },
  };
}

const ESTOQUE: MotoDoCatalogo[] = [
  moto("HONDA CG 160 FAN 2022", { marca: "HONDA", categoria: "Street", cor: "Vermelho", cilindrada: "160", preco: "17500", ano: "2022", km: "87000" }),
  moto("YAMAHA NMax 160 2023", { marca: "YAMAHA", categoria: "Scooter", cor: "Vermelho", cilindrada: "160", preco: "18990", ano: "2023", km: "2000" }),
  moto("YAMAHA Factor 150 2018", { marca: "YAMAHA", categoria: "Street", cor: "Vermelho", cilindrada: "149,3", preco: "12990", ano: "2018", km: "60000" }),
  moto("YAMAHA Factor 125 2015", { marca: "YAMAHA", categoria: "Street", cor: "Vermelho", cilindrada: "125", preco: "9500", ano: "2015", km: "65000" }),
  moto("YAMAHA YS Fazer 250 2017", { marca: "YAMAHA", categoria: "Street", cor: "Vermelho", cilindrada: "249", preco: "17990", ano: "2017", km: "82300" }),
  moto("YAMAHA XMax 250 2023", { marca: "YAMAHA", categoria: "Scooter", cor: "Vermelho", cilindrada: "249", preco: "31900", ano: "2023", km: "12000" }),
  moto("HONDA CB 300 F 2022", { marca: "HONDA", categoria: "Naked", cor: "Vermelho", cilindrada: "293,5", preco: "28990", ano: "2022", km: "4500" }),
  moto("HONDA Biz 125 2021", { marca: "HONDA", categoria: "Street", cor: "Prata", cilindrada: "125", preco: "14500", ano: "2021", km: "21000" }),
  moto("HONDA Pop 110 2020", { marca: "HONDA", categoria: "Street", cor: "Azul", cilindrada: "110", preco: "9000", ano: "2020", km: "40000" }),
  moto("YAMAHA XTZ 150 Crosser 2023", { marca: "YAMAHA", categoria: "Trail", cor: "Azul", cilindrada: "150", preco: "21000", ano: "2023", km: "12000" }),
  moto("HONDA CB 500 X 2022", { marca: "HONDA", categoria: "Trail", cor: "Preto", cilindrada: "500", preco: "38000", ano: "2022", km: "20000" }),
  moto("HONDA ADV 160 2024", { marca: "HONDA", categoria: "Scooter", cor: "Vermelho", cilindrada: "160", preco: "22000", ano: "2024", km: "1000" }),
];

const nomes = (ms: readonly MotoDoCatalogo[]) => ms.map((m) => m.nome);

describe("Fase 4 — matriz de critérios (invariantes)", () => {
  it("cor: só as vermelhas (nunca prata/azul/preto)", () => {
    const r = filtrarPorExigencias(ESTOQUE, ["cor"], [], { cor: ["Vermelho"] }, 30);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => String(m.valores?.cor).toLowerCase() === "vermelho")).toBe(true);
  });

  it("marca: só Honda", () => {
    const r = filtrarPorExigencias(ESTOQUE, ["marca"], [], { marca: ["HONDA"] }, 30);
    expect(r.length).toBe(6);
    expect(r.every((m) => m.valores?.marca === "HONDA")).toBe(true);
  });

  it("categoria: só trilha (Trail)", () => {
    const r = filtrarPorExigencias(ESTOQUE, ["categoria"], [], { categoria: ["Trail"] }, 30);
    expect(nomes(r).sort()).toEqual(["HONDA CB 500 X 2022", "YAMAHA XTZ 150 Crosser 2023"]);
  });

  it("cilindrada 160 (126–160): nenhuma 249/293,5", () => {
    const r = filtrarPorExigencias(ESTOQUE, ["cilindrada"], [], { cilindrada: { min: 126, max: 160 } }, 30);
    expect(r.length).toBe(5); // CG160, NMax160, Factor150 (149,3), XTZ150, ADV160
    expect(nomes(r)).not.toContain("YAMAHA YS Fazer 250 2017");
    expect(nomes(r)).not.toContain("YAMAHA XMax 250 2023");
    expect(nomes(r)).not.toContain("HONDA CB 300 F 2022");
  });

  it("preço até 20 mil: nenhuma acima", () => {
    const r = filtrarPorExigencias(ESTOQUE, ["preco"], [], { preco: { max: 20000 } }, 30);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => Number(m.preco) <= 20000)).toBe(true);
  });

  it("ano 2024: exato", () => {
    const r = filtrarPorExigencias(ESTOQUE, ["ano"], [], { ano: { min: 2024, max: 2024 } }, 30);
    expect(nomes(r)).toEqual(["HONDA ADV 160 2024"]);
  });

  it("quilometragem até 30 mil: nenhuma acima", () => {
    const r = filtrarPorExigencias(ESTOQUE, ["quilometragem"], [], { quilometragem: { max: 30000 } }, 30);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((m) => Number(m.valores?.quilometragem) <= 30000)).toBe(true);
  });

  it("combinado Honda + vermelha + até 20 mil (AND)", () => {
    const r = filtrarPorExigencias(
      ESTOQUE,
      ["marca", "cor", "preco"],
      [],
      { marca: ["HONDA"], cor: ["Vermelho"], preco: { max: 20000 } },
      30,
    );
    expect(nomes(r)).toEqual(["HONDA CG 160 FAN 2022"]);
  });

  it("combinado 160 + vermelha (AND)", () => {
    const r = filtrarPorExigencias(
      ESTOQUE,
      ["cilindrada", "cor"],
      [],
      { cilindrada: { min: 126, max: 160 }, cor: ["Vermelho"] },
      30,
    );
    expect(r.length).toBe(4); // CG, NMax, Factor150, ADV160
    expect(r.every((m) => String(m.valores?.cor).toLowerCase() === "vermelho")).toBe(true);
  });

  it("margem do ver-mais (160 ±30% = 112–208): 125/150 dentro; 249/293,5 fora", () => {
    const r = filtrarPorExigencias(
      ESTOQUE,
      ["cilindrada"],
      [],
      { cilindrada: { min: 112, max: 208 } },
      30,
    );
    const ns = nomes(r);
    expect(ns).toContain("YAMAHA Factor 125 2015");
    expect(ns).toContain("YAMAHA Factor 150 2018");
    expect(ns).not.toContain("YAMAHA YS Fazer 250 2017");
    expect(ns).not.toContain("HONDA CB 300 F 2022");
  });
});

describe("Fase 4 — modelo citado x cilindrada como filtro", () => {
  it('"CB 250" (modelo) NÃO vira filtro de cc: não puxa 250 de outra marca', () => {
    const r = selecionarPorIntencao({
      termoBase: "CB 250",
      criterios: {},
      intencao: "pedido",
      motoAtual: null,
      candidatos: ESTOQUE,
      mapeamento: MAPEAMENTO,
      filtrarPorComparacao: true,
      nomeiaModelo: true,
      principal: "nome",
      hipoteses: [
        { nome: "HONDA CB 300 F 2022", cilindrada: "293,5", marca: "HONDA", score: 0.9 },
        { nome: "HONDA CB 500 X 2022", cilindrada: "500", marca: "HONDA", score: 0.6 },
      ],
    });
    const ns = nomes(r.motos);
    // A linha do modelo citado não puxa a 250 de OUTRA marca.
    expect(ns).not.toContain("YAMAHA YS Fazer 250 2017");
    expect(ns).not.toContain("YAMAHA XMax 250 2023");
    expect(ns.some((n) => n.includes("CB"))).toBe(true);
  });

  it("1ª principal (maior nota) + cc rígida: a CB 300 NÃO entra no pedido de 160", () => {
    const r = selecionarPorIntencao({
      termoBase: "160 vermelha",
      criterios: {},
      intencao: "pedido",
      motoAtual: null,
      candidatos: ESTOQUE,
      mapeamento: MAPEAMENTO,
      filtrarPorComparacao: true,
      criteriosDinamicos: true,
      exigenciasRigidas: ["cilindrada"],
      exigidos: ["cilindrada", "cor"],
      faixas: { cilindrada: { min: 126, max: 160 }, cor: ["Vermelho"] },
      principal: "cilindrada",
      primeirasSomenteHipoteses: true,
      quantidade: 3,
      hipoteses: [
        { nome: "HONDA CG 160 FAN 2022", cilindrada: "160", marca: "HONDA", cor: "Vermelho", score: 0.92 },
        { nome: "YAMAHA NMax 160 2023", cilindrada: "160", marca: "YAMAHA", cor: "Vermelho", score: 0.9 },
        { nome: "HONDA CB 300 F 2022", cilindrada: "293,5", marca: "HONDA", cor: "Vermelho", score: 0.88 },
        { nome: "YAMAHA Factor 150 2018", cilindrada: "149,3", marca: "YAMAHA", cor: "Vermelho", score: 0.8 },
      ],
    });
    const ns = nomes(r.motos);
    expect(ns).not.toContain("HONDA CB 300 F 2022");
    // Todas as que saírem têm de estar no filtro rígido (vermelhas, 126–160).
    for (const m of r.motos) {
      expect(String(m.valores?.cor).toLowerCase()).toBe("vermelho");
      expect(numeroDaCelula(String(m.valores?.cilindrada))).toBeGreaterThanOrEqual(126);
      expect(numeroDaCelula(String(m.valores?.cilindrada))).toBeLessThanOrEqual(160);
    }
  });
});

describe("Fase 4 — parsing numérico do estoque", () => {
  it("aceita vírgula decimal e separador de milhar", () => {
    expect(numeroDaCelula("293,5")).toBe(293.5);
    expect(numeroDaCelula("149,3")).toBe(149.3);
    expect(parsePreco("17.500,00")).toBe(17500);
    expect(parsePreco("30.000")).toBe(30000);
  });

  it("hipotesesDeMaiorNota mantém só a faixa do topo", () => {
    const top = hipotesesDeMaiorNota([
      { nome: "A", score: 0.9 },
      { nome: "B", score: 0.8 },
      { nome: "C", score: 0.5 },
    ]);
    expect(top.map((h) => h.nome)).toEqual(["A", "B"]);
  });
});
