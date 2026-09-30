import { describe, expect, it } from 'vitest';

import {
  ehObjecaoValor,
  ehPedidoDesconto,
  ehPedidoDiferente,
  proximaFase,
  renderBlocoObjecao,
} from './objecao-de-valor';

describe('ehObjecaoValor', () => {
  it('reconhece objeção de valor', () => {
    for (const frase of [
      'Achei caro',
      'ta caro',
      'muito caro',
      // Feminino: a moto é "ela" — "esta cara" era o jeito mais comum e passava
      // batido (medido ao vivo 2026-09-30).
      'Esta cara',
      'ta cara demais',
      'essa moto esta muito cara',
      'nao tenho esse valor',
      'vi mais barato',
      'vou pensar',
      'esta fora do meu orcamento',
    ]) {
      expect(ehObjecaoValor(frase), frase).toBe(true);
    }
  });

  it('pedido explícito de DIFERENTE não é objeção de valor', () => {
    for (const frase of ['quero uma mais barata', 'quero outra cor', 'tem outra?', 'quero mais nova']) {
      expect(ehPedidoDiferente(frase), frase).toBe(true);
      expect(ehObjecaoValor(frase), frase).toBe(false);
    }
  });

  it('não confunde com outros assuntos', () => {
    for (const frase of [
      'bom dia',
      'quero ver mais fotos',
      'como funciona o financiamento?',
      'qual o endereco da loja?',
      'quero ver a Biz 125',
    ]) {
      expect(ehObjecaoValor(frase), frase).toBe(false);
    }
  });
});

describe('ehPedidoDiferente — "outra coisa" NÃO é "outra moto"', () => {
  it('é pedido de moto diferente', () => {
    for (const frase of [
      'quero outra moto',
      'tem outra?',
      'me mostra outra opcao',
      'quero uma mais nova',
      'quero uma mais barata',
    ]) {
      expect(ehPedidoDiferente(frase), frase).toBe(true);
    }
  });

  it('NÃO é pedido de moto (regressão ao vivo: oferecia motos)', () => {
    for (const frase of [
      'vi mais barato em outra loja',
      'outro dia eu passo aí',
      'tem outra loja em outra cidade?',
      'outra forma de pagamento',
      'quero ver outra coisa',
    ]) {
      expect(ehPedidoDiferente(frase), frase).toBe(false);
    }
  });
});

describe('ehPedidoDesconto', () => {
  it('reconhece pedido DIRETO de desconto/condição melhor', () => {
    for (const frase of [
      'tem como melhorar o valor?',
      'consegue um desconto?',
      'da pra baixar o preco?',
      'faz por menos?',
      'tem um melhor preco?',
    ]) {
      expect(ehPedidoDesconto(frase), frase).toBe(true);
    }
  });

  it('não confunde com objeção comum', () => {
    for (const frase of ['achei caro', 'vi mais barato', 'vou pensar', 'ta muito caro']) {
      expect(ehPedidoDesconto(frase), frase).toBe(false);
    }
  });
});

describe('proximaFase — 2 tentativas e, na 3ª, oferece', () => {
  it('null → persuadir; persuadir → persuadir2; persuadir2 → oferecer; oferecer → oferecer', () => {
    expect(proximaFase(null, false)).toBe('persuadir');
    expect(proximaFase('persuadir', false)).toBe('persuadir2');
    expect(proximaFase('persuadir2', false)).toBe('oferecer');
    expect(proximaFase('oferecer', false)).toBe('oferecer');
    // 'checar' é legado → migra para 'oferecer'.
    expect(proximaFase('checar', false)).toBe('oferecer');
  });

  it('INSISTIU no desconto → handoff (a IA não concede)', () => {
    expect(proximaFase('persuadir', true)).toBe('handoff');
    expect(proximaFase('persuadir2', true)).toBe('handoff');
    expect(proximaFase('oferecer', true)).toBe('handoff');
    expect(proximaFase('handoff', true)).toBe('handoff');
  });
});

describe('renderBlocoObjecao', () => {
  it('persuadir (1ª): justificar e NÃO oferecer outra moto', () => {
    const b = renderBlocoObjecao('persuadir');
    expect(b).toContain('JUSTIFICAR');
    expect(b).toContain('procedência');
    expect(b).toContain('NÃO ofereça outra moto');
  });

  it('persuadir2 (2ª): ângulo diferente e AINDA não oferecer', () => {
    const b = renderBlocoObjecao('persuadir2');
    expect(b).toContain('tentativa 2');
    expect(b).toContain('ÂNGULO DIFERENTE');
    expect(b).toContain('NÃO ofereça outra moto');
  });

  it('oferecer (3ª): avisar o responsável (sem transferir) e oferecer pelo motivo', () => {
    for (const fase of ['oferecer', 'checar'] as const) {
      const b = renderBlocoObjecao(fase);
      expect(b, fase).toContain('OFERECER');
      expect(b, fase).toContain('responsável');
      expect(b, fase).toContain('NÃO chame `crm_request_human_handoff`');
      expect(b, fase).toContain('NUNCA pergunte se pode encaminhar');
    }
  });

  it('handoff: encaminhar sem oferecer motos nem perguntar', () => {
    const b = renderBlocoObjecao('handoff');
    expect(b).toContain('ENCAMINHAR');
    expect(b).toContain('crm_request_human_handoff');
    expect(b).toContain('NUNCA pergunte');
  });
});
