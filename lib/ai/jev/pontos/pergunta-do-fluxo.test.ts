import { describe, expect, it } from 'vitest';

import { perguntaDaPerguntaDoFluxoJev, vereditoDePerguntaDoFluxoDaJev } from './pergunta-do-fluxo';

describe('vereditoDePerguntaDoFluxoDaJev', () => {
  it("choice 'agora' → perguntarAgora true", () => {
    expect(
      vereditoDePerguntaDoFluxoDaJev({
        pergunta_do_fluxo: { type: 'choice', choice: 'agora', confidence: 0.9, probabilities: {} },
      }),
    ).toEqual({ perguntarAgora: true });
  });
  it("choice 'esperar' → perguntarAgora false", () => {
    expect(
      vereditoDePerguntaDoFluxoDaJev({
        pergunta_do_fluxo: { type: 'choice', choice: 'esperar', confidence: 0.9, probabilities: {} },
      }),
    ).toEqual({ perguntarAgora: false });
  });
  it('resposta ausente/ambígua → fail-safe: PERGUNTAR', () => {
    expect(vereditoDePerguntaDoFluxoDaJev({})).toEqual({ perguntarAgora: true });
    expect(
      vereditoDePerguntaDoFluxoDaJev({
        pergunta_do_fluxo: { type: 'score', score: 0.5, confidence: 1 },
      }),
    ).toEqual({ perguntarAgora: true });
  });
});

describe('perguntaDaPerguntaDoFluxoJev', () => {
  it('monta choice com agora/esperar e cita a pergunta + a fala do cliente', () => {
    const q = perguntaDaPerguntaDoFluxoJev('De qual cidade você fala?', 'achei caro');
    expect(q.pergunta_do_fluxo?.type).toBe('choice');
    expect(Object.keys(q.pergunta_do_fluxo?.criteria ?? {})).toEqual(['agora', 'esperar']);
    expect(q.pergunta_do_fluxo?.instructions).toContain('De qual cidade você fala?');
    expect(q.pergunta_do_fluxo?.instructions).toContain('achei caro');
  });

  it('traz o contexto de OBJEÇÃO/negociação (Escopo 6 — contexto, não gate)', () => {
    const q = perguntaDaPerguntaDoFluxoJev('De qual cidade você fala?', 'achei caro', true);
    expect(q.pergunta_do_fluxo?.instructions).toContain('OBJEÇÃO/negociação de preço agora=true');
  });
});
