/**
 * A decisão da NEGOCIAÇÃO pela Jev (ponto `negociacao`). Devolve a ação do turno
 * ou `null` (Jev desligada/indisponível → o chamador usa a fase por regex).
 * Nunca lança.
 */
import type pg from 'pg';

import { decidir } from '../../ai/jev';
import { enfileirarDecisaoJev } from '../../ai/jev/outbox';
import {
  acaoDaNegociacaoJev,
  perguntaDeNegociacaoJev,
  type AcaoNegociacao,
  type ContextoDeNegociacao,
} from '../../ai/jev/pontos/negociacao';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import type { Logger } from '../obs/logger';

export async function decidirNegociacaoComJev(
  db: pg.Pool,
  tenantId: string,
  ctx: ContextoDeNegociacao,
  log: Logger,
): Promise<{ acao: AcaoNegociacao; pedirValor: boolean } | null> {
  try {
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'negociacao');
    if (alvos.length === 0) return null;
    const decisao = await decidir({
      alvos,
      state: ctx,
      questions: perguntaDeNegociacaoJev(ctx),
      opcoes: {
        aoTentar: (info) =>
          log.info('negociacao: tentativa da Jev', {
            provider: info.provider,
            tentativa: info.tentativa,
            ok: info.respostaOk,
            motivo: info.motivo ?? null,
          }),
      },
      aoEsgotar: (info) =>
        enfileirarDecisaoJev(db, { organizationId: tenantId, point: 'negociacao', ...info }),
    });
    if (decisao === null) return null;
    const r = acaoDaNegociacaoJev(decisao.respostas);
    log.info('negociacao: a Jev decidiu', { acao: r.acao, pedirValor: r.pedirValor });
    return r;
  } catch {
    return null;
  }
}

/** Mapeia a ação da Jev para a FASE do bloco (`renderBlocoObjecao`). */
export function faseDaAcao(acao: AcaoNegociacao):
  | 'persuadir'
  | 'persuadir2'
  | 'oferecer'
  | 'mostrar'
  | 'handoff'
  | 'encaminhar' {
  switch (acao) {
    case 'persuadir_1':
      return 'persuadir';
    case 'persuadir_2':
      return 'persuadir2';
    case 'persuadir_3_e_perguntar':
      return 'oferecer';
    case 'mostrar_opcoes':
      return 'mostrar';
    // Negou as opções: avisa o responsável e SEGUE atendendo (não silencia).
    case 'encaminhar_e_encerrar':
      return 'encaminhar';
    case 'handoff':
      return 'handoff';
  }
}
