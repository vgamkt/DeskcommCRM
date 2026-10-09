import { describe, expect, it } from 'vitest';

import {
  PROMESSA_NAO,
  PROMESSA_SIM,
  ehPromessa,
  perguntaDePromessaJev,
  promessaDaRespostaDeJev,
} from './promessa';
import type { RespostasDeJev } from '../tipos';

describe('promise_semantic Jev', () => {
  it('pergunta choice com as duas opções', () => {
    const q = perguntaDePromessaJev();
    const crit = (q.promessa as { criteria: Record<string, string> }).criteria;
    expect(crit[PROMESSA_SIM]).toBeDefined();
    expect(crit[PROMESSA_NAO]).toBeDefined();
  });

  it('instrui que REPASSAR fato/política da loja (ex.: garantia) NÃO é promessa (2026-10-09)', () => {
    const instr = (perguntaDePromessaJev().promessa as { instructions: string }).instructions;
    expect(instr).toMatch(/FATO\/POL[IÍ]TICA/);
    expect(instr).toMatch(/90 dias de garantia/);
    expect(instr).toMatch(/sem_promessa/);
  });

  it('mapeia a escolha para o veredito binário', () => {
    const sim: RespostasDeJev = {
      promessa: { type: 'choice', choice: PROMESSA_SIM, confidence: 1, probabilities: {} },
    };
    const nao: RespostasDeJev = {
      promessa: { type: 'choice', choice: PROMESSA_NAO, confidence: 1, probabilities: {} },
    };
    expect(ehPromessa(sim)).toBe(true);
    expect(ehPromessa(nao)).toBe(false);
    expect(promessaDaRespostaDeJev(sim)).toEqual({ isPromise: true, suspectPhrase: null });
  });
});
