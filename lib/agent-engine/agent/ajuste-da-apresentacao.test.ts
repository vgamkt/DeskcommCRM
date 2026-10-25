import { describe, expect, it } from 'vitest';

import {
  corpoSemNomesForaDoEnvio,
  cortarAcimaDaReferencia,
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

  it('usa o pool extra (catálogo do turno) para achar as mais baratas', () => {
    const r = filtrarMaisEmConta([VSTROM], [], NMAX, 5, [CB650, CBX, CG]);
    expect(r.map((m) => m.nome)).toEqual([CBX.nome, CG.nome]);
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

describe('fila do ver mais sob objeção de preço', () => {
  it('corta as motos acima da referência (não sobe de preço)', () => {
    const CB300 = moto('HONDA CB 300 R FLEX', '14990.00');
    const r = cortarAcimaDaReferencia([CBX, CG, CB650, VSTROM], CB300, true);
    expect(r.map((m) => m.nome)).toEqual([CBX.nome]);
  });

  it('sem objeção de preço, não corta', () => {
    const r = cortarAcimaDaReferencia([CBX, CB650], CG, false);
    expect(r.map((m) => m.nome)).toEqual([CBX.nome, CB650.nome]);
  });

  it('sem referência, não corta', () => {
    const r = cortarAcimaDaReferencia([CBX, CB650], null, true);
    expect(r).toHaveLength(2);
  });
});

describe('corpo sem nomes fora do envio', () => {
  const FZ = moto('YAMAHA FZ 15 Fazer ABS', '18990.00');
  it('troca lista de motos por abertura neutra (contagem real)', () => {
    const corpo =
      'Separei 5 opções: Motos: - Yamaha FZ 15 Fazer 2024 - R$ 18.990 - Yamaha NMax 160 2023 - Honda Neo 125 2025';
    const r = corpoSemNomesForaDoEnvio(corpo, [FZ, NMAX], 5);
    expect(r).toBe('Separei 5 opções pra você dar uma olhada:');
  });

  it('tira a lista mesmo quando as citadas seriam enviadas (regra: sem nomes no corpo)', () => {
    const corpo = 'Separei essas: Yamaha FZ 15 Fazer ABS e YAMAHA NMax 160 ABS';
    const r = corpoSemNomesForaDoEnvio(corpo, [FZ, NMAX], 2);
    expect(r).toBe('Separei 2 opções pra você dar uma olhada:');
  });

  it('preserva abertura sem nomes/lista de 2+ motos', () => {
    const corpo = 'Separei opções leves e econômicas pra cidade:';
    expect(corpoSemNomesForaDoEnvio(corpo, [FZ, NMAX], 5)).toBe(corpo);
  });

  it('não mexe em apresentação de 1 moto', () => {
    const corpo = 'Olha a NMax 160 ABS:';
    expect(corpoSemNomesForaDoEnvio(corpo, [NMAX], 1)).toBe(corpo);
  });
});
