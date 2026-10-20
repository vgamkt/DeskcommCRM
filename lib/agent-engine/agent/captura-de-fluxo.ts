/**
 * CAPTURA CONTÍNUA dos dados de fluxo — em QUALQUER mensagem, não só quando há
 * fluxo ativo.
 *
 * POR QUE EXISTE: antes, a interpretação da resposta só rodava com um fluxo ativo
 * (campos pendentes). Se o cliente dissesse "sou de São José e tenho CNH" numa
 * mensagem qualquer, esse dado não era gravado e o fluxo reperguntava depois. Aqui
 * a leitura roda contra a UNIÃO dos campos de TODOS os fluxos ativos e grava em
 * `contacts.custom_fields` — que o `carregarEstadoDeAtendimento` JÁ MESCLA ("dado
 * já conhecido não se pergunta de novo"). Correção do cliente sobrescreve.
 *
 * Reusa o `validarRespostaDoFluxo` (Jev decide campo a campo; chat extrai o valor),
 * então não há caminho novo de interpretação. Best-effort: nunca lança.
 */
import type pg from 'pg';

import { camposDeColetaDosFluxosAtivos } from '@/lib/followup/atendimento';

import type { ProviderRegistry } from '../edge/llm/providers';
import type { LlmEdgeConfig } from '../edge/llm/run-model-call';
import type { Logger } from '../obs/logger';
import { validarRespostaDoFluxo } from './flow-validate';

export async function capturarDadosDosFluxosNaMensagem(
  db: pg.Pool,
  cfg: LlmEdgeConfig,
  ids: { tenantId: string; leadId: string; jobId: string },
  args: { contactId: string | null; texto: string | null },
  deps: { registry?: ProviderRegistry; log: Logger },
): Promise<void> {
  const texto = args.texto?.trim() ?? '';
  if (args.contactId === null || texto === '') return;

  let campos: Awaited<ReturnType<typeof camposDeColetaDosFluxosAtivos>>;
  let activePointer: string | null = null;
  try {
    // Usa o enrollment MAIS RECENTE (ativo ou recém-concluído), não a união de
    // todos os fluxos. Sem isto, uma mensagem depois da Venda concluída escrevia
    // `troca_*` porque o Troca também é um fluxo ativo da org (medido 2026-10-20).
    const active = await db.query<{ pointer_id: string }>(
      `select pointer_id
         from followup_enrollments
        where organization_id = $1::uuid and contact_id = $2::uuid
        order by updated_at desc
        limit 1`,
      [ids.tenantId, args.contactId],
    );
    activePointer = active.rows[0]?.pointer_id ?? null;
  } catch {
    // sem active: mantém o comportamento antigo (união de todos)
  }
  try {
    campos = await camposDeColetaDosFluxosAtivos(
      db,
      ids.tenantId,
      activePointer ?? undefined,
    );
  } catch {
    return;
  }
  if (campos.length === 0) return;

  const leitura = await validarRespostaDoFluxo(
    db,
    cfg,
    { tenantId: ids.tenantId, leadId: ids.leadId, jobId: ids.jobId },
    { perguntas: campos, preenchidos: [], mensagens: [{ de: 'cliente', texto }] },
    deps,
  );
  if (leitura.resultado !== 'respondeu' || leitura.respostas.length === 0) return;

  const dados: Record<string, string> = {};
  for (const r of leitura.respostas) dados[r.campo] = r.valor;
  try {
    await db.query(
      `update contacts
          set custom_fields = coalesce(custom_fields, '{}'::jsonb) || $3::jsonb
        where organization_id = $1 and id = $2`,
      [ids.tenantId, args.contactId, JSON.stringify(dados)],
    );
    deps.log.info('captura contínua: dados do fluxo gravados no contato', {
      campos: Object.keys(dados),
    });
  } catch {
    // best-effort: gravação não derruba o turno.
  }
}
