/**
 * VERIFICAÇÃO DE NARRAÇÃO PELA JEV (Fase 2-B / narração).
 *
 * Roda DEPOIS que o redator escreve a mensagem final: a Jev confere se o texto é
 * FALA AO CLIENTE ou NARRAÇÃO INTERNA (bastidor/outro idioma/relato a terceiro).
 * - `true`  → é narração → o chamador devolve erro-de-ensino (a IA reescreve);
 * - `false` → é mensagem → passa normal;
 * - `null`  → Jev indisponível/sem binding → o chamador NÃO bloqueia (segue).
 *
 * Substitui a regex `internal_vocabulary` como DECISOR. Nunca lança.
 */
import type pg from 'pg';

import { decidir } from '../../ai/jev';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import { perguntaDeNarracaoJev, vereditoDeNarracaoDaJev } from '../../ai/jev/pontos/narracao';
import type { Logger } from '../obs/logger';

export async function verificarNarracaoComJev(
  db: pg.Pool,
  tenantId: string,
  texto: string,
  log: Logger,
): Promise<boolean | null> {
  try {
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'narracao');
    if (alvos.length === 0) return null;
    const decisao = await decidir({
      alvos,
      state: { texto },
      questions: perguntaDeNarracaoJev(),
      perguntasObrigatorias: ['narracao'],
      opcoes: {
        aoTentar: (info) =>
          log.info('narracao: tentativa da Jev', {
            provider: info.provider,
            tentativa: info.tentativa,
            ok: info.respostaOk,
            motivo: info.motivo ?? null,
          }),
      },
    });
    if (decisao === null) return null;
    const v = vereditoDeNarracaoDaJev(decisao.respostas);
    log.info('narracao: a Jev decidiu', { ehNarracao: v.ehNarracao });
    return v.ehNarracao;
  } catch {
    return null;
  }
}
