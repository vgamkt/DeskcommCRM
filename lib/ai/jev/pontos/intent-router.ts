/**
 * Mapeamento do ponto `intent_router` para a Jev (Fase 6).
 *
 * O roteador decide para QUAL agente o turno vai, pela INTENÇÃO da mensagem. É
 * uma escolha única entre as intenções dos membros do router (ou `none`). A Jev
 * devolve a intenção + `confidence`. O chamador continua dono do roteamento.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

/** O mínimo que a Jev precisa de cada membro do router. */
export interface MembroParaJev {
  intentName: string;
  intentDescription: string;
  examples: string[];
}

export const INTENCAO_NENHUMA = 'none';

/** Pergunta `choice` da Jev: a intenção da mensagem, ou `none`. */
export function perguntaDeIntencaoDeJev(members: readonly MembroParaJev[]): PerguntasDeJev {
  const criteria: Record<string, string> = {
    [INTENCAO_NENHUMA]: 'nenhuma das intenções acima se aplica',
  };
  for (const m of members) {
    const exemplos = m.examples.length > 0 ? ` (ex.: ${m.examples.join('; ')})` : '';
    criteria[m.intentName] = `${m.intentDescription}${exemplos}`;
  }
  return {
    intencao: {
      type: 'choice',
      instructions:
        'Qual é a intenção PRINCIPAL do lead? Analise TODO o contexto abaixo — pode haver VÁRIAS ' +
        'mensagens em sequência (rajada) e mais de uma dúvida/pedido juntos; escolha a intenção ' +
        'que melhor resume o que ele quer AGORA. Se nenhuma se aplica, escolha "none".',
      criteria,
    },
  };
}

/** Veredito da Jev: intenção escolhida (ou null) + confiança. */
export function vereditoDaRespostaDeJev(
  respostas: RespostasDeJev,
): { intentName: string | null; confidence: number } | null {
  const a = respostas.intencao;
  if (!a || a.type !== 'choice' || typeof a.choice !== 'string') return null;
  const escolhido = a.choice.trim();
  const confidence = typeof a.confidence === 'number' ? a.confidence : 0;
  if (escolhido === '' || escolhido.toLowerCase() === INTENCAO_NENHUMA) {
    return { intentName: null, confidence };
  }
  return { intentName: escolhido, confidence };
}
