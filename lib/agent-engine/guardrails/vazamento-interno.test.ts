import { describe, expect, it } from 'vitest';

import { detectarVazamentoInterno } from './vazamento-interno';

/**
 * Decisão do dono 2026-10-09: "o sistema" (a máquina falando de si) é vazamento
 * de vocabulário de operação. Medido: "é só responder o que o sistema te perguntar".
 * O FALSO-POSITIVO a evitar é o "sistema" da MOTO (freios/injeção/ABS).
 */
describe('vazamento-interno — "o sistema" (operação)', () => {
  it('barra "o sistema te pergunta" (a máquina falando de si)', () => {
    expect(detectarVazamentoInterno('é só responder o que o sistema te perguntar').achou).toBe(true);
    expect(detectarVazamentoInterno('o sistema vai te mandar uma mensagem').achou).toBe(true);
    expect(detectarVazamentoInterno('já registrei no sistema').achou).toBe(true);
  });

  it('NÃO barra o "sistema" da moto (freios/injeção/ABS)', () => {
    expect(
      detectarVazamentoInterno('essa moto tem sistema de freios ABS e sistema de injeção eletrônica').achou,
    ).toBe(false);
  });
});
