/**
 * Seleção de SKILLS pela Jev (ponto `skill_select`). Devolve os NOMES escolhidos,
 * ou `null` quando a Jev não está ligada / não respondeu (o chamador cai no
 * matcher determinístico). Nunca lança.
 */
import type pg from 'pg';

import { decidir } from '../../ai/jev';
import { enfileirarDecisaoJev } from '../../ai/jev/outbox';
import {
  perguntasDeSkillsDeJev,
  skillsEscolhidasDaJev,
  type SkillParaJev,
} from '../../ai/jev/pontos/skills';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import type { Logger } from '../obs/logger';

/** Só o que a Jev usa de uma skill (evita acoplar ao tipo `LoadedSkill`). */
interface SkillMinima {
  name: string;
  description: string;
  matcher: { any_keywords?: readonly string[] };
}

export async function selecionarSkillsComJev(
  db: pg.Pool,
  tenantId: string,
  args: { mensagens: string; skills: readonly SkillMinima[]; excluidas: string },
  log: Logger,
): Promise<string[] | null> {
  if (args.skills.length === 0) return null;
  try {
    const alvos = await alvosDeJevDaOrg(db, tenantId, 'skill_select');
    if (alvos.length === 0) return null;

    const paraJev: SkillParaJev[] = args.skills.map((s) => ({
      name: s.name,
      description: s.description,
      keywords: s.matcher.any_keywords ?? [],
    }));
    const decisao = await decidir({
      alvos,
      state: { sinal: args.mensagens, mensagem_atual: args.excluidas },
      questions: perguntasDeSkillsDeJev(paraJev),
      opcoes: {
        aoTentar: (info) =>
          log.info('skill-select: tentativa da Jev', {
            provider: info.provider,
            tentativa: info.tentativa,
            ok: info.respostaOk,
            motivo: info.motivo ?? null,
          }),
      },
      aoEsgotar: (info) =>
        enfileirarDecisaoJev(db, { organizationId: tenantId, point: 'skill_select', ...info }),
    });
    if (decisao === null) return null;
    const escolhidas = skillsEscolhidasDaJev(decisao.respostas, paraJev);
    log.info('skill-select: a Jev escolheu', {
      total: paraJev.length,
      escolhidas,
    });
    return escolhidas;
  } catch {
    return null;
  }
}
