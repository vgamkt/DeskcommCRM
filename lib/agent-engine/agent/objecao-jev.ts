/**
 * A decisão de OBJEÇÃO (existência + tipo) pela Jev (ponto `objecao`). Devolve o
 * veredito ou `null` (Jev desligada/indisponível → o chamador usa `ehObjecaoValor`/
 * `motivoDaObjecao` como fallback). Nunca lança.
 */
import type pg from 'pg';

import { decidir } from '../../ai/jev';
import { enfileirarDecisaoJev } from '../../ai/jev/outbox';
import {
  perguntaDeObjecaoJev,
  vereditoDeObjecaoDaJev,
  type ContextoDeObjecao,
  type VereditoDeObjecao,
} from '../../ai/jev/pontos/objecao';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import type { RespostasDeJev } from '../../ai/jev/tipos';
import type { Logger } from '../obs/logger';

export async function decidirObjecaoComJev(
  db: pg.Pool,
  tenantId: string,
  ctx: ContextoDeObjecao,
  log: Logger,
  /** Veredito JÁ obtido pelo ÁRBITRO DE TURNO — usa direto, sem ir à Jev de novo. */
  respostasProntas?: RespostasDeJev,
): Promise<VereditoDeObjecao | null> {
  try {
    if (respostasProntas !== undefined) {
      const v = vereditoDeObjecaoDaJev(respostasProntas);
      log.info('objecao: a Jev decidiu (árbitro)', { ehObjecao: v.ehObjecao, motivo: v.motivo });
      return v;
    }
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'objecao');
    if (alvos.length === 0) return null;
    const decisao = await decidir({
      alvos,
      state: ctx,
      questions: perguntaDeObjecaoJev(ctx),
      opcoes: {
        aoTentar: (info) =>
          log.info('objecao: tentativa da Jev', {
            provider: info.provider,
            tentativa: info.tentativa,
            ok: info.respostaOk,
            motivo: info.motivo ?? null,
          }),
      },
      aoEsgotar: (info) =>
        enfileirarDecisaoJev(db, { organizationId: tenantId, point: 'objecao', ...info }),
    });
    if (decisao === null) return null;
    const v = vereditoDeObjecaoDaJev(decisao.respostas);
    log.info('objecao: a Jev decidiu', { ehObjecao: v.ehObjecao, motivo: v.motivo });
    return v;
  } catch {
    return null;
  }
}
