/**
 * Mapeamento do ponto `knowledge_route` para a Jev.
 *
 * O QUE A JEV DECIDE: para a pergunta do cliente, QUAIS materiais (segmentos) da
 * base de conhecimento são relevantes e QUANTOS trechos (top-K). A busca por
 * embedding continua — mas no material certo, com menos ruído, para o LLM comum
 * responder mais certeiro.
 *
 * A Jev não devolve texto: ela escolhe, por material, "usar/não" (noul), e o
 * top-K numa escala ordenada. Módulo PURO (sem env, sem rede).
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

const LIMIAR_NOUL = 0.5;

/** Um material da base de conhecimento que a Jev pode escolher. */
export interface MaterialParaJev {
  id: string;
  name: string;
  /** Tipo do material (ex.: pdf, site, texto) — contexto para a Jev. */
  sourceType?: string | undefined;
}

/** Faixas de top-K (o LLM recebe um número de trechos). */
export const OPCOES_TOP_K = [3, 5, 8, 12] as const;

export interface RotaDeConhecimento {
  materialIds: string[];
  topK: number;
}

/** Monta as perguntas da Jev: `usar_<i>` por material + `topk` (score). */
export function perguntasDeConhecimentoDeJev(
  materiais: readonly MaterialParaJev[],
): PerguntasDeJev {
  const perguntas: PerguntasDeJev = {};
  materiais.slice(0, 30).forEach((m, i) => {
    const tipo = m.sourceType ? ` (${m.sourceType})` : '';
    perguntas[`usar_${i}`] = {
      type: 'noul',
      instructions: `Para responder ao cliente, vale consultar o material "${m.name}"${tipo}?`,
    };
  });
  // top-K: escala ORDENADA (0 = poucos, 3 = muitos). O motor mapeia para OPCOES_TOP_K.
  perguntas.topk = {
    type: 'score',
    instructions:
      'Quantos trechos da base são necessários para responder? 0 = poucos (3), 3 = muitos (12). ',
    criteria: ['poucos (3)', 'alguns (5)', 'vários (8)', 'muitos (12)'],
  };
  return perguntas;
}

/** Converte as respostas da Jev na rota (materiais + top-K). */
export function rotaDeConhecimentoDaJev(
  respostas: RespostasDeJev,
  materiais: readonly MaterialParaJev[],
  topKPadrao: number,
): RotaDeConhecimento {
  const materialIds: string[] = [];
  materiais.slice(0, 30).forEach((m, i) => {
    const a = respostas[`usar_${i}`];
    if (a?.type === 'noul' && typeof a.noul === 'number' && a.noul > LIMIAR_NOUL) {
      materialIds.push(m.id);
    }
  });
  const score = respostas.topk;
  const idx =
    score?.type === 'score' && typeof score.score === 'number'
      ? Math.min(OPCOES_TOP_K.length - 1, Math.max(0, Math.round(score.score)))
      : -1;
  return { materialIds, topK: idx >= 0 ? OPCOES_TOP_K[idx]! : topKPadrao };
}
