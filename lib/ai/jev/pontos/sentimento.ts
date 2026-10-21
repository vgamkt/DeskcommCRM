/**
 * Mapeamento do ponto `sentiment_classify` para a Jev (Fase 2).
 *
 * O worker de sentimento quer uma nota 0–1 (`sentiment_score`). A Jev responde
 * `score` numa escala ORDENADA — aqui, 5 níveis do mais negativo ao mais
 * positivo —, então normalizamos `score / (níveis - 1)` para 0–1.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export const NIVEIS_DE_SENTIMENTO = [
  'muito negativo (irritado, reclamação dura)',
  'negativo (insatisfeito)',
  'neutro (informativo, sem carga)',
  'positivo (satisfeito)',
  'muito positivo (entusiasmado)',
] as const;

/** Pergunta `score` da Jev para o clima da mensagem. */
export function perguntaDeSentimentoDeJev(): PerguntasDeJev {
  return {
    sentimento: {
      type: 'score',
      instructions:
        'Qual o clima/sentimento do CLIENTE, considerando a CONVERSA (o contexto recente, no ' +
        'campo "conversa") E a mensagem atual (no campo "mensagem"), do mais negativo (índice 0) ' +
        'ao mais positivo? IMPORTANTE: julgue pelo CONTEXTO — uma mensagem curta/seca ("deixa a Biz ' +
        'de lado, quero trilha", "pode mostrar") NÃO é negativa se a conversa está normal; só é ' +
        'negativa com insatisfação, reclamação ou irritação reais. ' +
        'A MENSAGEM ATUAL PREVALECE sobre o histórico: se ela é um pedido neutro ou positivo ' +
        '("quero ver mais opções", "me mostra outras motos", "tem uma Lander?", "qual o preço?", ' +
        '"pode mostrar", "quero financiar"), dê NO MÍNIMO neutro (índice 2), mesmo que mensagens ' +
        'anteriores tenham reclamado de preço — a reclamação antiga já foi respondida e não ' +
        'contamina o pedido novo. Só abaixe para negativo (0 ou 1) quando a PRÓPRIA mensagem atual ' +
        'expressar insatisfação, reclamação, irritação ou desistência.',
      criteria: [...NIVEIS_DE_SENTIMENTO],
    },
  };
}

/** Normaliza o `score` da Jev (0..níveis-1) para a nota 0–1 do worker. */
export function sentimentoDaRespostaDeJev(respostas: RespostasDeJev): number | null {
  const a = respostas.sentimento;
  if (!a || a.type !== 'score' || typeof a.score !== 'number') return null;
  const max = NIVEIS_DE_SENTIMENTO.length - 1;
  if (max <= 0) return null;
  return Math.max(0, Math.min(1, a.score / max));
}
