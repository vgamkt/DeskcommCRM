/**
 * Ponto `narracao` da Jev — decide se a mensagem final do redator é FALA AO
 * CLIENTE ou NARRAÇÃO INTERNA.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export const NARRACAO = 'narracao';
export const MENSAGEM = 'mensagem';

/** Pergunta `choice` da Jev: o texto é mensagem ao cliente ou narração interna? */
export function perguntaDeNarracaoJev(): PerguntasDeJev {
  return {
    narracao: {
      type: 'choice',
      instructions:
        'Classifique o TEXTO abaixo. Responda "narracao" se ele NÃO é uma fala de vendedora dirigida ao ' +
        'cliente, e sim bastidor: o modelo falando de si, do cliente ou do sistema em 3ª pessoa ' +
        '("respondi ao cliente", "turno encerrado", "o cliente ainda não informou", "registrei ao setor"), ' +
        'resumo/status de turno, ou texto em OUTRO IDIOMA (chinês/coreano/japonês). ' +
        'IMPORTANTE: um CABEÇALHO de relato/encaminhamento como "Respondido ao Vander:", "Resposta ao cliente:", ' +
        '"Enviado para o Vander:", "Registrado ao responsável:" — mesmo colado a uma mensagem boa logo abaixo — ' +
        'É NARRAÇÃO (é o modelo anotando a quem respondeu). ' +
        'Responda "mensagem" SÓ se o texto inteiro é uma fala legítima de vendedora ao cliente (2ª pessoa, "você"), ' +
        'mesmo que cite "responsável", "setor", "financeira" ou "análise" — isso é normal na venda.',
      criteria: {
        [MENSAGEM]: 'é uma mensagem legítima ao cliente',
        [NARRACAO]: 'é narração interna / bastidor / outro idioma',
      },
    },
  };
}

export interface VereditoDeNarracao {
  ehNarracao: boolean;
}

/** Converte as respostas da Jev no veredito. Ausente/ambíguo = NÃO é narração. */
export function vereditoDeNarracaoDaJev(respostas: RespostasDeJev): VereditoDeNarracao {
  const a = respostas.narracao;
  return { ehNarracao: a?.type === 'choice' && a.choice === NARRACAO };
}
