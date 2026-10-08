/**
 * Classificador de FLUXOS por IA (C-108 + decisão do dono 2026-10-06).
 *
 * ─── O defeito que isto resolve ─────────────────────────────────────────────
 * O fluxo de atendimento começava por PALAVRA-GATILHO (regex): "quero uma moto"
 * ligava a Qualificação até quando o cliente só queria VER o catálogo. Medido ao
 * vivo (2026-09-29). E, quando o cliente pedia DOIS processos ("moto na troca e
 * financiar"), o regex precisava acertar as duas palavras na ordem.
 *
 * ─── A solução ──────────────────────────────────────────────────────────────
 * A Jev (ou, sem ela, um modelo barato) decide QUAIS fluxos iniciar, na ORDEM em
 * que o cliente os pediu. O motor inicia o primeiro e enfileira o resto. O regex
 * por palavra continua existindo, mas só como ÚLTIMO recurso (quando a Jev e o
 * modelo de chat não respondem) — a intenção vence a palavra.
 */
import type pg from 'pg';

import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import type { Logger } from '../obs/logger';
import { decidir } from '../../ai/jev';
import { alvosDeJevDaOrg } from '../../ai/jev/resolver';
import { fluxosDaRespostaDeJev, perguntasDeFluxosDeJev } from '../../ai/jev/pontos/flow-intent';
import { registrarDecisaoJev } from '../../ai/jev/telemetria';
import { enfileirarDecisaoJev } from '../../ai/jev/outbox';

/** Um fluxo ativo oferecido ao classificador. */
export interface FluxoParaIA {
  id: string;
  nome: string;
  /** Exemplos de gatilho — viram as "pistas" do prompt (não são a regra). */
  gatilhos: string[];
}

/**
 * Resultado da classificação por IA. `ok: true` = a intenção foi decidida
 * (lista vazia = "nenhum fluxo"; o regex NÃO deve redecidir). `ok: false` =
 * a IA não conseguiu responder — aí sim o chamador usa o regex de palavra.
 */
export type EscolhaDeFluxosPorIA =
  | { ok: true; fluxos: Array<{ id: string; nome: string }> }
  | { ok: false };

export function buildFlowIntentPrompt(fluxos: readonly FluxoParaIA[], mensagem: string): string {
  const lista = fluxos
    .map((f) => `- ${f.nome} (exemplos: ${f.gatilhos.join(', ') || '—'})`)
    .join('\n');
  return [
    'Você é um classificador auxiliar (NÃO responde ao cliente).',
    'Decida QUAIS fluxos de atendimento a mensagem deve INICIAR, na ORDEM em que o cliente os pediu.',
    'Fluxos disponíveis:',
    lista,
    'REGRAS:',
    '- CATÁLOGO / INFORMAÇÃO (o cliente quer VER ou SABER MAIS: modelo, preço, faixa, fotos, detalhes — ex.: "quero uma moto até 20 mil", "tem uma CB 300?", "me fala mais da CB 300"): responda lista VAZIA [].',
    '- ESCOLHA da moto (o cliente DECIDE/GOSTA de uma moto específica — ex.: "gostei dessa", "quero essa", "vou levar essa"): inicie QUALIFICAÇÃO.',
    '- Outros processos: financiamento/parcelar → Financiamento; dar a moto na troca → Troca; vender/consignar → Venda ou Consignação.',
    '- SÓ INICIE quando o cliente QUER/PEDE o processo ("quero financiar", "quero dar minha moto na troca"). PERGUNTA sobre o processo ("vocês aceitam troca?", "como funciona o financiamento?", "dá pra parcelar?") é DÚVIDA → lista VAZIA [].',
    '- OBJEÇÃO/comentário de preço ("achei caro", "não tenho condições") NÃO é financiamento: lista VAZIA [].',
    '- Se a mensagem pede MAIS de um processo, liste TODOS na ordem citada. Ex.: "quero dar minha moto na troca e financiar o resto" → ["Troca","Financiamento"].',
    '- Em dúvida ou saudação, lista VAZIA [].',
    'Responda SOMENTE JSON: {"fluxos":["<nome exato de um fluxo da lista>", ...]} (vazio = nenhum)',
    '',
    'Mensagem do cliente:',
    mensagem,
  ].join('\n');
}

/**
 * Parse tolerante: devolve os fluxos cujos nomes batem exatamente, na ordem
 * da resposta. Aceita o formato novo ({"fluxos":[...]}) e o antigo ({"fluxo":"..."}).
 * Nunca lança.
 */
export function parseFlowIntents(text: string, fluxos: readonly FluxoParaIA[]): FluxoParaIA[] {
  const match = /\{[\s\S]*\}/.exec(text);
  if (match === null) return [];
  let bruto: unknown;
  try {
    bruto = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const obj = typeof bruto === 'object' && bruto !== null ? (bruto as Record<string, unknown>) : {};
  let lista: unknown[] = [];
  if (Array.isArray(obj.fluxos)) lista = obj.fluxos;
  else if (typeof obj.fluxo === 'string') lista = [obj.fluxo];

  const saida: FluxoParaIA[] = [];
  const vistos = new Set<string>();
  for (const item of lista) {
    if (typeof item !== 'string') continue;
    const nome = item.trim();
    if (nome === '' || nome.toLowerCase() === 'none') continue;
    const f = fluxos.find((x) => x.nome === nome);
    if (f !== undefined && !vistos.has(f.id)) {
      saida.push(f);
      vistos.add(f.id);
    }
  }
  return saida;
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

export interface EscolherFluxosPorIADeps {
  log: Logger;
  runModelCall?: typeof runModelCall;
}

/**
 * Decide, por IA, QUAIS fluxos iniciar (em ordem), ou lista vazia para "nenhum".
 * NUNCA lança: sem texto/modelo → lista vazia; falha da IA → `{ ok: false }`
 * (o chamador usa o regex como último recurso).
 */
export async function escolherFluxosPorIA(
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
  deps: EscolherFluxosPorIADeps,
): Promise<EscolhaDeFluxosPorIA> {
  // Sem texto não há o que classificar (nenhum fluxo). Sem modelo a IA não pode
  // responder — devolve `ok: false` para o chamador cair no regex de palavra.
  if (input.texto === null || input.texto.trim() === '') return { ok: true, fluxos: [] };
  if (input.model.trim() === '') return { ok: false };
  try {
    const fluxos = await carregarFluxosAtivos(db, input.organizationId, input.contactId);
    if (fluxos.length === 0) return { ok: true, fluxos: [] };

    // Jev PRIMEIRO — só quando ligada por ambiente (default DESLIGADA = nada muda).
    // A Jev é AUTORITATIVA quando responde (inclusive "none"/vazio); se esgotar,
    // cai no modelo de chat (último recurso) e o regex só vem se ambos falharem.
    const alvosJev = await alvosDeJevDaOrg(db, input.organizationId, 'flow_intent');
    if (alvosJev.length > 0) {
      const decisaoJev = await decidir({
        alvos: alvosJev,
        state: { mensagem: input.texto },
        questions: perguntasDeFluxosDeJev(fluxos),
        aoEsgotar: (info) =>
          enfileirarDecisaoJev(db, {
            organizationId: input.organizationId,
            point: 'flow_intent',
            ...info,
          }),
      });
      if (decisaoJev !== null) {
        registrarDecisaoJev(deps.log, 'flow_intent', decisaoJev);
        const nomes = fluxosDaRespostaDeJev(decisaoJev.respostas, fluxos);
        const escolhidos = nomes
          .map((n) => fluxos.find((f) => f.nome === n))
          .filter((f): f is FluxoParaIA => f !== undefined);
        return { ok: true, fluxos: escolhidos.map((f) => ({ id: f.id, nome: f.nome })) };
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
    const escolhidos = parseFlowIntents(result.text, fluxos);
    return { ok: true, fluxos: escolhidos.map((f) => ({ id: f.id, nome: f.nome })) };
  } catch (err) {
    deps.log.warn('flow-intent: falha — cai no gatilho por palavra', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}
