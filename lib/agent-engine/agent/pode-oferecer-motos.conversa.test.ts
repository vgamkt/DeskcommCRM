/**
 * SIMULAÇÃO DE CONVERSA — a régua turno a turno, com o ESTADO evoluindo como
 * evoluiria numa conversa real (`estadoObjecaoAnterior` e `temEscolhaTravada` são
 * a memória da conversa). Reproduz o caso medido ao vivo ("De sao paulo" → 5
 * motos) e prova a regra do dono: DUAS tentativas de persuasão POR TIPO de
 * objeção e, na TERCEIRA vez do mesmo tipo, libera oferecer outra opção.
 */
import { describe, expect, it } from 'vitest';

import type { EstadoObjecao, MotivoObjecao } from './objecao-de-valor';
import { podeOferecerMotos, type SinaisDeOferta } from './pode-oferecer-motos';

interface Estado {
  temEscolhaTravada: boolean;
  estadoObjecaoAnterior: EstadoObjecao | null;
  pediuOutraMoto: boolean;
}

const obj = (motivo: MotivoObjecao, tentativas: number): EstadoObjecao => ({
  moto: 'cb 300',
  motivo,
  tentativas,
});

function rodar(estado: Estado, mensagem: string) {
  return podeOferecerMotos({
    mensagem,
    ...estado,
    confirmouVerOpcoes: false,
  } satisfies SinaisDeOferta);
}

describe('simulação de conversa — quando pode oferecer motos', () => {
  it('pedido → apresenta; assunto alheio → nada; 2 objeções persuadem; 3ª do mesmo tipo oferece', () => {
    const estado: Estado = {
      temEscolhaTravada: false,
      estadoObjecaoAnterior: null,
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

    // 4) 1ª objeção de PREÇO → persuade (não oferece).
    expect(rodar(estado, 'achei cara')).toMatchObject({ pode: false, motivo: 'objecao_tentativa_1' });
    estado.estadoObjecaoAnterior = obj('preco', 1);

    // 5) 2ª objeção do MESMO tipo → persuade de novo (ainda não oferece).
    expect(rodar(estado, 'mas continua cara')).toMatchObject({
      pode: false,
      motivo: 'objecao_tentativa_2',
    });
    estado.estadoObjecaoAnterior = obj('preco', 2);

    // 6) 3ª objeção do MESMO tipo → ainda NÃO mostra: o bot avisa o responsável e
    //    PERGUNTA se ele quer ver opções (e, sendo preço, qual valor tem em mente).
    expect(rodar(estado, 'e continua caro mesmo')).toMatchObject({
      pode: false,
      motivo: 'objecao_pedir_confirmacao',
    });
    estado.estadoObjecaoAnterior = obj('preco', 3);

    // 7) Cliente CONFIRMA que quer ver → agora a oferta sai, com o critério.
    expect(
      podeOferecerMotos({
        ...estado,
        mensagem: 'pode mostrar, sim',
        confirmouVerOpcoes: true,
      }),
    ).toMatchObject({ pode: true, motivo: 'cliente_confirmou_opcoes', criterio: 'preco' });

    // 7) Mudou o MOTIVO (rodagem) → reinicia: volta a persuadir.
    expect(rodar(estado, 'agora achei muito rodada')).toMatchObject({
      pode: false,
      motivo: 'objecao_tentativa_1',
    });

    // 8) Pedido de processo (financiar) → NÃO oferece catálogo.
    expect(rodar(estado, 'quero financiar')).toMatchObject({
      pode: false,
      motivo: 'pedido_de_processo',
    });
  });

  it('insistência em desconto → NÃO oferece (handoff), qualquer que seja o estado', () => {
    for (const estado of [null, obj('preco', 1), obj('preco', 2)]) {
      const e: Estado = {
        temEscolhaTravada: true,
        estadoObjecaoAnterior: estado,
        pediuOutraMoto: false,
      };
      expect(rodar(e, 'me da um desconto'), JSON.stringify(estado)).toMatchObject({
        pode: false,
        motivo: 'insistencia_desconto_handoff',
      });
    }
  });

  it('"quero ver mais opções" reabre mesmo com escolha travada', () => {
    const estado: Estado = {
      temEscolhaTravada: true,
      estadoObjecaoAnterior: null,
      pediuOutraMoto: false,
    };
    expect(rodar(estado, 'quero ver mais opções')).toMatchObject({
      pode: true,
      motivo: 'cliente_pediu_mais_opcoes',
    });
  });
});
