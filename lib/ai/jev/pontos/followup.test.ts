import { describe, expect, it } from 'vitest';

import {
  classeDeFollowupDaJev,
  perguntaDeClasseDeFollowupJev,
  perguntasDeTimingDeJev,
  timingDaJev,
  type EsperaParaJev,
} from './followup';
import type { RespostasDeJev } from '../tipos';

describe('followup_classify Jev', () => {
  const classes = ['accepted', 'declined', 'later'];

  it('choice com as classes; lê a escolhida', () => {
    const q = perguntaDeClasseDeFollowupJev(classes);
    expect((q.classe as { criteria: Record<string, string> }).criteria['accepted']).toBeDefined();
    const r: RespostasDeJev = {
      classe: { type: 'choice', choice: 'declined', confidence: 1, probabilities: {} },
    };
    expect(classeDeFollowupDaJev(r, classes)).toBe('declined');
  });

  it('classe fora da lista → null', () => {
    const r: RespostasDeJev = {
      classe: { type: 'choice', choice: 'outra', confidence: 1, probabilities: {} },
    };
    expect(classeDeFollowupDaJev(r, classes)).toBeNull();
  });
});

describe('followup_decide_timing Jev', () => {
  const esperas: EsperaParaJev[] = [
    { node_id: 'n1', label: 'primeira', min_ms: 1000, max_ms: 5000 },
    { node_id: 'n2', label: 'segunda', min_ms: 2000, max_ms: 10000 },
  ];

  it('score 0 → piso, score 3 → teto, e o meio interpola', () => {
    const r: RespostasDeJev = {
      espera_0: { type: 'score', score: 0, confidence: 1 },
      espera_1: { type: 'score', score: 3, confidence: 1 },
    };
    expect(timingDaJev(r, esperas)).toEqual([
      { node_id: 'n1', aguardar_ms: 1000 },
      { node_id: 'n2', aguardar_ms: 10000 },
    ]);
  });

  it('score 1.5 interpola no meio', () => {
    const r: RespostasDeJev = { espera_0: { type: 'score', score: 1.5, confidence: 1 } };
    expect(timingDaJev(r, esperas)[0]).toEqual({ node_id: 'n1', aguardar_ms: 3000 });
  });

  it('cria uma pergunta por espera', () => {
    expect(Object.keys(perguntasDeTimingDeJev(esperas))).toEqual(['espera_0', 'espera_1']);
  });
});
