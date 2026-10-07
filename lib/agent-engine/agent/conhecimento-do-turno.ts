/**
 * CONHECIMENTO NO TURNO (Fase 2) — a ENTREGA determinística do acervo ao modelo.
 *
 * O defeito medido (2026-10-07): a Jev ROTEIA o acervo (`knowledge_route`) mas quem
 * buscava era o MODELO, via tool — e ele NÃO chama. O roteamento ia para o lixo e o
 * material (objeções com resposta + guardrail) nunca entrava.
 *
 * A divisão (opção b, aprovada pelo dono):
 *  - a JEV DECIDE → quais fontes (pelo ÍNDICE) + o top-K;
 *  - o MOTOR ENTREGA → embeda, busca o top-K SÓ nas escolhidas, filtra por LIMIAR;
 *  - o MODELO CONFERE E USA → só o que responde, e CITA o [ID] (auditável).
 *
 * Inerte por padrão: quem decide ligar é a flag `KB_NO_TURNO` (ver inbound-turn).
 * Nunca lança: falha de acervo não pode derrubar o turno.
 */
import type pg from 'pg';

import { embedText } from '@/lib/ai/embed';
import type { Logger } from '../obs/logger';
import { rotearConhecimentoComJev } from './knowledge-route-jev';

/** Um trecho entregue ao modelo, com o id do chunk e a fonte. */
export interface TrechoDeConhecimento {
  id: string;
  fonte: string;
  texto: string;
  sim: number;
}

/** Sem piso no banco: pedimos os K melhores e cortamos pelo LIMIAR aqui. */
const PISO_SIMILARIDADE = 0;
const TOPK_MAX = 8;

const noop: Logger = { info: () => {}, warn: () => {} } as unknown as Logger;

/**
 * Monta os trechos do turno: a Jev escolhe as fontes → o motor busca o top-K nas
 * escolhidas → filtra por `limiar`. Devolve `[]` quando não há nada acima do limiar
 * ("não achou, não injeta"). Nunca lança.
 */
export async function montarConhecimentoDoTurno(
  db: pg.Pool,
  organizationId: string,
  args: {
    pergunta: string;
    fontes: readonly string[];
    topK: number;
    limiar: number;
    log?: Logger;
  },
): Promise<TrechoDeConhecimento[]> {
  try {
    if (args.fontes.length === 0 || args.pergunta.trim() === '') return [];

    // 1) A JEV escolhe as fontes (pelo índice). Sem ela/rota, usa TODAS (fallback).
    const rota = await rotearConhecimentoComJev(
      db,
      organizationId,
      { pergunta: args.pergunta, materialIds: args.fontes, topKPadrao: args.topK },
      args.log ?? noop,
    );
    const fontes = rota?.materialIds ?? [...args.fontes];
    const k = Math.max(1, Math.min(rota?.topK ?? args.topK, TOPK_MAX));

    // 2) O MOTOR embeda e busca o top-K nas fontes escolhidas.
    const { embedding, model } = await embedText(args.pergunta, {
      organizationId,
      ponto: 'embedding_consultar',
    });
    const vec = `[${embedding.join(',')}]`;
    const { rows } = await db.query<{
      chunk_id: string;
      source_name: string | null;
      content: string | null;
      similarity: number;
    }>(
      `select chunk_id, source_name, content, similarity
         from fn_buscar_trechos_das_fontes($1, $2::uuid[], $3::vector, $4, $5, $6)`,
      [organizationId, fontes, vec, k, PISO_SIMILARIDADE, model],
    );

    // 3) O LIMIAR é o portão final: abaixo dele, não injeta.
    return rows
      .filter((r) => Number(r.similarity) >= args.limiar)
      .map((r) => ({
        id: String(r.chunk_id),
        fonte: String(r.source_name ?? ''),
        texto: String(r.content ?? '').replace(/\s+/g, ' ').trim(),
        sim: Number(r.similarity),
      }))
      .filter((t) => t.texto !== '');
  } catch {
    return [];
  }
}

/**
 * Renderiza o bloco de FATOS com o contrato de CONFERÊNCIA + CITAÇÃO. O modelo NÃO
 * decide a busca (isso é da Jev); ele só usa o que responde e cita o [ID].
 */
export function renderBlocoDeConhecimento(trechos: readonly TrechoDeConhecimento[]): string {
  if (trechos.length === 0) return '';
  return [
    '## Base de conhecimento (fatos) — CONFIRA antes de usar',
    '- Use SOMENTE os trechos abaixo que RESPONDEM à pergunta do cliente.',
    '- Se nenhum servir, IGNORE e responda com o que você já sabe — NUNCA invente fato.',
    '- Ao usar um trecho, CITE o [ID] dele no campo `fonte_ids` (ex.: ["PRE-002"]).',
    'Trechos:',
    ...trechos.map((t) => `- (${t.fonte}) ${t.texto}`),
  ].join('\n');
}
