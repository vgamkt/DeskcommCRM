import { describe, expect, it } from 'vitest';

import type { CatalogoDaConversa } from './catalogo-da-conversa';
import {
  estadoDaConversaDe,
  montarContextoDoPlano,
} from './plano-de-turno';

const moto = (nome: string) => ({ nome, fotos: ['x'] });

const catalogo: CatalogoDaConversa = {
  motos: [moto('A'), moto('B')],
  detalhadas: ['a'],
  escolhida: moto('A'),
  referencia: moto('B'),
  objecao: { moto: 'a', motivo: 'preco', tentativas: 2 },
  opcoes: { marcas: [], categorias: [], pendentes: [moto('C')] },
  orcamento: 15000,
  pedidosDeOpcoes: 0,
  formaDePagamentoPerguntada: true,
};

describe('estadoDaConversaDe', () => {
  it('mapeia escolhida/referencia/mostradas/fila/objeção/orçamento/câmbio', () => {
    const e = estadoDaConversaDe(catalogo, 15000, 'automatico');
    expect(e).toMatchObject({
      orcamento: 15000,
      escolhida: 'A',
      referencia: 'B',
      motosMostradas: ['A', 'B'],
      fila: ['C'],
      objecao: { motivo: 'preco', tentativas: 2 },
      formaDePagamentoPerguntada: true,
      cambioPedido: 'automatico',
    });
  });
});

describe('montarContextoDoPlano', () => {
  it('junta as mensagens (respondida/rajada) + estado + catálogo', () => {
    const ctx = montarContextoDoPlano({
      mensagens: [
        { direction: 'inbound', body: 'oi' },
        { direction: 'outbound', body: 'olá' },
        { direction: 'inbound', body: 'tem alguma automática até 15 mil?' },
      ],
      catalogoDaConversa: catalogo,
      orcamento: 15000,
      cambioPedido: 'automatico',
      catalogo: catalogo.motos,
    });
    expect(ctx.mensagens.map((m) => m.respondida)).toEqual([true, true, false]);
    expect(ctx.rajada).toEqual(['tem alguma automática até 15 mil?']);
    expect(ctx.estado.orcamento).toBe(15000);
    expect(ctx.catalogo).toHaveLength(2);
  });
});
