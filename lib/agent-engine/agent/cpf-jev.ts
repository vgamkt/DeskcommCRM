/**
 * Chamada da JEV para o ponto `cpf` — usada quando há uma confirmação de CPF
 * pendente. Se não houver binding/veredito, devolve `null` e o motor cai no
 * classificador determinístico (fallback), como nos outros pontos.
 */
import type pg from 'pg';

import { decidir } from '@/lib/ai/jev';
import { alvosDeJevDaOrg } from '@/lib/ai/jev/resolver';
import { perguntaDeDecisaoCpf, decisaoCpfDaJev } from '@/lib/ai/jev/pontos/cpf';
import type { DecisaoCpf } from '@/lib/followup/cpf';

import type { Logger } from '../obs/logger';

export async function decidirCpfComJev(
  db: pg.Pool,
  tenantId: string,
  ctx: { mensagem: string; candidato: string; formatado: string; motivo: string },
  log?: Logger,
): Promise<DecisaoCpf | null> {
  try {
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'cpf');
    if (alvos.length === 0) return null;
    const decisao = await decidir({
      alvos,
      state: {
        mensagem: ctx.mensagem,
        candidato: ctx.candidato,
        formatado: ctx.formatado,
        motivo: ctx.motivo,
      },
      questions: perguntaDeDecisaoCpf(ctx),
      perguntasObrigatorias: ['cpf'],
    });
    if (decisao === null) return null;
    return decisaoCpfDaJev(decisao.respostas);
  } catch (err) {
    log?.warn('cpf: decisão da Jev falhou — usando fallback determinístico', {
      error: err instanceof Error ? err.message.slice(0, 160) : 'erro',
    });
    return null;
  }
}
