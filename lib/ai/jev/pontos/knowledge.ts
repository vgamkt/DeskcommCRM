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
  /**
   * RESUMO do conteúdo (índice do acervo, Fase 1) — é o que faz a Jev escolher
   * com ACERTO em vez de adivinhar pelo nome. Cortado p/ caber no contexto dela.
   */
  resumo?: string | undefined;
}

/** Teto do resumo que vai ao contexto da Jev (por material). */
const RESUMO_MAX = 280;

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
    const conteudo = m.resumo ? ` O que ele contém: ${m.resumo.slice(0, RESUMO_MAX)}` : '';
    perguntas[`usar_${i}`] = {
      type: 'noul',
      instructions:
        `Para responder ao cliente AGORA, o material "${m.name}"${tipo} RESPONDE DIRETAMENTE à ` +
        `pergunta dele? Marque SIM só quando ele for útil para ESTA resposta; na dúvida ou em ` +
        `saudação/assunto vago, marque NÃO.${conteudo}`,
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

/**
 * Teto de materiais na rota. Em entrada VAGA ("bom dia") a Jev `noul` marcava TUDO
 * (medido 2026-10-07: 19/19) — o que polui a busca. Aqui ficamos com os mais
 * pontuados, no máximo este teto.
 */
const MAX_MATERIAIS = 4;

/** Converte as respostas da Jev na rota (materiais + top-K). */
export function rotaDeConhecimentoDaJev(
  respostas: RespostasDeJev,
  materiais: readonly MaterialParaJev[],
  topKPadrao: number,
): RotaDeConhecimento {
  const candidatos: Array<{ id: string; score: number }> = [];
  materiais.slice(0, 30).forEach((m, i) => {
    const a = respostas[`usar_${i}`];
    if (a?.type === 'noul' && typeof a.noul === 'number' && a.noul > LIMIAR_NOUL) {
      candidatos.push({ id: m.id, score: a.noul });
    }
  });
  // CAP pelos mais pontuados: um "sim" para tudo não vira busca em tudo.
  candidatos.sort((a, b) => b.score - a.score);
  const materialIds = candidatos.slice(0, MAX_MATERIAIS).map((c) => c.id);
  const score = respostas.topk;
  const idx =
    score?.type === 'score' && typeof score.score === 'number'
      ? Math.min(OPCOES_TOP_K.length - 1, Math.max(0, Math.round(score.score)))
      : -1;
  return { materialIds, topK: idx >= 0 ? OPCOES_TOP_K[idx]! : topKPadrao };
}
