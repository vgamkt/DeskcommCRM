/**
 * TRAVA DA PERGUNTA DO FLUXO — a decisão "o motor reenvia a pergunta?".
 *
 * ANTES (caracterização, 2026-10-11): a decisão é do MOTOR, inline no turno. Esta
 * função reproduz EXATAMENTE o gate de hoje — é o retrato do comportamento atual,
 * contra o qual o item G3.7 ("a Jev decide") vai ser comparado. PURO.
 */
export interface EntradaDaTrava {
  preview: boolean;
  kind: string;
  temAtendimento: boolean;
  temValores: boolean;
  emNegociacao: boolean;
  seq: number;
  maxSends: number;
  /** existe pendente de fluxo ainda não respondido neste turno */
  temPendenteNaoRespondido: boolean;
  /** a pergunta já apareceu em algum texto que VAI SAIR neste turno */
  perguntaSaiu: boolean;
}

/**
 * COMPORTAMENTO ATUAL (motor decide): reenvia quando o turno é de inbound, há
 * fluxo ativo com pendente não respondido, NÃO está em negociação, cabe no teto
 * de envios e a pergunta não saiu. Em qualquer outro caso, não reenvia.
 */
export function motorReenviaPerguntaDoFluxo(e: EntradaDaTrava): boolean {
  return (
    !e.preview &&
    e.kind === 'inbound_turn' &&
    e.temAtendimento &&
    e.temValores &&
    !e.emNegociacao &&
    e.seq < e.maxSends &&
    e.temPendenteNaoRespondido &&
    !e.perguntaSaiu
  );
}
