import { describe, expect, it } from 'vitest';

import {
  avancarObjecao,
  clienteConfirmouVer,
  ehObjecaoValor,
  ehPedidoDesconto,
  ehPedidoDiferente,
  faseDoTurno,
  motivoDaObjecao,
  renderBlocoObjecao,
  valorCitado,
  type EstadoObjecao,
} from './objecao-de-valor';

const est = (motivo: EstadoObjecao['motivo'], tentativas: number): EstadoObjecao => ({
  moto: 'cb 300',
  motivo,
  tentativas,
});

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

describe('motivoDaObjecao', () => {
  it('classifica preço / rodagem / ano / genérico', () => {
    expect(motivoDaObjecao('achei caro')).toBe('preco');
    expect(motivoDaObjecao('essa moto esta muito rodada')).toBe('km');
    expect(motivoDaObjecao('achei antiga')).toBe('ano');
    expect(motivoDaObjecao('vou pensar')).toBe('outro');
  });
});

describe('clienteConfirmouVer', () => {
  it('reconhece confirmação', () => {
    for (const m of ['sim', 'pode mostrar', 'pode mandar', 'quero ver', 'claro', 'manda', 'beleza']) {
      expect(clienteConfirmouVer(m), m).toBe(true);
    }
  });
  it('negação não confirma', () => {
    for (const m of ['nao', 'é só essa', 'so essa mesmo', 'deixa', 'só tenho interesse nessa']) {
      expect(clienteConfirmouVer(m), m).toBe(false);
    }
  });
});

describe('valorCitado', () => {
  it('extrai valores em reais', () => {
    expect(valorCitado('eu dou 27 nela')).toBe(27000);
    expect(valorCitado('tenho 27 mil em mente')).toBe(27000);
    expect(valorCitado('quero uma de ate 20 mil')).toBe(20000);
    expect(valorCitado('uns 20k')).toBe(20000);
    expect(valorCitado('R$ 25.000')).toBe(25000);
    expect(valorCitado('25000')).toBe(25000);
  });
  it('não confunde com ano nem sem valor', () => {
    expect(valorCitado('quero uma 2024')).toBeNull();
    expect(valorCitado('bom dia')).toBeNull();
  });
});

describe('faseDoTurno — 2 tentativas POR TIPO e, na 3ª, pergunta', () => {
  it('sem estado (ou tipo novo) → persuadir; 1 tentativa do tipo → persuadir2; 2+ → oferecer', () => {
    expect(faseDoTurno(null, 'preco', false)).toBe('persuadir');
    // Mudou o tipo → reinicia em persuadir.
    expect(faseDoTurno(est('km', 2), 'preco', false)).toBe('persuadir');
    expect(faseDoTurno(est('preco', 1), 'preco', false)).toBe('persuadir2');
    expect(faseDoTurno(est('preco', 2), 'preco', false)).toBe('oferecer');
    expect(faseDoTurno(est('preco', 5), 'preco', false)).toBe('oferecer');
  });

  it('INSISTIU no desconto → handoff (a IA não concede)', () => {
    expect(faseDoTurno(null, 'preco', true)).toBe('handoff');
    expect(faseDoTurno(est('preco', 2), 'preco', true)).toBe('handoff');
  });
});

describe('avancarObjecao — conta por tipo', () => {
  it('mesmo tipo soma; tipo novo reinicia em 1; desconto preserva', () => {
    expect(avancarObjecao(null, 'preco', false)).toEqual({ motivo: 'preco', tentativas: 1 });
    expect(avancarObjecao(est('preco', 1), 'preco', false)).toEqual({ motivo: 'preco', tentativas: 2 });
    expect(avancarObjecao(est('preco', 2), 'preco', false)).toEqual({ motivo: 'preco', tentativas: 3 });
    // Mudou o motivo → 1.
    expect(avancarObjecao(est('preco', 2), 'km', false)).toEqual({ motivo: 'km', tentativas: 1 });
    // Desconto não incrementa.
    expect(avancarObjecao(est('preco', 2), 'preco', true)).toEqual({ motivo: 'preco', tentativas: 2 });
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

  it('oferecer (3ª): avisar o responsável e PERGUNTAR antes (NÃO mostrar motos)', () => {
    const b = renderBlocoObjecao('oferecer');
    expect(b).toContain('PERGUNTAR');
    expect(b).toContain('responsável');
    expect(b).toContain('NÃO mostre motos');
    expect(b).toContain('qual valor ele tem em mente');
    expect(b).toContain('NÃO chame `crm_offer_similar_motos`');
  });

  it('mostrar: oferecer pelo motivo e respeitar o valor do cliente', () => {
    const b = renderBlocoObjecao('mostrar');
    expect(b).toContain('CONFIRMOU');
    expect(b).toContain('SÓ opções DENTRO desse valor');
  });

  it('handoff: encaminhar sem oferecer motos nem perguntar', () => {
    const b = renderBlocoObjecao('handoff');
    expect(b).toContain('ENCAMINHAR');
    expect(b).toContain('crm_request_human_handoff');
    expect(b).toContain('NUNCA pergunte');
  });
});
