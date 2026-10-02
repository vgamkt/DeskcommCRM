import { describe, expect, it } from 'vitest';

import {
  buildCriteriosPrompt,
  criteriosVazios,
  extrairCriterios,
  parseCriterios,
} from './extrair-criterios';
import type { MotoDoCatalogo } from './fotos-do-catalogo';

// Este arquivo exercita o extrator de CHAT. O `.env` da instalação (produção)
// pode trazer `JEV_ENABLED=1`, que faria `extrairCriterios` tentar a Jev ANTES —
// então garantimos a Jev desligada aqui, para o teste medir o que ele monta.
delete process.env.JEV_ENABLED;

describe('buildCriteriosPrompt', () => {
  it('lista as colunas e os valores possíveis', () => {
    const p = buildCriteriosPrompt('quero uma CB 300', ['marca', 'categoria', 'cilindrada'], {
      categoria: ['Naked', 'Street', 'Adventure / Trilha'],
    });
    expect(p).toContain('marca');
    expect(p).toContain('categoria (valores possíveis: Naked, Street, Adventure / Trilha)');
    expect(p).toContain('quero uma CB 300');
    expect(p).toContain('EXEMPLO de resposta');
    expect(p).toContain('SOMENTE o JSON');
  });

  it('inclui o ESTOQUE real no prompt (a IA escolhe entre as motos do dono)', () => {
    const estoque: MotoDoCatalogo[] = [
      {
        nome: 'HONDA CB 300 F Twister',
        fotos: [],
        valores: { nome: 'CB 300', marca: 'HONDA', categoria: 'Street', cilindrada: '293.5 cc' },
      },
      {
        nome: 'YAMAHA Factor 125',
        fotos: [],
        valores: { nome: 'Factor 125', marca: 'YAMAHA', categoria: 'Street', cilindrada: '124 cc' },
      },
    ];
    const p = buildCriteriosPrompt('quero uma cb 50', ['nome', 'marca', 'cilindrada'], undefined, estoque);
    expect(p).toContain('ESTOQUE DISPONÍVEL');
    expect(p).toContain('HONDA CB 300 F Twister');
    expect(p).toContain('YAMAHA Factor 125');
    expect(p).toContain('marca: HONDA');
    // O formato novo pede hipóteses + faixas.
    expect(p).toContain('hipoteses');
    expect(p).toContain('faixas');
  });
});

describe('parseCriterios', () => {
  const COLS = ['nome', 'marca', 'categoria', 'cilindrada', 'preco'];

  it('lê a intenção e os critérios, filtrando colunas não permitidas', () => {
    const r = parseCriterios(
      'claro: {"intencao":"pedido","criterios":{"categoria":"Naked","marca":"Yamaha","id":"9"}}',
      COLS,
    );
    expect(r.intencao).toBe('pedido');
    expect(r.criterios).toEqual({ categoria: 'Naked', marca: 'Yamaha' });
  });

  it('reconhece "alternativa" e aceita número', () => {
    const r = parseCriterios('{"intencao":"alternativa","criterios":{"cilindrada":300}}', COLS);
    expect(r.intencao).toBe('alternativa');
    expect(r.criterios).toEqual({ cilindrada: '300' });
  });

  it('lê o formato NOVO: hipóteses + faixas + principal', () => {
    const r = parseCriterios(
      JSON.stringify({
        intencao: 'pedido',
        principal: 'cilindrada',
        hipoteses: [
          { nome: 'CB 250', marca: 'HONDA', cilindrada: '250' },
          { nome: 'CB 300', marca: 'HONDA', cilindrada: '293.5' },
        ],
        faixas: { cilindrada: { min: 125, max: 300 }, preco: { min: 9000, max: 20000 } },
      }),
      COLS,
    );
    expect(r.intencao).toBe('pedido');
    expect(r.hipoteses).toHaveLength(2);
    expect(r.hipoteses[0]).toMatchObject({ nome: 'CB 250', marca: 'HONDA' });
    expect(r.faixas.cilindrada).toEqual({ min: 125, max: 300 });
    expect(r.faixas.preco).toEqual({ min: 9000, max: 20000 });
    expect(r.principal).toBe('cilindrada');
  });

  it('ignora hipóteses com colunas não permitidas', () => {
    const r = parseCriterios(
      '{"hipoteses":[{"nome":"CB 250","secreto":"x"}],"faixas":{"secreto":{"min":1}}}',
      COLS,
    );
    expect(r.hipoteses).toEqual([{ nome: 'CB 250' }]);
    expect(r.faixas).toEqual({});
  });

  it('normaliza faixa numérica simples para {min,max} iguais', () => {
    const r = parseCriterios('{"faixas":{"cilindrada":250}}', COLS);
    expect(r.faixas.cilindrada).toEqual({ min: 250, max: 250 });
  });

  it('nunca lança: saída inesperada vira o formato vazio', () => {
    expect(parseCriterios('sem json', COLS)).toEqual(criteriosVazios());
    expect(parseCriterios('{"criterios": {"categoria": ""}}', COLS).criterios).toEqual({});
    expect(parseCriterios('{"hipoteses": "x", "faixas": 3}', COLS)).toEqual(criteriosVazios());
  });
});

describe('ANO é proibido para a IA (regra do dono, 2026-09-28)', () => {
  const COLS_COM_ANO = ['nome', 'marca', 'categoria', 'ano', 'cilindrada', 'preco'];

  it('parseCriterios descarta ano de hipóteses, faixas e principal', () => {
    const r = parseCriterios(
      JSON.stringify({
        intencao: 'pedido',
        principal: 'ano',
        hipoteses: [{ nome: 'CB 250', marca: 'HONDA', ano: '2008', cilindrada: '250' }],
        faixas: { ano: { min: 2000, max: 2020 }, cilindrada: { min: 200, max: 300 } },
      }),
      COLS_COM_ANO,
    );
    expect(r.hipoteses).toEqual([{ nome: 'CB 250', marca: 'HONDA', cilindrada: '250' }]);
    expect(r.faixas).toEqual({ cilindrada: { min: 200, max: 300 } });
    expect(r.principal).toBeNull();
  });

  it('bloquearAno=false deixa o ano passar (interruptor do agente desligado)', () => {
    const r = parseCriterios(
      '{"hipoteses":[{"marca":"HONDA","ano":"2008","cilindrada":"250"}],"exigidos":["ano"]}',
      ['marca', 'ano', 'cilindrada'],
      false,
    );
    expect(r.hipoteses).toEqual([{ marca: 'HONDA', ano: '2008', cilindrada: '250' }]);
    expect(r.exigidos).toEqual(['ano']);
  });

  it('lê "exigidos" e ignora colunas não permitidas e ano (C-106)', () => {
    const r = parseCriterios(
      JSON.stringify({ exigidos: ['marca', 'ano', 'secreto', 'cilindrada', 'marca'] }),
      ['marca', 'ano', 'cilindrada'],
    );
    // ano é proibido; secreto não é permitido; duplicata some.
    expect(r.exigidos).toEqual(['marca', 'cilindrada']);
    expect(parseCriterios('{}', ['marca']).exigidos).toEqual([]);
  });

  it('extrairCriterios não oferece ano no prompt e descarta o que o modelo devolver', async () => {
    let promptVisto = '';
    const fake = async (...args: unknown[]) => {
      const req = args[2] as { messages: { content: string }[] };
      promptVisto = req.messages[0]!.content;
      return {
        result: {
          text: '{"intencao":"pedido","hipoteses":[{"nome":"CB 250","ano":"2008"}],"faixas":{"ano":{"min":2000,"max":2010}}}',
        },
      };
    };
    const r = await extrairCriterios(
      {} as never,
      {} as never,
      {
        tenantId: 't',
        leadId: null,
        jobId: null,
        model: 'm',
        mensagem: 'quero uma cb 250',
        colunas: COLS_COM_ANO,
      },
      { log: { warn: () => {} } as never, runModelCall: fake as never },
    );
    // A coluna `ano` não é oferecida na lista de critério…
    expect(promptVisto).not.toMatch(/^- ano\b/m);
    // …e, mesmo devolvida, é descartada.
    expect(r.hipoteses).toEqual([{ nome: 'CB 250' }]);
    expect(r.faixas).toEqual({});
  });
});
