/**
 * SIMULAÇÃO DE CONVERSA — a régua turno a turno, com o ESTADO evoluindo como
 * evoluiria numa conversa real (`objetouAntes` e `temEscolhaTravada` são a
 * memória da conversa). É o teste que reproduz o caso medido ao vivo
 * ("De sao paulo" → 5 motos) e prova que ele não volta.
 */
import { describe, expect, it } from 'vitest';

import { podeOferecerMotos, type SinaisDeOferta } from './pode-oferecer-motos';

interface Estado {
  temEscolhaTravada: boolean;
  objetouAntes: boolean;
  pediuOutraMoto: boolean;
}

function rodar(estado: Estado, mensagem: string) {
  return podeOferecerMotos({ mensagem, ...estado } satisfies SinaisDeOferta);
}

describe('simulação de conversa — quando pode oferecer motos', () => {
  it('pedido → apresenta; assunto alheio → nada; escolha + caro 1ª → persuade; 2ª → oferece mais barata', () => {
    const estado: Estado = {
      temEscolhaTravada: false,
      objetouAntes: false,
      pediuOutraMoto: false,
    };

    // 1) Cliente pede catálogo → OFERECE.
    expect(rodar(estado, 'Boa tarde, tem moto ate 20 mil?')).toMatchObject({
      pode: true,
      motivo: 'cliente_pediu_catalogo',
    });

    // 2) Já apresentou. Cliente responde só "De sao paulo" → NÃO oferece.
    expect(rodar(estado, 'De sao paulo')).toMatchObject({
      pode: false,
      motivo: 'sem_pedido_do_cliente',
    });

    // 3) Cliente escolhe a moto → trava a escolha na conversa.
    estado.temEscolhaTravada = true;
    expect(rodar(estado, 'gostei da CB 300')).toMatchObject({
      pode: false,
      motivo: 'escolha_travada',
    });

    // 4) 1ª objeção de preço → persuade (não oferece).
    expect(rodar(estado, 'achei cara')).toMatchObject({
      pode: false,
      motivo: 'objecao_nova_persuadir',
    });

    // ...o bot persuade; a objeção PERSISTE.
    estado.objetouAntes = true;
    expect(rodar(estado, 'mas continua cara')).toMatchObject({
      pode: true,
      motivo: 'objecao_persistente',
      criterio: 'preco',
    });

    // 5) Rejeição pontual da cor → oferece OUTRA.
    expect(rodar(estado, 'nao gostei dessa cor')).toMatchObject({ pode: true });

    // 6) Pedido de processo (financiar) → NÃO oferece catálogo.
    expect(rodar(estado, 'quero financiar')).toMatchObject({
      pode: false,
      motivo: 'pedido_de_processo',
    });
  });

  it('insistência em desconto depois de persuadir → NÃO oferece (handoff)', () => {
    const estado: Estado = { temEscolhaTravada: true, objetouAntes: true, pediuOutraMoto: false };
    expect(rodar(estado, 'me da um desconto')).toMatchObject({
      pode: false,
      motivo: 'insistencia_desconto_handoff',
    });
  });

  it('"quero ver mais opções" reabre mesmo com escolha travada', () => {
    const estado: Estado = { temEscolhaTravada: true, objetouAntes: false, pediuOutraMoto: false };
    expect(rodar(estado, 'quero ver mais opções')).toMatchObject({
      pode: true,
      motivo: 'cliente_pediu_mais_opcoes',
    });
  });
});
