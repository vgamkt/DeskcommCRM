/**
 * DEGRAU 2 — a categoria do modelo citado pela JEV (quando a referência `modelos`
 * não tem o dado). Escolha FECHADA sobre as categorias reais do catálogo. Nunca lança.
 */
import type pg from 'pg';

import { decidir } from '../../ai/jev';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import { perguntaDeCategoriaDeModeloJev, categoriaDoModeloDaJev } from '../../ai/jev/pontos/modelo-categoria';
import type { Logger } from '../obs/logger';

export async function categoriaDoModeloComJev(
  db: pg.Pool,
  tenantId: string,
  modelo: string,
  categorias: readonly string[],
  log: Logger,
): Promise<string | null> {
  try {
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'modelo_categoria');
    if (alvos.length === 0) return null;
    const decisao = await decidir({
      alvos,
      state: { modelo, categorias },
      questions: perguntaDeCategoriaDeModeloJev(categorias, modelo),
      perguntasObrigatorias: ['categoria'],
      opcoes: {
        aoTentar: (info) =>
          log.info('modelo_categoria: tentativa da Jev', {
            provider: info.provider,
            tentativa: info.tentativa,
            ok: info.respostaOk,
            motivo: info.motivo ?? null,
          }),
      },
    });
    if (decisao === null) return null;
    const v = categoriaDoModeloDaJev(decisao.respostas);
    log.info('modelo_categoria: a Jev decidiu', { modelo, categoria: v.categoria });
    return v.categoria;
  } catch {
    return null;
  }
}
