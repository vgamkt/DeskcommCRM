import { describe, expect, it } from 'vitest';

import {
  OFERECER_NAO,
  OFERECER_PERGUNTAR,
  OFERECER_SIM,
  perguntaDeOfertaJev,
  vereditoDeOfertaDaJev,
  type ContextoDeOferta,
} from './oferta';
import type { RespostasDeJev } from '../tipos';

const ctx: ContextoDeOferta = {
  mensagem: 'tem uma CB 300?',
  pediuMaisOpcoes: false,
  temEscolhaTravada: false,
  temMotoEmFoco: false,
  pedidoSemCorrespondencia: false,
  clienteConfirmouOpcoes: false,
  motivoObjecaoAnterior: null,
};

describe('offer_motos Jev', () => {
  it('cria oferta + criterio; lê o veredito e o critério', () => {
    const q = perguntaDeOfertaJev(ctx);
    expect(q.oferta?.type).toBe('choice');
    expect(q.criterio?.type).toBe('choice');
    const r: RespostasDeJev = {
      oferta: { type: 'choice', choice: OFERECER_SIM, confidence: 1, probabilities: {} },
      criterio: { type: 'choice', choice: 'preco', confidence: 1, probabilities: {} },
    };
    expect(vereditoDeOfertaDaJev(r)).toEqual({
      oferecer: true,
      perguntar: false,
      criterio: 'preco',
      motivo: 'jev_liberou_preco',
    });
  });

  it('não oferecer → criterio nenhum', () => {
    const r: RespostasDeJev = {
      oferta: { type: 'choice', choice: OFERECER_NAO, confidence: 1, probabilities: {} },
      criterio: { type: 'choice', choice: 'preco', confidence: 1, probabilities: {} },
    };
    expect(vereditoDeOfertaDaJev(r)).toEqual({
      oferecer: false,
      perguntar: false,
      criterio: 'nenhum',
      motivo: 'jev_negou',
    });
  });

  it('pedido VAGO → perguntar (não oferece, não nega)', () => {
    const r: RespostasDeJev = {
      oferta: { type: 'choice', choice: OFERECER_PERGUNTAR, confidence: 1, probabilities: {} },
    };
    expect(vereditoDeOfertaDaJev(r)).toEqual({
      oferecer: false,
      perguntar: true,
      criterio: 'nenhum',
      motivo: 'jev_perguntar',
    });
    // A pergunta da Jev oferece a opção "perguntar".
    expect(perguntaDeOfertaJev(ctx).oferta).toMatchObject({
      criteria: expect.objectContaining({ [OFERECER_PERGUNTAR]: expect.any(String) }),
    });
  });

  it('oferecer sem critério escolhido → nenhum', () => {
    const r: RespostasDeJev = { oferta: { type: 'choice', choice: OFERECER_SIM, confidence: 1, probabilities: {} } };
    expect(vereditoDeOfertaDaJev(r).criterio).toBe('nenhum');
  });
});
