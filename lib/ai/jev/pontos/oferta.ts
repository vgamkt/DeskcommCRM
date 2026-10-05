/**
 * Mapeamento do ponto `offer_motos` para a Jev.
 *
 * O QUE A JEV DECIDE: este turno PODE oferecer motos? Ela é a AUTORIDADE sobre a
 * oferta — melhor que a régua de regex (`podeOferecerMotos`), que erra em
 * nuances. A regra do dono (2026-10-03): só oferece motos quando o cliente PEDE,
 * ou quando a moto que ele pediu NÃO EXISTE (aí vale mostrar equivalentes).
 *
 * A Jev devolve um veredito (`oferecer`/`nao_oferecer`) + `criterio` (o que
 * atacar: preço/km/ano) + `motivo` textual para log. Ela NÃO escreve nada ao
 * cliente.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export const OFERECER_SIM = 'oferecer';
export const OFERECER_NAO = 'nao_oferecer';

/** Critério da oferta (vira preferência de ranqueamento no motor). */
export type CriterioDeOfertaJev = 'preco' | 'km' | 'ano' | 'nenhum';

export interface ContextoDeOferta {
  /** Mensagem do cliente NESTE turno. */
  mensagem: string;
  /** Pediu para ver MAIS opções ("tem outras?", "quero ver mais")? */
  pediuMaisOpcoes: boolean;
  /** Há moto escolhida/travada na conversa. */
  temEscolhaTravada: boolean;
  /** Há QUALQUER moto em foco (escolhida/referência/apresentada). */
  temMotoEmFoco: boolean;
  /** O pedido citou uma moto que NÃO está no catálogo (equivale a "não temos"). */
  pedidoSemCorrespondencia: boolean;
  /** Estamos na 3ª+ objeção e o cliente JÁ confirmou que quer ver opções. */
  clienteConfirmouOpcoes: boolean;
  /** Tipo da objeção anterior, se houver (contexto para a Jev). */
  motivoObjecaoAnterior: string | null;
}

export interface VereditoDeOferta {
  oferecer: boolean;
  criterio: CriterioDeOfertaJev;
  /** Frase curta do porquê — para LOG, nunca para o cliente. */
  motivo: string;
}

/** Pergunta `choice` da Jev: oferecer motos neste turno? */
export function perguntaDeOfertaJev(ctx: ContextoDeOferta): PerguntasDeJev {
  return {
    oferta: {
      type: 'choice',
      instructions:
        'O sistema deve MOSTRAR/ENVIAR motos ao cliente NESTE turno? Regra: SÓ mostre motos se o ' +
        'cliente PEDIU para ver motos (catálogo, uma moto específica, mais opções, algo diferente) ' +
        `OU se a moto que ele pediu NÃO existe no estoque (aí mostre equivalentes). Contexto: ` +
        `moto em foco=${ctx.temMotoEmFoco}, escolha travada=${ctx.temEscolhaTravada}, ` +
        `pedido sem correspondência no estoque=${ctx.pedidoSemCorrespondencia}, ` +
        `cliente pediu mais opções=${ctx.pediuMaisOpcoes}, confirmou ver opções=${ctx.clienteConfirmouOpcoes}. ` +
        'NÃO mostre se ele está só conversando, perguntando outra coisa, respondendo a um dado, ' +
        'ou se uma objeção ainda está sendo contornada. ' +
        'REGRA INEGOCIÁVEL: se o cliente PERGUNTA se temos uma moto/modelo específico ' +
        '("tem a CB 300?", "vocês têm X?", "quanto custa a X?") ou PEDE para ver o catálogo, a ' +
        'resposta é SEMPRE "sim, mostrar motos agora". ' +
        'REGRA INEGOCIÁVEL: se "cliente pediu mais opções" for verdadeiro, a resposta é SEMPRE ' +
        '"sim, mostrar motos agora" (com o criterio que ataca o motivo). NUNCA negue um pedido ' +
        'explícito do cliente.',
      criteria: {
        [OFERECER_SIM]: 'sim, mostrar motos agora',
        [OFERECER_NAO]: 'não mostrar motos neste turno',
      },
    },
    criterio: {
      type: 'choice',
      instructions:
        'Se for mostrar, QUAL aspecto atacar (para escolher as melhores)? Se não for mostrar, marque ' +
        '"nenhum".',
      criteria: {
        nenhum: 'não se aplica',
        preco: 'o cliente reclamou do PREÇO / quer mais barata',
        km: 'o cliente reclamou da QUILOMETRAGEM / quer menos rodada',
        ano: 'o cliente reclamou do ANO / quer mais nova',
      },
    },
  };
}

/** Converte as respostas da Jev no veredito de oferta. */
export function vereditoDeOfertaDaJev(respostas: RespostasDeJev): VereditoDeOferta {
  const a = respostas.oferta;
  const oferecer = a?.type === 'choice' && a.choice === OFERECER_SIM;
  const c = respostas.criterio;
  const criterio: CriterioDeOfertaJev =
    oferecer && c?.type === 'choice' && (c.choice === 'preco' || c.choice === 'km' || c.choice === 'ano')
      ? c.choice
      : 'nenhum';
  return { oferecer, criterio, motivo: oferecer ? `jev_liberou_${criterio}` : 'jev_negou' };
}
