/**
 * Mapeamento do ponto `flywheel_judge` para a Jev (Fase 3).
 *
 * O juiz de higiene de memória decide UM veredito: `yes` (higiene ok), `no`
 * (fato durável perdido) ou `unknown`. É uma decisão tipada — a Jev devolve o
 * rótulo direto. O `missing_facts` (extração de texto livre) NÃO é trabalho da
 * Jev e continua no modelo de chat quando necessário.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export type VereditoDeHigiene = 'yes' | 'no' | 'unknown';

const CRITERIOS: Record<VereditoDeHigiene, string> = {
  yes: 'higiene de memória OK — os fatos duráveis do lead estão preservados nas notas',
  no: 'fato durável PERDIDO/mal consolidado (aparece no transcript ou resumo mas NÃO nas notas)',
  unknown: 'indecidível com o material dado',
};

/** Pergunta `choice` da Jev para o veredito de higiene de memória. */
export function perguntaDeVereditoDeHigieneJev(): PerguntasDeJev {
  return {
    veredito: {
      type: 'choice',
      instructions:
        'Avalie APENAS a higiene de memória: o agente preservou nas NOTAS DURÁVEIS os fatos duráveis ' +
        'do lead revelados na conversa? Se um fato durável aparece no transcript/resumo mas não nas notas, o veredito é "no".',
      criteria: CRITERIOS,
    },
  };
}

/** Lê o veredito da resposta da Jev (`null` = resposta sem veredito reconhecível). */
export function vereditoDaRespostaDeJev(respostas: RespostasDeJev): VereditoDeHigiene | null {
  const a = respostas.veredito;
  if (!a || a.type !== 'choice' || typeof a.choice !== 'string') return null;
  const escolhido = a.choice.trim().toLowerCase();
  return escolhido === 'yes' || escolhido === 'no' || escolhido === 'unknown'
    ? escolhido
    : null;
}
