import { describe, expect, it } from 'vitest';

import { buildFlowIntentPrompt, parseFlowIntents, type FluxoParaIA } from './flow-intent';

const FLUXOS: FluxoParaIA[] = [
  { id: 'f1', nome: 'Qualificação', gatilhos: ['quero comprar', 'tenho interesse'] },
  { id: 'f2', nome: 'Financiamento', gatilhos: ['financiar', 'parcelar'] },
  { id: 'f3', nome: 'Troca', gatilhos: ['moto na troca'] },
];

describe('buildFlowIntentPrompt (multi-fluxo por intenção)', () => {
  it('lista os fluxos com nome e exemplos e pede JSON com lista de fluxos', () => {
    const p = buildFlowIntentPrompt(FLUXOS, 'quero financiar');
    expect(p).toContain('Qualificação');
    expect(p).toContain('Financiamento');
    expect(p).toContain('exemplos: financiar, parcelar');
    expect(p).toContain('"fluxos"');
    expect(p).toContain('quero financiar');
  });

  it('explica que catálogo/informação e objeção de preço → lista vazia', () => {
    const p = buildFlowIntentPrompt(FLUXOS, 'quero uma moto até 20 mil');
    expect(p).toMatch(/lista VAZIA/i);
    expect(p).toMatch(/objeção|objeç/i);
  });

  it('ensina o exemplo de SEQUÊNCIA (troca + financiar)', () => {
    const p = buildFlowIntentPrompt(FLUXOS, 'quero dar minha moto na troca e financiar o resto');
    expect(p).toMatch(/Troca.*Financiamento|Financiamento.*Troca/);
  });
});

describe('parseFlowIntents', () => {
  it('devolve os fluxos na ordem da resposta', () => {
    expect(parseFlowIntents('{"fluxos":["Troca","Financiamento"]}', FLUXOS).map((f) => f.id)).toEqual([
      'f3',
      'f2',
    ]);
  });

  it('lista vazia vira [] (nenhum fluxo)', () => {
    expect(parseFlowIntents('{"fluxos":[]}', FLUXOS)).toEqual([]);
  });

  it('aceita o formato antigo {"fluxo":"..."} por compatibilidade', () => {
    expect(parseFlowIntents('{"fluxo":"Financiamento"}', FLUXOS).map((f) => f.id)).toEqual(['f2']);
  });

  it('nome fora da lista é ignorado (nunca chuta)', () => {
    expect(parseFlowIntents('{"fluxos":["Inventado"]}', FLUXOS)).toEqual([]);
  });

  it('tolera prosa/cerca em volta do JSON', () => {
    expect(
      parseFlowIntents('claro: ```json\n{"fluxos":["Troca"]}\n```', FLUXOS).map((f) => f.nome),
    ).toEqual(['Troca']);
  });

  it('nunca lança com saída inválida', () => {
    expect(parseFlowIntents('sem json', FLUXOS)).toEqual([]);
    expect(parseFlowIntents('{quebrado', FLUXOS)).toEqual([]);
    expect(parseFlowIntents('{"fluxos": 123}', FLUXOS)).toEqual([]);
  });
});
