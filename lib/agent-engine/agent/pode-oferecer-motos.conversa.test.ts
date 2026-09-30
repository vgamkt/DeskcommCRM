/**
 * SIMULAÇÃO DE CONVERSA — a régua turno a turno, com o ESTADO evoluindo como
 * evoluiria numa conversa real (`faseObjecaoAnterior` e `temEscolhaTravada` são a
 * memória da conversa). Reproduz o caso medido ao vivo ("De sao paulo" → 5 motos)
 * e prova a regra do dono: DUAS tentativas de persuasão e, na TERCEIRA objeção,
 * libera oferecer outra opção.
 */
import { describe, expect, it } from 'vitest';

import type { FaseObjecao } from './objecao-de-valor';
import { podeOferecerMotos, type SinaisDeOferta } from './pode-oferecer-motos';

interface Estado {
  temEscolhaTravada: boolean;
  faseObjecaoAnterior: FaseObjecao | null;
  pediuOutraMoto: boolean;
}

function rodar(estado: Estado, mensagem: string) {
  return podeOferecerMotos({ mensagem, ...estado } satisfies SinaisDeOferta);
}

describe('simulação de conversa — quando pode oferecer motos', () => {
  it('pedido → apresenta; assunto alheio → nada; 2 objeções persuadem; 3ª oferece mais barata', () => {
    const estado: Estado = {
      temEscolhaTravada: false,
      faseObjecaoAnterior: null,
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
      motivo: 'objecao_tentativa_1',
    });
    // O motor grava a fase após o turno.
    estado.faseObjecaoAnterior = 'persuadir';

    // 5) 2ª objeção → persuade DE NOVO (ainda não oferece).
    expect(rodar(estado, 'mas continua cara')).toMatchObject({
      pode: false,
      motivo: 'objecao_tentativa_2',
    });
    estado.faseObjecaoAnterior = 'persuadir2';

    // 6) 3ª objeção → LIBERA, com o critério do motivo.
    expect(rodar(estado, 'e continua caro mesmo')).toMatchObject({
      pode: true,
      motivo: 'objecao_persistente',
      criterio: 'preco',
    });

    // 7) Rejeição pontual da cor → oferece OUTRA (independe da objeção).
    expect(rodar(estado, 'nao gostei dessa cor')).toMatchObject({ pode: true });

    // 8) Pedido de processo (financiar) → NÃO oferece catálogo.
    expect(rodar(estado, 'quero financiar')).toMatchObject({
      pode: false,
      motivo: 'pedido_de_processo',
    });
  });

  it('insistência em desconto → NÃO oferece (handoff), em qualquer fase', () => {
    for (const fase of [null, 'persuadir', 'persuadir2'] as const) {
      const estado: Estado = {
        temEscolhaTravada: true,
        faseObjecaoAnterior: fase,
        pediuOutraMoto: false,
      };
      expect(rodar(estado, 'me da um desconto'), String(fase)).toMatchObject({
        pode: false,
        motivo: 'insistencia_desconto_handoff',
      });
    }
  });

  it('"quero ver mais opções" reabre mesmo com escolha travada', () => {
    const estado: Estado = {
      temEscolhaTravada: true,
      faseObjecaoAnterior: null,
      pediuOutraMoto: false,
    };
    expect(rodar(estado, 'quero ver mais opções')).toMatchObject({
      pode: true,
      motivo: 'cliente_pediu_mais_opcoes',
    });
  });
});
