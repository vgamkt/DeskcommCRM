import { describe, expect, it } from 'vitest';

import { buildFlowIntentPrompt, parseFlowIntent, type FluxoParaIA } from './flow-intent';

const FLUXOS: FluxoParaIA[] = [
  { id: 'f1', nome: 'Qualificação', gatilhos: ['quero comprar', 'tenho interesse'] },
  { id: 'f2', nome: 'Financiamento', gatilhos: ['financiar', 'parcelar'] },
  { id: 'f3', nome: 'Troca', gatilhos: ['moto na troca'] },
];

describe('buildFlowIntentPrompt (C-108)', () => {
  it('lista os fluxos com nome e exemplos e pede JSON com "none"', () => {
    const p = buildFlowIntentPrompt(FLUXOS, 'quero financiar');
    expect(p).toContain('Qualificação');
    expect(p).toContain('Financiamento');
    expect(p).toContain('exemplos: financiar, parcelar');
    expect(p).toContain('"none"');
    expect(p).toContain('quero financiar');
  });

  it('explica que consulta de catálogo / pedido de informação NÃO inicia fluxo', () => {
    const p = buildFlowIntentPrompt(FLUXOS, 'quero uma moto até 20 mil');
    expect(p).toMatch(/catálogo/i);
    expect(p).toMatch(/informa/i); // "mais informações" = catálogo
  });

  it('manda iniciar a QUALIFICAÇÃO quando o cliente ESCOLHE uma moto', () => {
    const p = buildFlowIntentPrompt(FLUXOS, 'gostei dessa');
    expect(p).toMatch(/escolha/i);
    expect(p).toContain('Qualificação');
    expect(p).toMatch(/gostei dessa/);
  });
});

describe('parseFlowIntent', () => {
  it('casa o nome exato do fluxo', () => {
    expect(parseFlowIntent('{"fluxo":"Financiamento"}', FLUXOS)?.id).toBe('f2');
  });

  it('"none" vira null', () => {
    expect(parseFlowIntent('{"fluxo":"none"}', FLUXOS)).toBeNull();
    expect(parseFlowIntent('{"fluxo":"None"}', FLUXOS)).toBeNull();
  });

  it('nome fora da lista vira null (nunca chuta)', () => {
    expect(parseFlowIntent('{"fluxo":"Inventado"}', FLUXOS)).toBeNull();
  });

  it('tolera prosa/cerca em volta do JSON', () => {
    expect(parseFlowIntent('claro: ```json\n{"fluxo":"Troca"}\n```', FLUXOS)?.nome).toBe('Troca');
  });

  it('nunca lança com saída inválida', () => {
    expect(parseFlowIntent('sem json', FLUXOS)).toBeNull();
    expect(parseFlowIntent('{quebrado', FLUXOS)).toBeNull();
    expect(parseFlowIntent('{"fluxo": 123}', FLUXOS)).toBeNull();
  });
});
