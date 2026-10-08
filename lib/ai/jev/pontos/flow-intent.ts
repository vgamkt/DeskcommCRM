/**
 * Mapeamento do ponto `flow_intent` para a Jev (Fase 5) — agora MULTI-FLUXO.
 *
 * A decisão: a mensagem deve INICIAR fluxos de atendimento — e QUAIS, na ORDEM
 * em que o cliente os pediu. Ex.: "quero dar minha moto na troca e financiar o
 * resto" → [Troca, Financiamento] (o motor inicia um e enfileira o resto).
 *
 * A Jev responde duas coisas:
 *   - `fluxo_principal` (choice): o PRIMEIRO fluxo a iniciar, ou `none`;
 *   - `fluxo_adicional_<i>` (noul): para cada fluxo, se a mensagem TAMBÉM o pede.
 *
 * O regex por palavra-gatilho continua existindo, mas só como ÚLTIMO recurso do
 * chamador (quando a Jev e o modelo de chat não respondem).
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

/** Pergunta `choice` do fluxo principal + um `noul` por fluxo (adicionais). */
export function perguntasDeFluxosDeJev(fluxos: readonly FluxoParaJev[]): PerguntasDeJev {
  const criteria: Record<string, string> = {
    [OPCAO_NENHUM]: 'não iniciar nenhum fluxo (catálogo/informação, saudação ou dúvida)',
  };
  for (const f of fluxos) {
    criteria[f.nome] =
      f.gatilhos.length > 0 ? `exemplos: ${f.gatilhos.join(', ')}` : 'fluxo de atendimento';
  }

  const perguntas: PerguntasDeJev = {
    fluxo_principal: {
      type: 'choice',
      instructions:
        'A mensagem do cliente deve INICIAR algum fluxo de atendimento? ' +
        'Se houver MAIS de um processo pedido, escolha o PRIMEIRO na ordem que o cliente mencionou/priorizou. ' +
        'Catálogo/informação (ver/saber preço, fotos, detalhes), saudação ou dúvida → "none". ' +
        'Escolha da moto (gostou/quer essa) → Qualificação. Financiamento/parcelar → Financiamento. ' +
        'Dar a moto na troca → Troca. Vender/consignar → Venda ou Consignação. ' +
        // ⚠️ INTENÇÃO, não palavra: o cliente precisa QUERER o processo. Perguntar
        // COMO funciona ou SE aceita NÃO inicia o fluxo (medido 2026-10-08: "vocês
        // aceitam minha moto na troca?" abriu o fluxo de Troca sem o cliente pedir).
        'IMPORTANTE — só inicie um fluxo quando o cliente QUER/PEDE fazer aquele processo ' +
        '("quero dar minha moto na troca", "quero financiar", "quero vender minha moto"). ' +
        'Uma PERGUNTA sobre o processo ("vocês aceitam troca?", "como funciona o financiamento?", ' +
        '"dá pra financiar?") é DÚVIDA — responda "none". ' +
        'ATENÇÃO: uma OBJEÇÃO ou comentário sobre PREÇO ("achei caro", "tá caro", "acima do que ' +
        'posso pagar", "não tenho condições") NÃO é pedido de financiamento — responda "none". ' +
        'Só escolha Financiamento quando o cliente PERGUNTAR ou PEDIR financiamento/parcelas/entrada. ' +
        'Se a mensagem apenas reclama, comenta, agradece ou responde algo sem PEDIR um desses ' +
        'processos, responda "none".',
      criteria,
    },
  };

  fluxos.forEach((f, i) => {
    perguntas[`fluxo_adicional_${i}`] = {
      type: 'noul',
      instructions:
        `Além do fluxo principal, a mensagem TAMBÉM pede o processo "${f.nome}"? ` +
        'Probabilidade ALTA (0.8–1) se o cliente pediu esse processo além do principal; ' +
        'BAIXA (0–0.2) se não pediu.',
    };
  });

  return perguntas;
}

/** Nomes dos fluxos pedidos, na ordem (principal primeiro, depois os adicionais). */
export function fluxosDaRespostaDeJev(
  respostas: RespostasDeJev,
  fluxos: readonly FluxoParaJev[],
): string[] {
  const saida: string[] = [];

  const principal = respostas.fluxo_principal;
  let principalNome: string | null = null;
  if (principal && principal.type === 'choice' && typeof principal.choice === 'string') {
    const p = principal.choice.trim();
    if (p !== '' && p.toLowerCase() !== OPCAO_NENHUM) principalNome = p;
  }

  // ⚠️ SEM FLUXO PRINCIPAL, NÃO HÁ FLUXO. Os `fluxo_adicional_<i>` só valem quando
  // existe um principal. Sem esta guarda, o noul adicional vinha ALTO mesmo para
  // uma PERGUNTA ou saudação — medido 2026-10-08: "vocês aceitam troca?" → principal
  // "none" mas `Troca=0.84`; e "oi bom dia" disparava o fluxo de Troca à toa.
  if (principalNome === null) return [];
  saida.push(principalNome);

  fluxos.forEach((f, i) => {
    const a = respostas[`fluxo_adicional_${i}`];
    if (a && a.type === 'noul' && typeof a.noul === 'number' && a.noul >= 0.5) {
      if (f.nome !== saida[0]) saida.push(f.nome);
    }
  });

  return saida;
}
