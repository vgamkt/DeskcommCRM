/**
 * Rota da base de conhecimento pela Jev (ponto `knowledge_route`).
 *
 * Decide QUAIS materiais são relevantes para a pergunta e o top-K. Devolve `null`
 * quando a Jev não está ligada / não respondeu (o chamador usa a lista inteira e o
 * top-K padrão). Nunca lança.
 */
import type pg from 'pg';

import { decidir } from '../../ai/jev';
import { enfileirarDecisaoJev } from '../../ai/jev/outbox';
import {
  perguntasDeConhecimentoDeJev,
  rotaDeConhecimentoDaJev,
  type MaterialParaJev,
} from '../../ai/jev/pontos/knowledge';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import type { Logger } from '../obs/logger';

export async function rotearConhecimentoComJev(
  db: pg.Pool,
  tenantId: string,
  args: { pergunta: string; materialIds: readonly string[]; topKPadrao: number },
  log: Logger,
): Promise<{ materialIds: string[]; topK: number } | null> {
  if (args.materialIds.length === 0) return null;
  try {
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'knowledge_route');
    if (alvos.length === 0) return null;

    // Nomes/tipos dos materiais (contexto para a Jev escolher).
    const { rows } = await db.query<{
      id: string;
      name: string | null;
      source_type: string | null;
      source_metadata: { indice?: { resumo?: string } } | null;
    }>(
      `select id, name, source_type, source_metadata from ai_knowledge_sources
        where organization_id = $1 and id = any($2::uuid[])`,
      [tenantId, [...args.materialIds]],
    );
    const materiais: MaterialParaJev[] = rows.map((r) => {
      const resumo = r.source_metadata?.indice?.resumo;
      return {
        id: r.id,
        name: r.name ?? r.id.slice(0, 8),
        sourceType: r.source_type ?? undefined,
        // ÍNDICE (Fase 1): o resumo do conteúdo é o que faz a Jev escolher certo.
        ...(typeof resumo === 'string' && resumo.trim() !== '' ? { resumo } : {}),
      };
    });
    if (materiais.length === 0) return null;

    const decisao = await decidir({
      alvos,
      state: { pergunta: args.pergunta, materiais: materiais.map((m) => ({ nome: m.name, tipo: m.sourceType })) },
      questions: perguntasDeConhecimentoDeJev(materiais),
      opcoes: {
        aoTentar: (info) =>
          log.info('knowledge-route: tentativa da Jev', {
            provider: info.provider,
            tentativa: info.tentativa,
            ok: info.respostaOk,
            motivo: info.motivo ?? null,
          }),
      },
      aoEsgotar: (info) =>
        enfileirarDecisaoJev(db, {
          organizationId: tenantId,
          point: 'knowledge_route',
          ...info,
        }),
    });
    if (decisao === null) return null;
    const rota = rotaDeConhecimentoDaJev(decisao.respostas, materiais, args.topKPadrao);
    // A Jev pode escolher NENHUM material (entrada vaga, ex.: "bom dia"). Devolvemos
    // a rota CRUA (vazia = "nada") e cada chamador decide: a TOOL deixa amplo
    // (busca tudo); o CONHECIMENTO NO TURNO NÃO injeta (o gate da opção b).
    log.info('knowledge-route: a Jev escolheu', {
      materiais: rota.materialIds.length,
      de: materiais.length,
      topK: rota.topK,
    });
    return rota;
  } catch {
    return null;
  }
}
