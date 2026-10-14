/**
 * G3.10 — "e uma <modelo>?" é PEDIDO DE CATÁLOGO.
 *
 * ANTES (caracterização, 2026-10-12): "e uma lander?" era NEGADO tanto pela Jev
 * (`jev_negou` no log do turno real) quanto pela régua (`podeOferecerMotos` →
 * `sem_pedido_do_cliente`), porque "lander" NÃO está em `TERMO_DE_MOTO` e o
 * formato "e uma X?" não é reconhecido. Resultado: o bot prometeu opções e não
 * mostrou nenhuma.
 */
import { describe, expect, it } from 'vitest';

import { mencionaMoto } from './selecao-por-intencao';
import { pedidoDeCatalogoInequivoco, podeOferecerMotos } from './pode-oferecer-motos';

const base = {
  temEscolhaTravada: false,
  temMotoEmFoco: true,
  estadoObjecaoAnterior: null,
  pediuOutraMoto: false,
  confirmouVerOpcoes: false,
} as const;

describe('ANTES — "e uma lander?" (o comportamento de hoje)', () => {
  it('DEPOIS da correção, "lander" PASSOU a ser termo de moto (era o furo)', () => {
    expect(mencionaMoto('e uma lander?')).toBe(true);
  });
  it('a régua sozinha ainda nega com moto em foco — é a REDE que cobre', () => {
    const d = podeOferecerMotos({ mensagem: 'e uma lander?', ...base });
    expect(d.pode).toBe(false);
    expect(d.motivo).toBe('sem_pedido_do_cliente');
  });
});

describe('DEPOIS — pedidoDeCatalogoInequivoco (a rede de proteção)', () => {
  it('"lander" agora É termo de moto', () => {
    expect(mencionaMoto('e uma lander?')).toBe(true);
  });
  it('"e uma lander?" → FORÇA a oferta (cliente_citou_modelo)', () => {
    expect(pedidoDeCatalogoInequivoco('e uma lander?')).toMatchObject({
      pode: true,
      motivo: 'cliente_citou_modelo',
    });
  });
  it('"tem uma XRE?" → FORÇA', () => {
    expect(pedidoDeCatalogoInequivoco('tem uma XRE?')?.pode).toBe(true);
  });
  it('"tem outras opcoes?" → FORÇA (mais opções)', () => {
    expect(pedidoDeCatalogoInequivoco('tem outras opcoes?')?.motivo).toBe('cliente_pediu_mais_opcoes');
  });
  it('"tem outra?" → FORÇA (moto diferente)', () => {
    expect(pedidoDeCatalogoInequivoco('tem outra?')?.motivo).toBe('cliente_pediu_diferente');
  });
  it('VALIDAÇÃO de moto já em foco → NÃO força ("essa presta pra rodar todo dia?")', () => {
    expect(
      pedidoDeCatalogoInequivoco('essa moto presta pra rodar todo dia?', { nomeMotoEmFoco: 'CG 160 Fan' }),
    ).toBeNull();
  });
  it('citar SÓ a moto que já está em foco → NÃO força', () => {
    expect(pedidoDeCatalogoInequivoco('e a CG 160 Fan?', { nomeMotoEmFoco: 'CG 160 Fan' })).toBeNull();
  });
  it('processo (financiar/trocar) → NÃO força', () => {
    expect(pedidoDeCatalogoInequivoco('quero financiar uma moto')).toBeNull();
    expect(pedidoDeCatalogoInequivoco('quero dar minha moto na troca')).toBeNull();
  });
  it('dado/flow (sem termo de moto) → NÃO força', () => {
    expect(pedidoDeCatalogoInequivoco('meu cpf e 123.456.789-09')).toBeNull();
    expect(pedidoDeCatalogoInequivoco('moro em Campinas')).toBeNull();
  });
  it('cliente descrevendo a PRÓPRIA moto (troca) → NÃO força (era falso-positivo)', () => {
    expect(pedidoDeCatalogoInequivoco('minha moto e uma CG 150 2012 com 40000 km')).toBeNull();
    expect(pedidoDeCatalogoInequivoco('a minha moto e uma honda biz')).toBeNull();
  });
});

describe('G3.11 — FAIXA DE PREÇO sozinha é pedido de catálogo', () => {
  it('DEPOIS: "ate 15 mil" FORÇA a oferta (o furo: não forçava — conversa C3)', () => {
    expect(pedidoDeCatalogoInequivoco('ate 15 mil')).toMatchObject({ pode: true, motivo: 'cliente_citou_faixa' });
  });
  it('outras formas de faixa também forçam', () => {
    for (const m of ['no maximo 15 mil', 'ate 20000', 'entre 10 e 15 mil', 'uns 12 mil', 'quero gastar ate 18 mil']) {
      expect(pedidoDeCatalogoInequivoco(m)?.pode, m).toBe(true);
    }
  });
  it('NÃO força quando é PROCESSO com valor (financiar/trocar)', () => {
    expect(pedidoDeCatalogoInequivoco('quero financiar 15 mil')).toBeNull();
  });
  it('NÃO força em dado sem relação (cpf, cidade)', () => {
    expect(pedidoDeCatalogoInequivoco('meu cpf e 123.456.789-09')).toBeNull();
  });
});

describe('A1 — TERMO_DE_MOTO sem termos GENÉRICOS (2026-10-13)', () => {
  it('"CNH categoria A" NÃO é termo de moto (era falso-positivo medido ao vivo)', () => {
    expect(mencionaMoto('Tenho sim, CNH categoria A.')).toBe(false);
    expect(mencionaMoto('CNH categoria A')).toBe(false);
    expect(pedidoDeCatalogoInequivoco('Tenho sim, CNH categoria A.')).toBeNull();
  });
  it('termos CONCRETOS seguem valendo (categoria de moto, marca, modelo, produto)', () => {
    expect(mencionaMoto('quero uma naked')).toBe(true);
    expect(mencionaMoto('tem uma moto 250cc?')).toBe(true);
    expect(mencionaMoto('gostaria de ver modelos')).toBe(true);
    expect(pedidoDeCatalogoInequivoco('e uma lander?')?.pode).toBe(true);
    expect(pedidoDeCatalogoInequivoco('tem uma XRE?')?.pode).toBe(true);
  });
});

describe('A2 — guarda de foco no `pedeMotoExplicito` (2026-10-13)', () => {
  const FOCO = { nomeMotoEmFoco: 'YAMAHA Factor 150 ED' };
  it('falar da moto JÁ EM FOCO (ver/agendar) NÃO força oferta', () => {
    expect(
      pedidoDeCatalogoInequivoco(
        'Gostei da Factor 150 vermelha, tá no meu orçamento. Consigo ir aí amanhã pra ver ela de perto?',
        FOCO,
      ),
    ).toBeNull();
    expect(
      pedidoDeCatalogoInequivoco(
        'Pode confirmar um horário pra eu ver a Factor vermelha?',
        FOCO,
      ),
    ).toBeNull();
  });
  it('pedir uma moto DIFERENTE (nº ≠ do foco) segue forçando', () => {
    expect(
      pedidoDeCatalogoInequivoco('tem uma CB 300?', { nomeMotoEmFoco: 'HONDA CB 160 Fan' })?.motivo,
    ).toBe('cliente_pediu_catalogo');
    expect(
      pedidoDeCatalogoInequivoco('e uma lander?', { nomeMotoEmFoco: 'HONDA CB 160 Fan' })?.motivo,
    ).toBe('cliente_citou_modelo');
  });
  it('pedido EXPLÍCITO de mais opções segue forçando mesmo com foco', () => {
    expect(pedidoDeCatalogoInequivoco('quero ver mais opções', FOCO)?.motivo).toBe(
      'cliente_pediu_mais_opcoes',
    );
  });
});
