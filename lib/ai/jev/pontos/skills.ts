/**
 * Mapeamento do ponto `skill_select` para a Jev.
 *
 * O QUE A JEV DECIDE: quais SKILLS ativas casam o turno. Hoje o matcher é
 * determinístico por keyword (`skills.ts:matchSkills`) — ele traz corpo de skill
 * a mais (ruído) ou de menos (perde a situação). A Jev lê o SINAL do turno e o
 * catálogo de skills (nome + descrição + palavras-chave) e escolhe, UMA A UMA,
 * quais devem entrar. O LLM comum recebe só os corpos certos — resposta mais
 * certeira.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

const LIMIAR_NOUL = 0.5;

/** O que a Jev precisa saber de cada skill. */
export interface SkillParaJev {
  name: string;
  description: string;
  /** Palavras-chave do matcher determinístico (contexto para a Jev). */
  keywords: readonly string[];
}

/** Monta as perguntas da Jev: `usar_<i>` (noul) por skill. */
export function perguntasDeSkillsDeJev(skills: readonly SkillParaJev[]): PerguntasDeJev {
  const perguntas: PerguntasDeJev = {};
  skills.slice(0, 40).forEach((s, i) => {
    const kws = s.keywords.length > 0 ? ` (palavras-chave: ${s.keywords.join(', ')})` : '';
    perguntas[`usar_${i}`] = {
      type: 'noul',
      instructions:
        `O turno atual aciona a skill "${s.name}" — ${s.description}${kws}? ` +
        `Responda SIM só se a situação do cliente casa com o propósito desta skill ` +
        `(não basta uma palavra solta em comum).`,
    };
  });
  return perguntas;
}

/** Converte as respostas da Jev nos NOMES das skills escolhidas. */
export function skillsEscolhidasDaJev(
  respostas: RespostasDeJev,
  skills: readonly SkillParaJev[],
): string[] {
  const out: string[] = [];
  skills.slice(0, 40).forEach((s, i) => {
    const a = respostas[`usar_${i}`];
    if (a?.type === 'noul' && typeof a.noul === 'number' && a.noul > LIMIAR_NOUL) {
      out.push(s.name);
    }
  });
  return out;
}
