import { describe, expect, it } from 'vitest';

import {
  filtrarMaisEmConta,
  incluirComparacao,
  pedeComparacao,
  pedeMaisEmConta,
} from './ajuste-da-apresentacao';

const moto = (nome: string, preco: string) => ({ nome, preco, fotos: ['x'] });

const NMAX = moto('YAMAHA NMax 160 ABS', '18990.00');
const CBX = moto('HONDA CBX 250 Twister', '9990.00');
const CG = moto('HONDA CG 160 FAN FLEX ONE', '17500.00');
const VSTROM = moto('SUZUKI V-Strom DL 1000', '58000.00');
const CB650 = moto('HONDA CB 650 F', '41000.00');

describe('pedeMaisEmConta', () => {
  it('reconhece o pedido explícito quando a JEV atacou preço', () => {
    expect(
      pedeMaisEmConta('Achei um pouco salgada. Tem alguma opção parecida mais em conta?', 'preco'),
    ).toBe(true);
    expect(pedeMaisEmConta('tem uma mais barata?', 'preco')).toBe(true);
  });

  it('não reordena por preço quando não é pedido de mais em conta', () => {
    expect(pedeMaisEmConta('queria ver a NMax de novo', 'preco')).toBe(false);
    expect(pedeMaisEmConta('achei caro', 'km')).toBe(false);
  });
});

describe('filtrarMaisEmConta', () => {
  it('mostra só as mais baratas que a referência, em ordem crescente', () => {
    const r = filtrarMaisEmConta([VSTROM, CB650, CBX], [CG], NMAX, 5);
    expect(r.map((m) => m.nome)).toEqual([CBX.nome, CG.nome]);
  });

  it('sem nenhuma mais em conta, devolve vazio (o chamador mantém a seleção)', () => {
    expect(filtrarMaisEmConta([VSTROM, CB650], [], NMAX, 5)).toEqual([]);
  });

  it('sem referência, ordena pelo menor preço do pool', () => {
    const r = filtrarMaisEmConta([CB650, CBX, CG], [], null, 2);
    expect(r.map((m) => m.nome)).toEqual([CBX.nome, CG.nome]);
  });
});

describe('comparação de duas motos', () => {
  it('inclui a outra moto já vista quando a seleção tem uma só', () => {
    const r = incluirComparacao([NMAX], [CG, NMAX], 'queria ver a NMax. Vocês têm as duas pra comparar?');
    expect(r.map((m) => m.nome)).toEqual([NMAX.nome, CG.nome]);
  });

  it('prefere a moto de interesse registrada (custom_fields) à varredura', () => {
    const CBX_ANTIGA = moto('HONDA CBX 250 Twister', '9990.00');
    const r = incluirComparacao(
      [NMAX],
      [CBX_ANTIGA, NMAX],
      'quero comparar as duas',
      CG,
    );
    expect(r.map((m) => m.nome)).toEqual([NMAX.nome, CG.nome]);
  });

  it('não mexe quando não é comparação', () => {
    const r = incluirComparacao([NMAX], [CG, NMAX], 'quero ver a NMax');
    expect(r.map((m) => m.nome)).toEqual([NMAX.nome]);
  });

  it('pedeComparacao entende "as duas" e "lado a lado"', () => {
    expect(pedeComparacao('quero comparar as duas')).toBe(true);
    expect(pedeComparacao('coloca lado a lado')).toBe(true);
    expect(pedeComparacao('me mostra a Biz')).toBe(false);
  });
});
