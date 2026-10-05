import { describe, expect, it } from 'vitest';

import {
  perguntaDeObjecaoJev,
  vereditoDeObjecaoDaJev,
  type ContextoDeObjecao,
} from './objecao';
import type { RespostasDeJev } from '../tipos';

const ctx: ContextoDeObjecao = {
  mensagem: 'achei caro',
  motivoAnterior: null,
  temMotoEmFoco: true,
};

describe('objecao Jev', () => {
  it('cria as perguntas eh_objecao (noul) e motivo (choice)', () => {
    const q = perguntaDeObjecaoJev(ctx);
    expect(q.eh_objecao?.type).toBe('noul');
    expect(q.motivo?.type).toBe('choice');
  });

  it('lê ehObjecao + motivo', () => {
    const r: RespostasDeJev = {
      eh_objecao: { type: 'noul', noul: 0.9 },
      motivo: { type: 'choice', choice: 'preco', confidence: 1, probabilities: {} },
    };
    expect(vereditoDeObjecaoDaJev(r)).toEqual({ ehObjecao: true, motivo: 'preco' });
  });

  it('não objeção → ehObjecao false e motivo null', () => {
    const r: RespostasDeJev = {
      eh_objecao: { type: 'noul', noul: 0.1 },
      motivo: { type: 'choice', choice: 'preco', confidence: 1, probabilities: {} },
    };
    expect(vereditoDeObjecaoDaJev(r)).toEqual({ ehObjecao: false, motivo: null });
  });

  it('objeção sem motivo válido cai em "outro"', () => {
    const r: RespostasDeJev = { eh_objecao: { type: 'noul', noul: 0.8 } };
    expect(vereditoDeObjecaoDaJev(r)).toEqual({ ehObjecao: true, motivo: 'outro' });
  });

  it('resposta vazia não é objeção', () => {
    expect(vereditoDeObjecaoDaJev({})).toEqual({ ehObjecao: false, motivo: null });
  });
});
