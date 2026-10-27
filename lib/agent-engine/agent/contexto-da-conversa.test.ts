import { describe, expect, it } from 'vitest';

import {
  JANELA_DA_CONVERSA,
  montarContextoDaConversa,
  type EstadoDaConversa,
} from './contexto-da-conversa';

const estado: EstadoDaConversa = {
  orcamento: 15000,
  escolhida: null,
  referencia: null,
  motosMostradas: [],
  fila: [],
  objecao: null,
  formaDePagamentoPerguntada: false,
  usoCategoria: 'cidade',
  cambioPedido: 'automatico',
};

const m = (direction: 'inbound' | 'outbound', body: string) => ({ direction, body });

describe('montarContextoDaConversa', () => {
  it('marca respondida = existe outbound depois; rajada = inbounds após o último outbound', () => {
    const ctx = montarContextoDaConversa({
      mensagens: [
        m('inbound', 'oi'),
        m('outbound', 'olá'),
        m('inbound', 'A'),
        m('outbound', 'B'),
        m('inbound', 'C'),
        m('inbound', 'D'),
      ],
      estado,
    });
    expect(ctx.mensagens.map((x) => x.respondida)).toEqual([true, true, true, true, false, false]);
    expect(ctx.rajada).toEqual(['C', 'D']);
  });

  it('a última mensagem JÁ respondida não entra na rajada (caso do handoff)', () => {
    const ctx = montarContextoDaConversa({
      mensagens: [m('inbound', 'quero humano'), m('outbound', 'já vou passar'), m('inbound', 'ok'), m('outbound', 'feito')],
      estado,
    });
    expect(ctx.rajada).toEqual([]);
    expect(ctx.mensagens.find((x) => x.texto === 'ok')?.respondida).toBe(true);
  });

  it('sem outbound, toda a rajada é pendente', () => {
    const ctx = montarContextoDaConversa({
      mensagens: [m('inbound', 'oi'), m('inbound', 'tem moto?')],
      estado,
    });
    expect(ctx.mensagens.every((x) => x.respondida === false)).toBe(true);
    expect(ctx.rajada).toEqual(['oi', 'tem moto?']);
  });

  it('aplica a janela de 30 (só as últimas 30 entram)', () => {
    const mensagens = Array.from({ length: 40 }, (_, i) =>
      m(i % 2 === 0 ? 'inbound' : 'outbound', `m${i}`),
    );
    const ctx = montarContextoDaConversa({ mensagens, estado });
    expect(ctx.mensagens).toHaveLength(JANELA_DA_CONVERSA);
    expect(ctx.mensagens[0]!.texto).toBe('m10');
  });

  it('filtra mídia sem texto da rajada e preserva o estado/catálogo', () => {
    const ctx = montarContextoDaConversa({
      mensagens: [m('outbound', 'oi'), m('inbound', ''), m('inbound', 'texto')],
      estado,
      catalogo: [{ nome: 'X', fotos: ['u'] }],
    });
    expect(ctx.rajada).toEqual(['texto']);
    expect(ctx.estado.orcamento).toBe(15000);
    expect(ctx.catalogo).toHaveLength(1);
  });
});
