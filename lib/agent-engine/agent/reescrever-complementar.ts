/**
 * REESCRITOR DO TEXTO AVULSO (2026-10-09).
 *
 * O modelo, além de responder pela ferramenta `send_message`, às vezes escreve um
 * TEXTO AVULSO. Esse texto é o "rascunho" do turno: pode conter dado COMPLEMENTAR
 * útil (que faltou na mensagem) OU lixo (nota interna, narração, outro idioma).
 *
 * Decisão do dono: NÃO descartar (perde o complementar) nem enviar cru (vaza lixo).
 * Em vez disso, pede-se ao MODELO que reescreva: recebe a mensagem JÁ enviada + o
 * rascunho e devolve, em PT-BR, UMA mensagem curta com APENAS o que for
 * COMPLEMENTAR e útil ao cliente — ou `NADA` quando não há nada a acrescentar.
 *
 * Best-effort: qualquer falha devolve `null` (o turno JÁ respondeu ao cliente;
 * perder um complemento não pode derrubar nada).
 */
import type pg from 'pg';
import type { ModelMessage } from 'ai';

import type { ProviderRegistry } from '../edge/llm/providers';
import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import { detectarNotaInterna } from '../guardrails/nota-interna';
import type { Logger } from '../obs/logger';

const SYSTEM =
  'Você escreve mensagens de WhatsApp para o CLIENTE de uma loja. Você receberá: ' +
  '(1) a MENSAGEM que JÁ foi enviada ao cliente e (2) um RASCUNHO interno do atendente. ' +
  'Extraia do RASCUNHO APENAS o que for COMPLEMENTAR e útil ao cliente — novas respostas, ' +
  'fatos ou próximos passos que AINDA NÃO foram ditos na mensagem enviada — e reescreva numa ' +
  'ÚNICA mensagem curta, natural e calorosa, EM PORTUGUÊS DO BRASIL, falando DIRETAMENTE com o ' +
  'cliente. DESCARTE: notas internas, narração sobre o que o atendente fez, metalinguagem, ' +
  'texto em outro idioma, e qualquer coisa que já esteja na mensagem enviada (não repita). ' +
  'Se NÃO houver absolutamente nada complementar e útil, responda EXATAMENTE: NADA';

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
  /** Corpos JÁ enviados ao cliente neste turno. */
  enviadas: readonly string[];
  /** O texto avulso do modelo. */
  rascunho: string;
  registry?: ProviderRegistry;
}

/** Devolve o complemento reescrito (pronto para enviar) ou `null` (nada a enviar). */
export async function reescreverComplementar(args: ReescreverInput): Promise<string | null> {
  const rascunho = args.rascunho.trim();
  if (rascunho === '') return null;
  try {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content:
          'MENSAGEM JÁ ENVIADA AO CLIENTE:\n"""\n' +
          args.enviadas.join('\n---\n') +
          '\n"""\n\nRASCUNHO INTERNO:\n"""\n' +
          rascunho +
          '\n"""',
      },
    ];
    const { result } = await runModelCall(
      args.pool,
      args.llmCfg,
      {
        tenantId: args.tenantId,
        leadId: args.leadId,
        jobId: args.jobId,
        purpose: 'reescrita_avulso',
        ...(args.model !== undefined ? { model: args.model } : {}),
        ...(args.llmOverride !== undefined ? { llmOverride: args.llmOverride } : {}),
        system: SYSTEM,
        messages,
      },
      { ...(args.registry !== undefined ? { registry: args.registry } : {}), log: args.log },
    );
    const out = (result.text ?? '').trim();
    if (out === '') return null;
    if (/^nada[\s.!]*$/i.test(out)) return null;
    // Cinto e suspensório: se o reescritor deixar passar nota interna, veta aqui.
    if (detectarNotaInterna(out).achou) {
      args.log.warn('revisor do texto avulso devolveu nota interna — descartado', {});
      return null;
    }
    return out;
  } catch (err) {
    args.log.warn('revisor do texto avulso falhou — descartado', {
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    });
    return null;
  }
}
