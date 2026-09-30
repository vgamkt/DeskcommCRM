import { describe, expect, it } from 'vitest';

import {
  clienteRejeitouMoto,
  criterioDaObjecao,
  podeOferecerMotos,
  preferenciaDoCriterio,
  type SinaisDeOferta,
} from './pode-oferecer-motos';

function s(over: Partial<SinaisDeOferta> = {}): SinaisDeOferta {
  return {
    mensagem: '',
    temEscolhaTravada: false,
    faseObjecaoAnterior: null,
    pediuOutraMoto: false,
    ...over,
  };
}

describe('criterioDaObjecao', () => {
  it('caro/cara/desconto → preço (menor)', () => {
    expect(criterioDaObjecao('achei cara')).toBe('preco');
    expect(criterioDaObjecao('ta caro demais')).toBe('preco');
    expect(preferenciaDoCriterio('preco')).toBe('menor');
  });
  it('rodada/km → km (menor); antiga → ano (maior)', () => {
    expect(criterioDaObjecao('essa moto esta muito rodada')).toBe('km');
    expect(preferenciaDoCriterio('km')).toBe('menor');
    expect(criterioDaObjecao('achei muito antiga')).toBe('ano');
    expect(preferenciaDoCriterio('ano')).toBe('maior');
  });
  it('sem critério claro → null', () => {
    expect(criterioDaObjecao('bom dia')).toBeNull();
    expect(preferenciaDoCriterio(null)).toBeNull();
  });
});

describe('clienteRejeitouMoto', () => {
  it('reconhece rejeição pontual', () => {
    for (const m of ['nao gostei dessa cor', 'nao curti essa', 'nao era essa', 'prefiro outra']) {
      expect(clienteRejeitouMoto(m), m).toBe(true);
    }
  });
  it('não confunde com objeção de preço ou assunto alheio', () => {
    expect(clienteRejeitouMoto('achei cara')).toBe(false);
    expect(clienteRejeitouMoto('de sao paulo')).toBe(false);
  });
});

describe('podeOferecerMotos — a régua única', () => {
  it('PODE quando o cliente pede catálogo/moto', () => {
    expect(podeOferecerMotos(s({ mensagem: 'quero uma moto ate 20 mil' }))).toMatchObject({
      pode: true,
      motivo: 'cliente_pediu_catalogo',
    });
    expect(podeOferecerMotos(s({ mensagem: 'tem uma CB 300?' })).pode).toBe(true);
  });

  it('PODE quando pede mais opções ou rejeita um ponto', () => {
    expect(podeOferecerMotos(s({ mensagem: 'quero ver mais opções' })).pode).toBe(true);
    expect(podeOferecerMotos(s({ mensagem: 'nao gostei dessa cor' })).pode).toBe(true);
    expect(podeOferecerMotos(s({ mensagem: 'quero outra cor' })).pode).toBe(true);
  });

  it('NÃO oferece na 1ª objeção (tentativa 1 de 2)', () => {
    expect(podeOferecerMotos(s({ mensagem: 'achei cara', faseObjecaoAnterior: null }))).toMatchObject({
      pode: false,
      motivo: 'objecao_tentativa_1',
    });
  });

  it('NÃO oferece na 2ª objeção (tentativa 2 de 2) — ainda persuade', () => {
    expect(
      podeOferecerMotos(s({ mensagem: 'mas continua cara', faseObjecaoAnterior: 'persuadir' })),
    ).toMatchObject({ pode: false, motivo: 'objecao_tentativa_2' });
  });

  it('OFERECE na 3ª objeção — com o critério do motivo', () => {
    expect(
      podeOferecerMotos(s({ mensagem: 'mas continua cara', faseObjecaoAnterior: 'persuadir2' })),
    ).toMatchObject({ pode: true, motivo: 'objecao_persistente', criterio: 'preco' });
    expect(
      podeOferecerMotos(s({ mensagem: 'essa moto esta muito rodada', faseObjecaoAnterior: 'persuadir2' })),
    ).toMatchObject({ pode: true, criterio: 'km' });
    // Já liberado antes ('oferecer'/'checar') → continua podendo.
    expect(
      podeOferecerMotos(s({ mensagem: 'e o preco?', faseObjecaoAnterior: 'oferecer' })),
    ).toMatchObject({ pode: true });
  });

  it('NÃO oferece em assunto alheio ("De sao paulo"), travado ou não', () => {
    expect(podeOferecerMotos(s({ mensagem: 'De sao paulo' }))).toMatchObject({
      pode: false,
      motivo: 'sem_pedido_do_cliente',
    });
    expect(
      podeOferecerMotos(s({ mensagem: 'De sao paulo', temEscolhaTravada: true })),
    ).toMatchObject({ pode: false, motivo: 'escolha_travada' });
  });

  it('qualquer forma de objeção (1ª vez) NÃO oferece — inclusive com escolha travada', () => {
    for (const m of [
      'achei cara',
      'ta caro demais',
      'vi mais barato em outra loja',
      'nao tenho esse valor',
      'esta muito rodada',
      'achei antiga',
      'vou pensar',
      'esta salgada',
    ]) {
      expect(podeOferecerMotos(s({ mensagem: m })), m).toMatchObject({ pode: false });
      // E também com uma moto travada na conversa.
      expect(podeOferecerMotos(s({ mensagem: m, temEscolhaTravada: true })), m).toMatchObject({
        pode: false,
      });
    }
  });

  it('objeção que persiste NÃO oferece se for insistência em DESCONTO (é handoff)', () => {
    expect(
      podeOferecerMotos(s({ mensagem: 'me da um desconto', faseObjecaoAnterior: 'persuadir2' })),
    ).toMatchObject({ pode: false, motivo: 'insistencia_desconto_handoff' });
  });

  it('NÃO oferece com escolha travada, a menos que o cliente queira outra', () => {
    expect(podeOferecerMotos(s({ mensagem: 'ok', temEscolhaTravada: true })).pode).toBe(false);
    expect(
      podeOferecerMotos(s({ mensagem: 'quero outra cor', temEscolhaTravada: true })).pode,
    ).toBe(true);
  });
});
