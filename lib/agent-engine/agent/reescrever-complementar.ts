/**
 * REESCRITOR DO TURNO (2026-10-09).
 *
 * O modelo, além de responder pela ferramenta `send_message`, às vezes escreve um
 * TEXTO AVULSO. O dono definiu: NÃO descartar — JUNTAR tudo (a(s) mensagem(ns) já
 * preparada(s) + o texto avulso) e mandar de novo ao MODELO para REESCREVER numa
 * única mensagem coesa, dirigida ao cliente.
 *
 * É uma chamada SIMPLES: o prompt recebe SÓ o conteúdo juntado + as regras
 * INEGOCIÁVEIS (o que a reescrita NÃO pode quebrar) — SEM skills, SEM RAG, SEM
 * catálogo. Best-effort: qualquer falha devolve `null` (o turno não depende disto).
 */
import type pg from 'pg';
import type { ModelMessage } from 'ai';

import type { ProviderRegistry } from '../edge/llm/providers';
import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import { detectarNotaInterna } from '../guardrails/nota-interna';
import type { Logger } from '../obs/logger';

/**
 * As regras que a reescrita NÃO pode quebrar (destilado da seção inegociável da
 * persona). A reescrita não recebe skill/RAG: só o conteúdo + isto.
 */
const REGRAS_INEGOCIAVEIS = [
  'Você é a redatora do WhatsApp de uma loja de motos. Junte os trechos abaixo em UMA ÚNICA mensagem coesa, natural e calorosa, falando DIRETAMENTE com o cliente (como uma vendedora humana).',
  'REGRAS QUE VOCÊ NÃO PODE QUEBRAR:',
  '- NUNCA diga, insinue ou confirme que é IA, robô ou assistente virtual.',
  '- NUNCA prometa/confirme desconto, condição especial, brinde, financiamento/aprovação, prazo, reserva ou valor de troca — se o trecho tiver isso, troque por "vou confirmar/encaminhar ao responsável".',
  '- NUNCA invente moto, preço, ano, cor ou quilometragem.',
  '- NÃO pergunte quantos km o cliente roda por dia nem sobre o trânsito: isso não ajuda a venda.',
  '- NÃO inclua notas internas, narração sobre você mesma, nem texto em outro idioma.',
  '- NÃO repita a mesma ideia; se houver pergunta, mantenha no máximo UMA, no fim.',
  'Responda APENAS com a mensagem final para o cliente.',
].join('\n');

export interface ReescreverInput {
  pool: pg.Pool;
  llmCfg: LlmEdgeConfig;
  log: Logger;
  tenantId: string;
  leadId: string | null;
  jobId: string | null;
  /** Modelo/credencial do agente (mesmo do turno). Sem eles, usa o binding do ponto. */
  model?: string;
  llmOverride?: { provider: string; credentialId?: string | null };
  /** Mensagem(ns) já preparada(s)/enviada(s) no turno. */
  enviadas: readonly string[];
  /** O texto avulso do modelo (rascunho). */
  rascunho: string;
  registry?: ProviderRegistry;
}

/**
 * Junta (`enviadas` + `rascunho`) e devolve a mensagem reescrita, pronta para
 * enviar — ou `null` quando não há nada a reescrever / a reescrita vira nota interna.
 */
export async function reescreverMensagemJuntada(args: ReescreverInput): Promise<string | null> {
  const partes = [...args.enviadas.map((t) => t.trim()).filter((t) => t !== ''), args.rascunho.trim()]
    .filter((t) => t !== '');
  if (partes.length === 0) return null;
  // Um único trecho já é a mensagem — nada a juntar.
  if (partes.length === 1) return partes[0]!;
  try {
    const conteudo =
      partes.length === 1
        ? partes[0]!
        : partes.map((p, i) => `[trecho ${i + 1}]\n${p}`).join('\n\n');
    // As regras vão no `system` do input (o provider não aceita `role:'system'`
    // dentro de `messages` — erro medido ao vivo 2026-10-09).
    const messages: ModelMessage[] = [
      { role: 'user', content: 'TRECHOS A JUNTAR E REESCREVER:\n\n' + conteudo },
    ];
    const { result } = await runModelCall(
      args.pool,
      args.llmCfg,
      {
        tenantId: args.tenantId,
        leadId: args.leadId,
        jobId: args.jobId,
        purpose: 'reescrita_avulso',
        system: REGRAS_INEGOCIAVEIS,
        ...(args.model !== undefined ? { model: args.model } : {}),
        ...(args.llmOverride !== undefined ? { llmOverride: args.llmOverride } : {}),
        messages,
      },
      { ...(args.registry !== undefined ? { registry: args.registry } : {}), log: args.log },
    );
    const out = (result.text ?? '').trim();
    if (out === '') return null;
    if (/^nada[\s.!]*$/i.test(out)) return null;
    // Cinto e suspensório: se a reescrita virar nota interna, descarta.
    if (detectarNotaInterna(out).achou) {
      args.log.warn('reescrita do turno devolveu nota interna — descartada', {});
      return null;
    }
    return out;
  } catch (err) {
    args.log.warn('reescrita do turno falhou — descartada', {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    });
    return null;
  }
}
