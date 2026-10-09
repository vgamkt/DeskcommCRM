/**
 * Mapeamento do ponto `promise_semantic` para a Jev.
 *
 * O QUE A JEV DECIDE: a mensagem candidata do vendedor contém uma PROMESSA/
 * COMPROMISSO em texto livre que a validação de valores estruturados NÃO pega?
 * (ex.: "faço de graça", "garanto entrega amanhã"). Ela devolve sim/não; a FRASE
 * suspeita (texto) continua vindo do caminho de chat quando houver veto — a Jev
 * não devolve texto livre.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';
import type { PromiseClassification } from '../../../agent-engine/guardrails/promise/semantic';

const LIMIAR_NOUL = 0.5;

export const PROMESSA_SIM = 'promessa';
export const PROMESSA_NAO = 'sem_promessa';

/**
 * Pergunta `choice` da Jev: a mensagem contém promessa/compromisso fora do playbook?
 * (As armadilhas de slogan entram no descritivo para a Jev não errar.)
 */
export function perguntaDePromessaJev(): PerguntasDeJev {
  return {
    promessa: {
      type: 'choice',
      instructions:
        'A MENSAGEM que o vendedor quer enviar contém uma PROMESSA/COMPROMISSO NOVO, criado pela ' +
        'própria IA, em texto livre? Ex.: gratuidade/cortesia/brinde, isentar taxa, desconto ou ' +
        'condição especial, prazo de entrega concreto, resolver pessoalmente até um prazo. ' +
        'NÃO contam: slogans genéricos ("garantimos qualidade", "entrega rápida"); perguntas, ' +
        'saudações e próximos passos vagos. ' +
        'IMPORTANTE — NÃO é promessa REPASSAR um FATO/POLÍTICA já estabelecido da loja (costuma vir ' +
        'da base de conhecimento): "a moto tem 90 dias de garantia da loja", "a garantia cobre a ' +
        'moto como um todo", "a entrega é feita por transportadora parceira", "a garantia segue o ' +
        'CDC". Isso é INFORMAÇÃO, não compromisso novo — marque sem_promessa.',
      criteria: {
        [PROMESSA_SIM]: 'contém promessa/compromisso NOVO criado pela IA',
        [PROMESSA_NAO]:
          'NÃO contém promessa nova (fato/política da loja, pergunta, saudação, slogan, passo vago)',
      },
    },
  };
}

/** Converte a resposta da Jev no veredito binário (suspectPhrase vem do chat, se houver). */
export function promessaDaRespostaDeJev(respostas: RespostasDeJev): PromiseClassification {
  const a = respostas.promessa;
  const escolha = a?.type === 'choice' ? a.choice : '';
  const isPromise = escolha === PROMESSA_SIM;
  return { isPromise, suspectPhrase: null };
}

/** Só para os testes de fidelidade com o limiar. */
export function ehPromessa(respostas: RespostasDeJev): boolean {
  void LIMIAR_NOUL;
  return promessaDaRespostaDeJev(respostas).isPromise;
}
