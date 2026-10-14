/**
 * G3.7 — a JEV decide se a pergunta do roteiro sai NESTE turno.
 *
 * Substitui a decisão do motor (a "trava"): quando o binding `pergunta_do_fluxo__jev`
 * existe, a Jev decide; sem binding/erro → `null` e o motor cai no comportamento de
 * sempre (reenviar). Nunca lança.
 */
import type pg from 'pg';

import { decidir } from '../../ai/jev';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import {
  perguntaDaPerguntaDoFluxoJev,
  vereditoDePerguntaDoFluxoDaJev,
} from '../../ai/jev/pontos/pergunta-do-fluxo';
import type { Logger } from '../obs/logger';

export async function decidirPerguntaDoFluxoComJev(
  db: pg.Pool,
  tenantId: string,
  entrada: { pergunta: string; falaDoCliente: string },
  log: Logger,
): Promise<boolean | null> {
  try {
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'pergunta_do_fluxo');
    if (alvos.length === 0) return null;
    const decisao = await decidir({
      alvos,
      state: { pergunta: entrada.pergunta, falaDoCliente: entrada.falaDoCliente },
      questions: perguntaDaPerguntaDoFluxoJev(entrada.pergunta, entrada.falaDoCliente),
      perguntasObrigatorias: ['pergunta_do_fluxo'],
      opcoes: {
        aoTentar: (info) =>
          log.info('pergunta_do_fluxo: tentativa da Jev', {
            provider: info.provider,
            tentativa: info.tentativa,
            ok: info.respostaOk,
            motivo: info.motivo ?? null,
          }),
      },
    });
    if (decisao === null) return null;
    const v = vereditoDePerguntaDoFluxoDaJev(decisao.respostas);
    log.info('pergunta_do_fluxo: a Jev decidiu', { perguntarAgora: v.perguntarAgora });
    return v.perguntarAgora;
  } catch {
    return null;
  }
}
