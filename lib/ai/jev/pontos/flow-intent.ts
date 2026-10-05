/**
 * Mapeamento do ponto `flow_intent` para a Jev (Fase 5).
 *
 * A decisão é: a mensagem deve INICIAR um fluxo de atendimento — e QUAL? É uma
 * escolha única entre os fluxos ativos (pelos NOMES) ou `none`. A Jev devolve o
 * rótulo direto. (O regex por palavra-gatilho continua como fallback no chamador.)
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

/** O mínimo que a Jev precisa de cada fluxo: o nome (opção) e exemplos de gatilho. */
export interface FluxoParaJev {
  nome: string;
  gatilhos: string[];
}

export const OPCAO_NENHUM = 'none';

/** Pergunta `choice` da Jev: qual fluxo iniciar, ou `none`. */
export function perguntaDeFluxoDeJev(fluxos: readonly FluxoParaJev[]): PerguntasDeJev {
  const criteria: Record<string, string> = {
    [OPCAO_NENHUM]: 'não iniciar nenhum fluxo (catálogo/informação, saudação ou dúvida)',
  };
  for (const f of fluxos) {
    criteria[f.nome] =
      f.gatilhos.length > 0 ? `exemplos: ${f.gatilhos.join(', ')}` : 'fluxo de atendimento';
  }
  return {
    fluxo: {
      type: 'choice',
      instructions:
        'A mensagem do cliente deve INICIAR algum fluxo de atendimento? ' +
        'Catálogo/informação (ver/saber preço, fotos, detalhes), saudação ou dúvida → "none". ' +
        'Escolha da moto (gostou/quer essa) → Qualificação. Financiamento/parcelar → Financiamento. ' +
        'Dar a moto na troca → Troca. Vender/consignar → Venda ou Consignação. ' +
        'ATENÇÃO: uma OBJEÇÃO ou comentário sobre PREÇO ("achei caro", "tá caro", "acima do que ' +
        'posso pagar", "não tenho condições") NÃO é pedido de financiamento — responda "none". ' +
        'Só escolha Financiamento quando o cliente PERGUNTAR ou PEDIR financiamento/parcelas/entrada. ' +
        'Se a mensagem apenas reclama, comenta, agradece ou responde algo sem PEDIR um desses ' +
        'processos, responda "none".',
      criteria,
    },
  };
}

/** Nome do fluxo escolhido pela Jev; `null` = "none"/ausente/desconhecido. */
export function nomeDoFluxoDaRespostaDeJev(respostas: RespostasDeJev): string | null {
  const a = respostas.fluxo;
  if (!a || a.type !== 'choice' || typeof a.choice !== 'string') return null;
  const escolhido = a.choice.trim();
  if (escolhido === '' || escolhido.toLowerCase() === OPCAO_NENHUM) return null;
  return escolhido;
}
