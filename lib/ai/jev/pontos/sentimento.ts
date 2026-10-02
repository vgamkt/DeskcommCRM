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
        'Qual o clima/sentimento do cliente nesta mensagem, do mais negativo (índice 0) ao mais positivo?',
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
