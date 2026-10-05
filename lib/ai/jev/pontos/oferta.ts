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
/** Pedido VAGO: não oferecer motos ainda — o sistema pergunta o que falta. */
export const OFERECER_PERGUNTAR = 'perguntar';

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
  /** O pedido está VAGO: antes de mostrar, PERGUNTAR o que falta (orçamento/tipo/uso). */
  perguntar: boolean;
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
        'explícito do cliente. ' +
        'ENTENDER ANTES DE RESPONDER: se o pedido for GENÉRICO/VAGO — o cliente diz que quer uma ' +
        'moto mas NÃO dá nada para filtrar (nem orçamento, nem tipo de uso/categoria, nem ' +
        'cilindrada, nem modelo/marca) — escolha "perguntar": é melhor PERGUNTAR o que ele precisa ' +
        '(uso? quanto pensa investir?) do que despejar o catálogo e adivinhar. Ex.: "quero uma ' +
        'moto", "me ajuda a escolher", "quero comprar uma moto". NÃO pergunte se ele já deu um ' +
        'critério (modelo/família, marca, cilindrada/cc, faixa de preço, tipo de uso/' +
        'categoria ou cor) ou se pediu para ver opções. Basta UM critério: se ele citou ' +
        'uma marca ("quero uma Honda"), NÃO pergunte — ofereça.',
      criteria: {
        [OFERECER_SIM]: 'sim, mostrar motos agora',
        [OFERECER_NAO]: 'não mostrar motos neste turno',
        [OFERECER_PERGUNTAR]:
          'não mostrar ainda: o pedido é vago — o sistema deve PERGUNTAR o que o cliente precisa',
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
  const escolha = a?.type === 'choice' ? a.choice : null;
  const perguntar = escolha === OFERECER_PERGUNTAR;
  const oferecer = escolha === OFERECER_SIM;
  const c = respostas.criterio;
  const criterio: CriterioDeOfertaJev =
    oferecer && c?.type === 'choice' && (c.choice === 'preco' || c.choice === 'km' || c.choice === 'ano')
      ? c.choice
      : 'nenhum';
  return {
    oferecer,
    perguntar,
    criterio,
    motivo: perguntar ? 'jev_perguntar' : oferecer ? `jev_liberou_${criterio}` : 'jev_negou',
  };
}
