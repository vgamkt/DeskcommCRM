/**
 * JUNÇÃO DO TURNO — o passo final que UNIFICA as peças numa só mensagem.
 *
 * Decisão do dono (2026-10-11): o turno manda UMA mensagem. Quando o turno produz
 * mais de uma peça (o `send_message` do modelo + a pergunta do fluxo que a trava
 * reenviaria, ou o texto do motor), uma **2ª chamada** (sem skills/Jev, contexto
 * mínimo) reescreve tudo numa mensagem natural — e o canal libera UMA só.
 *
 * A Jev NÃO participa: é redação de saída, não decisão. Módulo puro + um seam de
 * chamada (`runModelCall`) testável.
 */
import type pg from 'pg';

import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import type { ProviderRegistry } from '../edge/llm/providers';
import type { Logger } from '../obs/logger';

/** Regras inegociáveis do texto de saída (mesmas da persona, versão mínima). */
export const SYSTEM_DA_JUNCAO = [
  'Você junta mensagens de um atendente de loja de motos no WhatsApp numa SÓ mensagem.',
  'PRESERVE todo o conteúdo: saudação, apresentação, nomes, motos, preços, informações.',
  'NÃO encurte, NÃO resuma, NÃO reescreva o que já está bom — apenas costure as partes',
  'numa fala contínua e natural, sem repetir frases.',
  'A ÚNICA edição permitida: se houver mais de uma pergunta, mantenha SÓ a pergunta pendente',
  'do roteiro e descarte as outras.',
  'ORDEM da mensagem final: primeiro as EXPLICAÇÕES/FRASES (saudação, apresentação, motos,',
  'preços, informações — tudo que NÃO é pergunta); deixe as PERGUNTAS no FINAL, como última',
  'coisa que o cliente lê.',
  'Regras:',
  '- NUNCA diga que é uma IA, robô ou assistente virtual.',
  '- NUNCA prometa o que não foi dito (preço, desconto, prazo, aprovação).',
  '- Fale na 2ª pessoa, tom próximo e direto.',
  '- Devolva SÓ o texto final, sem títulos, sem listas de bastidor.',
].join('\n');

/** Monta o pedido: as peças do turno + a pergunta pendente (se houver). */
export function montarPedidoDaJuncao(pecas: readonly string[], pendente: string | null): string {
  const partes = pecas.map((p) => p.trim()).filter((p) => p !== '');
  const linhas = [
    'Mensagens que o atendente ia enviar, nesta ordem:',
    ...partes.map((p, i) => `${i + 1}. ${p}`),
  ];
  if (pendente !== null && pendente.trim() !== '') {
    linhas.push(
      '',
      `Pergunta PENDENTE do roteiro que precisa aparecer (se ainda não estiver respondida): "${pendente.trim()}"`,
    );
  }
  return linhas.join('\n');
}

/** Limpa a saída do modelo. Vazio → null (não envia bolha vazia). */
export function limparTextoUnificado(texto: string): string | null {
  const limpo = texto.trim();
  return limpo === '' ? null : limpo;
}

export interface JuncaoDeps {
  registry?: ProviderRegistry;
  log: Logger;
}

/**
 * A 2ª chamada: unifica as peças. Nunca lança — se falhar, devolve null (o turno
 * cai no caminho de sempre: libera a fila como veio).
 */
export async function unificarPecasDoTurno(
  db: pg.Pool,
  cfg: LlmEdgeConfig,
  ids: { tenantId: string; leadId: string | null; jobId: string },
  entrada: { pecas: readonly string[]; pendente: string | null },
  deps: JuncaoDeps,
): Promise<string | null> {
  try {
    const call = await runModelCall(
      db,
      cfg,
      {
        tenantId: ids.tenantId,
        leadId: ids.leadId,
        jobId: ids.jobId,
        purpose: 'flow_summary',
        system: SYSTEM_DA_JUNCAO,
        messages: [{ role: 'user', content: montarPedidoDaJuncao(entrada.pecas, entrada.pendente) }],
      },
      { registry: deps.registry, log: deps.log },
    );
    return limparTextoUnificado(call.result.text);
  } catch (err) {
    deps.log.warn('junção do turno falhou — libera a fila como veio', {
      error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
    });
    return null;
  }
}
