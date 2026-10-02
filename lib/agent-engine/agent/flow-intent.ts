/**
 * Classificador de FLUXO por IA (C-108, decisão do dono 2026-09-29).
 *
 * ─── O defeito que isto resolve ─────────────────────────────────────────────
 * O fluxo de atendimento começava por PALAVRA-GATILHO (regex): "quero uma moto"
 * ligava a Qualificação até quando o cliente só queria VER o catálogo
 * ("quero uma moto barata", "até 20 mil", "de 2024") — o fluxo atropelava a
 * conversa de motos. Medido ao vivo (2026-09-29).
 *
 * ─── A solução ──────────────────────────────────────────────────────────────
 * Uma pergunta FECHADA a um modelo BARATO (o mesmo do agente), pelo seam
 * `runModelCall`: dado o que o cliente escreveu e a lista de fluxos ativos
 * (nome + exemplos-gatilho), ele deve INICIAR algum? Qual? Se for só consulta de
 * catálogo, `none`. O regex continua como FALLBACK (falha/timeout da IA → cai no
 * comportamento antigo).
 *
 * O classificador SUGERE, o motor decide iniciar — mesmo padrão do
 * `intent-classifier`. `parseFlowIntent` NUNCA lança.
 */
import type pg from 'pg';

import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import type { Logger } from '../obs/logger';
import { decidir } from '../../ai/jev';
import { alvosDeJevDe } from '../../ai/jev/config';
import { nomeDoFluxoDaRespostaDeJev, perguntaDeFluxoDeJev } from '../../ai/jev/pontos/flow-intent';
import { registrarDecisaoJev } from '../../ai/jev/telemetria';

/** Um fluxo ativo oferecido ao classificador. */
export interface FluxoParaIA {
  id: string;
  nome: string;
  /** Exemplos de gatilho — viram as "pistas" do prompt (não são a regra). */
  gatilhos: string[];
}

export function buildFlowIntentPrompt(fluxos: readonly FluxoParaIA[], mensagem: string): string {
  const lista = fluxos
    .map((f) => `- ${f.nome} (exemplos: ${f.gatilhos.join(', ') || '—'})`)
    .join('\n');
  return [
    'Você é um classificador auxiliar (NÃO responde ao cliente).',
    'Decida se a mensagem do cliente deve INICIAR um dos fluxos de atendimento abaixo.',
    'Fluxos disponíveis:',
    lista,
    'REGRAS:',
    '- CATÁLOGO / INFORMAÇÃO (o cliente quer VER ou SABER MAIS: modelo, preço, faixa, fotos, detalhes — ex.: "quero uma moto até 20 mil", "tem uma CB 300?", "me fala mais da CB 300", "qual o preço da CB 300?", "tem fotos?"): responda "none". O sistema responde/continua o catálogo.',
    '- ESCOLHA da moto (o cliente DECIDE/GOSTA de uma moto específica — ex.: "gostei dessa", "essa mesmo", "quero essa", "vou levar essa", "fechado, essa", "pode ser a Biz 125"): inicie o fluxo de QUALIFICAÇÃO (o que coleta nome, cidade e CNH).',
    '- Outros processos: financiamento/parcelamento → Financiamento; dar a moto na troca → Troca; vender/consignar → Venda ou Consignação.',
    '- Em dúvida ou saudação, responda "none".',
    'Responda SOMENTE JSON: {"fluxo":"<nome exato de um fluxo da lista ou none>"}',
    '',
    'Mensagem do cliente:',
    mensagem,
  ].join('\n');
}

/** Parse tolerante: devolve o fluxo cujo nome bate exatamente, ou null. Nunca lança. */
export function parseFlowIntent(text: string, fluxos: readonly FluxoParaIA[]): FluxoParaIA | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (match === null) return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const nome =
    typeof bruto === 'object' && bruto !== null && typeof (bruto as { fluxo?: unknown }).fluxo === 'string'
      ? (bruto as { fluxo: string }).fluxo.trim()
      : '';
  if (nome === '' || nome.toLowerCase() === 'none') return null;
  return fluxos.find((f) => f.nome === nome) ?? null;
}

async function carregarFluxosAtivos(
  db: pg.Pool,
  organizationId: string,
  contactId: string | null,
): Promise<FluxoParaIA[]> {
  const { rows } = await db.query<{ id: string; nome: string; gatilhos: unknown }>(
    `select p.id, p.name as nome, v.graph->'settings'->'gatilhos' as gatilhos
       from followup_flow_pointers p
       join followup_flow_versions v on v.id = p.active_version_id
      where p.organization_id = $1 and p.surface = 'atendimento' and p.status = 'active'`,
    [organizationId],
  );
  // Fluxos que ESTE contato já concluiu não reabrem (mesma regra do gatilho).
  const concluidos = new Set<string>();
  if (contactId) {
    try {
      const feitos = await db.query<{ pointer_id: string }>(
        `select distinct pointer_id from followup_enrollments
          where organization_id = $1 and contact_id = $2 and status = 'completed'`,
        [organizationId, contactId],
      );
      for (const f of feitos.rows) concluidos.add(f.pointer_id);
    } catch {
      // sem a lista, cai no comportamento antigo (pode reabrir).
    }
  }
  return rows
    .filter((r) => !concluidos.has(r.id))
    .map((r) => ({
      id: r.id,
      nome: r.nome,
      gatilhos: Array.isArray(r.gatilhos)
        ? r.gatilhos.filter((g): g is string => typeof g === 'string')
        : [],
    }));
}

export interface EscolherFluxoPorIADeps {
  log: Logger;
  runModelCall?: typeof runModelCall;
}

/**
 * Decide, por IA, qual fluxo iniciar (ou null). NUNCA lança: sem texto, sem
 * fluxos, sem modelo ou falha do modelo → null (o chamador usa o regex/fallback).
 */
export async function escolherFluxoPorIA(
  db: pg.Pool,
  llmCfg: LlmEdgeConfig,
  input: {
    organizationId: string;
    contactId: string | null;
    texto: string | null;
    model: string;
    provider?: string | null;
    jobId?: string | null;
  },
  deps: EscolherFluxoPorIADeps,
): Promise<{ id: string; nome: string } | null> {
  if (input.texto === null || input.texto.trim() === '' || input.model.trim() === '') return null;
  try {
    const fluxos = await carregarFluxosAtivos(db, input.organizationId, input.contactId);
    if (fluxos.length === 0) return null;

    // Jev PRIMEIRO — só quando ligada por ambiente (default DESLIGADA = nada muda).
    // A Jev é AUTORITATIVA quando responde (inclusive "none"); se ela esgotar, cai
    // no modelo de chat (último recurso), e o regex do chamador segue como fallback.
    const alvosJev = alvosDeJevDe(process.env);
    if (alvosJev.length > 0) {
      const decisaoJev = await decidir({
        alvos: alvosJev,
        state: { mensagem: input.texto },
        questions: perguntaDeFluxoDeJev(fluxos),
      });
      if (decisaoJev !== null) {
        registrarDecisaoJev(deps.log, 'flow_intent', decisaoJev);
        const nome = nomeDoFluxoDaRespostaDeJev(decisaoJev.respostas);
        const escolhido = nome ? (fluxos.find((f) => f.nome === nome) ?? null) : null;
        return escolhido === null ? null : { id: escolhido.id, nome: escolhido.nome };
      }
    }

    const call = deps.runModelCall ?? runModelCall;
    const { result } = await call(
      db,
      llmCfg,
      {
        tenantId: input.organizationId,
        leadId: input.contactId,
        jobId: input.jobId ?? null,
        purpose: 'flow_intent',
        model: input.model,
        ...(input.provider ? { llmOverride: { provider: input.provider } } : {}),
        messages: [{ role: 'user', content: buildFlowIntentPrompt(fluxos, input.texto) }],
      },
      { log: deps.log },
    );
    const escolhido = parseFlowIntent(result.text, fluxos);
    return escolhido === null ? null : { id: escolhido.id, nome: escolhido.nome };
  } catch (err) {
    deps.log.warn('flow-intent: falha — cai no gatilho por palavra', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
