/**
 * Mapeamento dos pontos de FOLLOW-UP para a Jev.
 *
 * - `followup_classify`: a resposta do cliente foi aceitar, recusar ou pedir para
 *   depois? A Jev escolhe UMA das classes configuradas (choice) — mesmo contrato
 *   de hoje (`classifyFollowupReply` devolve a classe).
 * - `followup_decide_timing`: quanto esperar em CADA espera do fluxo. A Jev
 *   escolhe a posição no INTERVALO de cada espera (escala ordenada) — o motor
 *   converte em ms. Não é texto; é uma fração do intervalo.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

/** `followup_classify`: pergunta choice com as classes configuradas. */
export function perguntaDeClasseDeFollowupJev(classes: readonly string[]): PerguntasDeJev {
  const criteria: Record<string, string> = {};
  for (const c of classes) criteria[c] = `o cliente ${descricaoDaClasse(c)}`;
  return {
    classe: {
      type: 'choice',
      instructions:
        'Em qual destas categorias cai a ÚLTIMA resposta do cliente? Escolha exatamente uma.',
      criteria,
    },
  };
}

function descricaoDaClasse(c: string): string {
  const n = c.toLowerCase();
  if (n.includes('aceit') || n === 'accepted') return 'ACEITOU / topou';
  if (n.includes('recus') || n === 'declined') return 'RECUSOU';
  if (n.includes('depois') || n.includes('later') || n.includes('wait')) return 'pediu para depois';
  return `respondeu "${c}"`;
}

/** A classe escolhida pela Jev, se estiver na lista; senão `null`. */
export function classeDeFollowupDaJev(
  respostas: RespostasDeJev,
  classes: readonly string[],
): string | null {
  const a = respostas.classe;
  if (a?.type !== 'choice') return null;
  return classes.includes(a.choice) ? a.choice : null;
}

/** O que a Jev precisa de cada espera (intervalo permitido). */
export interface EsperaParaJev {
  node_id: string;
  label: string;
  min_ms: number;
  max_ms: number;
}

/** `followup_decide_timing`: uma pergunta `score` (0=piso, 3=teto) por espera. */
export function perguntasDeTimingDeJev(esperas: readonly EsperaParaJev[]): PerguntasDeJev {
  const perguntas: PerguntasDeJev = {};
  esperas.forEach((e, i) => {
    perguntas[`espera_${i}`] = {
      type: 'score',
      instructions:
        `Para a espera "${e.label}", quanto tempo aguardar antes de retomar? ` +
        `Do mais CURTO (piso) ao mais LONGO (teto) do intervalo permitido.`,
      criteria: ['bem curto (piso)', 'curto', 'longo', 'bem longo (teto)'],
    };
  });
  return perguntas;
}

/** Converte as respostas em aguardar_ms por node (clampado ao intervalo). */
export function timingDaJev(
  respostas: RespostasDeJev,
  esperas: readonly EsperaParaJev[],
): Array<{ node_id: string; aguardar_ms: number }> {
  const out: Array<{ node_id: string; aguardar_ms: number }> = [];
  esperas.forEach((e, i) => {
    const a = respostas[`espera_${i}`];
    if (a?.type !== 'score' || typeof a.score !== 'number') return;
    const fracao = Math.min(1, Math.max(0, a.score / 3));
    const ms = Math.round(e.min_ms + fracao * (e.max_ms - e.min_ms));
    out.push({ node_id: e.node_id, aguardar_ms: ms });
  });
  return out;
}
