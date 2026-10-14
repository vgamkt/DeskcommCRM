/**
 * Ponto `pergunta_do_fluxo` da Jev — G3.7.
 *
 * ANTES: o MOTOR decidia reenviar a pergunta pendente do roteiro (a "trava"), sempre
 * que ela não tivesse saído no turno. Isso forçava a pergunta em momentos ruins.
 * AGORA: a JEV decide se a pergunta deve sair NESTE turno (`agora`) ou se é melhor
 * esperar (`esperar`) — ex.: o cliente está falando de outro assunto e a pergunta
 * soaria fora de hora. O motor só executa. Módulo PURO.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export const AGORA = 'agora';
export const ESPERAR = 'esperar';

/** Pergunta `choice` da Jev: a pergunta do roteiro sai agora ou espera? */
export function perguntaDaPerguntaDoFluxoJev(pergunta: string, falaDoCliente: string): PerguntasDeJev {
  return {
    pergunta_do_fluxo: {
      type: 'choice',
      instructions:
        `O roteiro de atendimento tem uma pergunta pendente: "${pergunta}". ` +
        `A última fala do cliente foi: "${falaDoCliente}". ` +
        `Responda "${AGORA}" se a pergunta do roteiro deve ser feita NESTE turno — quando é natural, ` +
        `o cliente está no fluxo, ou a conversa está parada. ` +
        `Responda "${ESPERAR}" só quando a pergunta soaria FORA DE HORA: o cliente acabou de fazer ` +
        `outra pergunta e ainda não foi respondido, ou está reclamando/negociando preço. ` +
        `Na dúvida, responda "${AGORA}" — a pergunta é um compromisso do atendimento.`,
      criteria: {
        [AGORA]: 'fazer a pergunta do roteiro neste turno',
        [ESPERAR]: 'esperar um momento melhor',
      },
    },
  };
}

export interface VereditoDePerguntaDoFluxo {
  /** true = o motor pode mandar a pergunta agora (comportamento seguro). */
  perguntarAgora: boolean;
}

/** Converte as respostas da Jev. Ausente/'agora'/ambíguo = PERGUNTAR (fail-safe). */
export function vereditoDePerguntaDoFluxoDaJev(respostas: RespostasDeJev): VereditoDePerguntaDoFluxo {
  const a = respostas.pergunta_do_fluxo;
  const esperar = a?.type === 'choice' && a.choice === ESPERAR;
  return { perguntarAgora: !esperar };
}
