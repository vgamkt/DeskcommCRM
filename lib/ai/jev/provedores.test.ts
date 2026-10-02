import { describe, expect, it } from 'vitest';

import {
  PONTOS_COM_JEV,
  PROVEDORES_DE_JEV,
  ehAlvoDeJev,
  ehProvedorDeJev,
  modeloPadraoDeJev,
  pontoDeJev,
  purposeDeJev,
} from './provedores';

describe('purposeDeJev / pontoDeJev', () => {
  it('adiciona e remove o sufixo (idempotente)', () => {
    expect(purposeDeJev('catalog_criteria')).toBe('catalog_criteria__jev');
    expect(purposeDeJev('catalog_criteria__jev')).toBe('catalog_criteria__jev');
    expect(pontoDeJev('catalog_criteria__jev')).toBe('catalog_criteria');
    expect(pontoDeJev('catalog_criteria')).toBe('catalog_criteria');
  });
});

describe('lista de provedores Jev', () => {
  it('toda base conhecida tem um modelo padrão (sem afinação)', () => {
    for (const p of PROVEDORES_DE_JEV) {
      expect(modeloPadraoDeJev(p.id)).not.toBe('');
    }
  });

  it('ehProvedorDeJev reconhece a lista', () => {
    expect(ehProvedorDeJev('typesafe')).toBe(true);
    expect(ehProvedorDeJev('opencode')).toBe(true);
    expect(ehProvedorDeJev('openrouter')).toBe(true);
    expect(ehProvedorDeJev('anthropic')).toBe(false);
  });
});

describe('ehAlvoDeJev', () => {
  it('base conhecida vale independente do nome do modelo (sem afinação)', () => {
    expect(ehAlvoDeJev('typesafe', 'jev-latest')).toBe(true);
    expect(ehAlvoDeJev('opencode', 'jev-1.13-free')).toBe(true);
    expect(ehAlvoDeJev('openrouter', 'typesafe/jev-1.13')).toBe(true);
    // O binding __jev declara a intenção; o modelo é escolha do operador.
    expect(ehAlvoDeJev('openrouter', 'openai/gpt-4o-mini')).toBe(true);
  });

  it('provedor DESCONHECIDO vale quando informa a URL do systemone', () => {
    expect(ehAlvoDeJev('meu-provedor', 'qualquer', 'https://api.x.com/v1/systemone')).toBe(true);
    expect(ehAlvoDeJev('meu-provedor', 'qualquer')).toBe(false);
    expect(ehAlvoDeJev('meu-provedor', 'qualquer', '   ')).toBe(false);
  });

  it('provedor de chat sem base Jev e sem URL não vale', () => {
    expect(ehAlvoDeJev('openai', 'gpt-4o')).toBe(false);
  });
});

describe('PONTOS_COM_JEV', () => {
  it('cobre os pontos integrados hoje', () => {
    for (const p of [
      'stage_classifier',
      'sentiment_classify',
      'flywheel_judge',
      'catalog_criteria',
      'flow_intent',
      'intent_router',
    ]) {
      expect(PONTOS_COM_JEV.has(p)).toBe(true);
    }
  });
});
