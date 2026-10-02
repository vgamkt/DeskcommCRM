import { describe, expect, it } from 'vitest';

import {
  MODELOS_DE_JEV,
  PONTOS_COM_JEV,
  PROVEDORES_DE_JEV,
  ehAlvoDeJev,
  ehProvedorDeJev,
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

describe('lista de provedores e modelos Jev', () => {
  it('todo provedor Jev tem ao menos um modelo', () => {
    for (const p of PROVEDORES_DE_JEV) {
      expect(MODELOS_DE_JEV.some((m) => m.provider === p.id)).toBe(true);
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
  it('aceita modelo da família Jev de base conhecida', () => {
    expect(ehAlvoDeJev('opencode', 'jev-1.13-free')).toBe(true);
    expect(ehAlvoDeJev('openrouter', 'typesafe/jev-1.13')).toBe(true);
    expect(ehAlvoDeJev('typesafe', 'jev-latest')).toBe(true);
  });

  it('aceita modelo nulo (usa o padrão da base)', () => {
    expect(ehAlvoDeJev('typesafe', null)).toBe(true);
    expect(ehAlvoDeJev('opencode', undefined)).toBe(true);
  });

  it('recusa modelo de chat e provedor sem base Jev', () => {
    expect(ehAlvoDeJev('openrouter', 'openai/gpt-4o-mini')).toBe(false);
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
