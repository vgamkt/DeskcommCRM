import { describe, expect, it } from 'vitest';

import type { EstadoObjecao } from './objecao-de-valor';
import {
  clienteRejeitouMoto,
  criterioDaObjecao,
  fluxoBloqueiaOferta,
  pedidoExplicitoDeMaisOpcoes,
  podeOferecerMotos,
  preferenciaDoCriterio,
  type SinaisDeOferta,
} from './pode-oferecer-motos';

function s(over: Partial<SinaisDeOferta> = {}): SinaisDeOferta {
  return {
    mensagem: '',
    temEscolhaTravada: false,
    temMotoEmFoco: false,
    estadoObjecaoAnterior: null,
    pediuOutraMoto: false,
    confirmouVerOpcoes: false,
    ...over,
  };
}

describe('fluxoBloqueiaOferta — o fluxo ativo faz a oferta ESPERAR', () => {
  it('bloqueia enquanto houver pergunta pendente no fluxo', () => {
    expect(fluxoBloqueiaOferta(1)).toBe(true);
    expect(fluxoBloqueiaOferta(3)).toBe(true);
  });

  it('libera quando o fluxo concluiu (zero pendentes) — inclusive no mesmo turno', () => {
    expect(fluxoBloqueiaOferta(0)).toBe(false);
  });
});

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

describe('pedidoExplicitoDeMaisOpcoes', () => {
  it('força a oferta quando o cliente pede mais opções (vence a Jev)', () => {
    for (const m of ['quero ver mais opções', 'tem mais opções?', 'mostra as outras', 'ver mais']) {
      expect(pedidoExplicitoDeMaisOpcoes(m), m).toMatchObject({
        pode: true,
        motivo: 'cliente_pediu_mais_opcoes',
      });
    }
  });

  it('não força quando não há pedido explícito', () => {
    expect(pedidoExplicitoDeMaisOpcoes('achei caro')).toBeNull();
    expect(pedidoExplicitoDeMaisOpcoes('bom dia')).toBeNull();
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

  const OBJ = (motivo: EstadoObjecao['motivo'], tentativas: number): EstadoObjecao => ({
    moto: '',
    motivo,
    tentativas,
  });

  it('NÃO oferece na 1ª objeção (tentativa 1 do tipo)', () => {
    expect(podeOferecerMotos(s({ mensagem: 'achei cara', estadoObjecaoAnterior: null }))).toMatchObject({
      pode: false,
      motivo: 'objecao_tentativa_1',
    });
  });

  it('NÃO oferece na 2ª do MESMO tipo (tentativa 2) — ainda persuade', () => {
    expect(
      podeOferecerMotos(s({ mensagem: 'mas continua cara', estadoObjecaoAnterior: OBJ('preco', 1) })),
    ).toMatchObject({ pode: false, motivo: 'objecao_tentativa_2' });
  });

  it('na 3ª do MESMO tipo NÃO oferece ainda — pede confirmação (o bot pergunta)', () => {
    expect(
      podeOferecerMotos(s({ mensagem: 'mas continua cara', estadoObjecaoAnterior: OBJ('preco', 2) })),
    ).toMatchObject({ pode: false, motivo: 'objecao_pedir_confirmacao' });
  });

  it('oferece SÓ depois de o cliente CONFIRMAR (já perguntamos) — com o critério do motivo', () => {
    expect(
      podeOferecerMotos(
        s({ mensagem: 'pode mostrar', estadoObjecaoAnterior: OBJ('preco', 3), confirmouVerOpcoes: true }),
      ),
    ).toMatchObject({ pode: true, motivo: 'cliente_confirmou_opcoes', criterio: 'preco' });
    // Confirmou, mas o motivo era outro → sem critério.
    expect(
      podeOferecerMotos(
        s({ mensagem: 'sim', estadoObjecaoAnterior: OBJ('outro', 3), confirmouVerOpcoes: true }),
      ),
    ).toMatchObject({ pode: true, criterio: null });
    // Sem confirmar (ainda na 3ª) → pergunta de novo, não mostra.
    expect(
      podeOferecerMotos(
        s({ mensagem: 'e agora?', estadoObjecaoAnterior: OBJ('preco', 3), confirmouVerOpcoes: false }),
      ),
    ).toMatchObject({ pode: false });
  });

  it('MUDOU o tipo de objeção → reinicia a contagem (volta a persuadir)', () => {
    // estava em preço com 2 tentativas; agora reclamou de rodagem (km, tipo novo)
    expect(
      podeOferecerMotos(s({ mensagem: 'agora achei muito rodada', estadoObjecaoAnterior: OBJ('preco', 2) })),
    ).toMatchObject({ pode: false, motivo: 'objecao_tentativa_1' });
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

  it('pedido de desconto é objeção de PREÇO normal (NÃO vira handoff/silêncio)', () => {
    // 3ª do mesmo tipo (preco, 2 tentativas) → pede confirmação, NÃO oferece.
    expect(
      podeOferecerMotos(s({ mensagem: 'me da um desconto', estadoObjecaoAnterior: OBJ('preco', 2) })),
    ).toMatchObject({ pode: false, motivo: 'objecao_pedir_confirmacao' });
    // 1ª vez → persuade (não oferece), sem motivo de handoff.
    expect(
      podeOferecerMotos(s({ mensagem: 'me da um desconto', estadoObjecaoAnterior: null })),
    ).toMatchObject({ pode: false, motivo: 'objecao_tentativa_1' });
  });

  it('NÃO oferece com escolha travada, a menos que o cliente queira outra', () => {
    expect(podeOferecerMotos(s({ mensagem: 'ok', temEscolhaTravada: true })).pode).toBe(false);
    expect(
      podeOferecerMotos(s({ mensagem: 'quero outra cor', temEscolhaTravada: true })).pode,
    ).toBe(true);
  });

  it('PEDIDO EXPLÍCITO vence a escolha travada; menção solta não', () => {
    expect(
      podeOferecerMotos(s({ mensagem: 'quero uma moto ate 20 mil', temEscolhaTravada: true })),
    ).toMatchObject({ pode: true, motivo: 'cliente_pediu_catalogo' });
    expect(
      podeOferecerMotos(s({ mensagem: 'tem uma CB 300?', temEscolhaTravada: true })).pode,
    ).toBe(true);
    // Menção solta (sem verbo de pedido) NÃO destrava.
    expect(
      podeOferecerMotos(s({ mensagem: 'essa moto e boa?', temEscolhaTravada: true })),
    ).toMatchObject({ pode: false, motivo: 'escolha_travada' });
  });

  it('menção solta com moto em foco NÃO oferece (sem escolha travada também)', () => {
    expect(
      podeOferecerMotos(s({ mensagem: 'essa moto e boa?', temMotoEmFoco: true })),
    ).toMatchObject({ pode: false, motivo: 'sem_pedido_do_cliente' });
    // Mas um pedido explícito continua abrindo.
    expect(
      podeOferecerMotos(s({ mensagem: 'quero uma moto ate 20 mil', temMotoEmFoco: true })).pode,
    ).toBe(true);
  });
});
