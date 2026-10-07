/**
 * A decisão de OFERECER MOTOS pela Jev (ponto `offer_motos`). Devolve o veredito
 * ou `null` (Jev desligada/indisponível → o chamador usa a régua de regex). Nunca
 * lança.
 */
import type pg from 'pg';

import { decidir } from '../../ai/jev';
import { enfileirarDecisaoJev } from '../../ai/jev/outbox';
import {
  perguntaDeOfertaJev,
  vereditoDeOfertaDaJev,
  type ContextoDeOferta,
  type VereditoDeOferta,
} from '../../ai/jev/pontos/oferta';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import type { RespostasDeJev } from '../../ai/jev/tipos';
import type { Logger } from '../obs/logger';

export async function decidirOfertaComJev(
  db: pg.Pool,
  tenantId: string,
  ctx: ContextoDeOferta,
  log: Logger,
  /** Veredito JÁ obtido pelo ÁRBITRO DE TURNO — usa direto, sem ir à Jev de novo. */
  respostasProntas?: RespostasDeJev,
): Promise<VereditoDeOferta | null> {
  try {
    if (respostasProntas !== undefined) {
      const v = vereditoDeOfertaDaJev(respostasProntas);
      log.info('offer-motos: a Jev decidiu (árbitro)', { oferecer: v.oferecer, criterio: v.criterio });
      return v;
    }
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'offer_motos');
    if (alvos.length === 0) return null;
    const decisao = await decidir({
      alvos,
      state: ctx,
      questions: perguntaDeOfertaJev(ctx),
      opcoes: {
        aoTentar: (info) =>
          log.info('offer-motos: tentativa da Jev', {
            provider: info.provider,
            tentativa: info.tentativa,
            ok: info.respostaOk,
            motivo: info.motivo ?? null,
          }),
      },
      aoEsgotar: (info) =>
        enfileirarDecisaoJev(db, { organizationId: tenantId, point: 'offer_motos', ...info }),
    });
    if (decisao === null) return null;
    const v = vereditoDeOfertaDaJev(decisao.respostas);
    log.info('offer-motos: a Jev decidiu', { oferecer: v.oferecer, criterio: v.criterio });
    return v;
  } catch {
    return null;
  }
}
