/**
 * HANDOFF POR LENTIDÃO — avisa o humano quando o modelo do turno esgota as
 * tentativas (travou). É a parte de AVISAR da trava anti-travamento: o turno
 * segue sem segurar a fila e o responsável recebe o alerta.
 *
 * Usa o MESMO caminho do resumo de conversas: destino em
 * `conversation_summary_settings.destination` (o número que o dono cadastrou
 * para receber avisos), contato de destino resolvido/criado e envio pelo
 * `sendMessageHandler`. Best-effort: falha só loga (o turno já terminou).
 */
import { canonicalPhoneBR } from '@/lib/channels/phone-variants';
import { encontrarContatoPorTelefone } from '@/lib/channels/contato-por-telefone';
import { ensureConversation, sessaoProntaParaEnvio } from '@/lib/automation/start-conversation';
import { createAdminClient } from '@/lib/supabase/admin';
import { semFronteiraDeAtendimento } from '@/lib/atendimento/fronteira-server';
import { sendMessageHandler } from '@/app/api/v1/messages/_handler';

import type { Logger } from '../obs/logger';

export async function enviarHandoffPorLentidao(
  _pool: unknown,
  args: {
    tenantId: string;
    conversationId: string;
    contactId: string | null;
    tentativas: number;
    log: Logger;
  },
): Promise<void> {
  try {
    const admin = createAdminClient();

    // ANTI-LAÇO: quando o destino dos avisos é o PRÓPRIO número que atende, a
    // mensagem volta como recebida e pode disparar um novo turno — que, estourando
    // de novo, mandaria outro aviso, sem fim. Uma vez por conversa a cada 15min.
    const JANELA_MS = 15 * 60 * 1000;
    const { data: convMeta } = await admin
      .from('conversations')
      .select('metadata')
      .eq('organization_id', args.tenantId)
      .eq('id', args.conversationId)
      .maybeSingle();
    const meta = (convMeta?.metadata ?? {}) as Record<string, unknown>;
    const ultimo =
      typeof meta.handoff_por_lentidao_at === 'string'
        ? Date.parse(meta.handoff_por_lentidao_at)
        : Number.NaN;
    if (Number.isFinite(ultimo) && Date.now() - ultimo < JANELA_MS) {
      args.log.warn('handoff por lentidão: aviso recente — não repeti (anti-laço)', {
        conversation_id: args.conversationId,
      });
      return;
    }

    // 1) Destino dos avisos + sessão de envio.
    const { data: cfg } = await admin
      .from('conversation_summary_settings')
      .select('channel_session_id, destination, destination_is_group')
      .eq('organization_id', args.tenantId)
      .maybeSingle();
    const destino = (cfg?.destination ?? '').trim();
    if (!destino) {
      args.log.warn('handoff por lentidão: sem destino de avisos cadastrado — não avisei', {
        conversation_id: args.conversationId,
      });
      return;
    }
    const sessionId = cfg?.channel_session_id ?? (await sessaoProntaParaEnvio(admin, args.tenantId));
    if (!sessionId) {
      args.log.warn('handoff por lentidão: sem sessão de canal', { tenant_id: args.tenantId });
      return;
    }
    if (cfg?.destination_is_group) {
      // Grupo exigiria caminho próprio; para o aviso simples, só loga e segue.
      args.log.warn('handoff por lentidão: destino é grupo — pulei o envio', { tenant_id: args.tenantId });
      return;
    }

    // 2) Contato de destino (resolve/cria) — mesmo padrão do resumo.
    const digits = destino.replace(/\D/g, '');
    if (!digits) return;
    const existente = await encontrarContatoPorTelefone(admin as never, args.tenantId, digits);
    let contactId = existente?.id ?? null;
    if (!contactId) {
      const phone = canonicalPhoneBR(`+${digits}`);
      const { data, error } = await admin.rpc('fn_upsert_wa_contact' as never, {
        p_org: args.tenantId,
        p_kind: 'phone',
        p_phone: phone,
        p_lid: null,
        p_chat_id: digits,
        p_notify: null,
      } as never);
      if (error || !data) {
        args.log.warn('handoff por lentidão: não criei o contato do destino', {
          detail: error?.message ?? 'sem id',
        });
        return;
      }
      contactId = data as string;
    }

    // 3) Nome do cliente (contexto para o humano).
    let nome = '';
    if (args.contactId !== null) {
      const { data: c } = await admin
        .from('contacts')
        .select('name, phone_number')
        .eq('organization_id', args.tenantId)
        .eq('id', args.contactId)
        .maybeSingle();
      nome = (c?.name as string | null) ?? (c?.phone_number as string | null) ?? '';
    }

    const texto =
      `⚠️ Atendimento sem resposta automática\n` +
      `O modelo não respondeu após ${args.tentativas} tentativa(s) (tempo esgotado). ` +
      `${nome ? `Cliente: ${nome}. ` : ''}Assuma a conversa para responder o cliente.`;

    // 4) Envia pelo caminho canônico (mesmo do resumo), FORA da fronteira do
    // atendimento do lead: o aviso é para o número de resumos do responsável,
    // não um efeito no atendimento deste cliente. `ensureConversation` herda a
    // fronteira corrente e recusaria o contato de destino
    // (`service_scope_mismatch`) — por isso o envio roda como um cron.
    await semFronteiraDeAtendimento(async () => {
      const conversationId = await ensureConversation(admin, args.tenantId, contactId, sessionId);
      await sendMessageHandler(
        admin,
        {
          organization_id: args.tenantId,
          actor: { type: 'webhook_source', id: `handoff-lentidao:${args.conversationId}` },
          requestId: `handoff-lentidao:${args.conversationId}`,
        },
        { conversation_id: conversationId, type: 'text', body: texto } as Parameters<
          typeof sendMessageHandler
        >[2],
      );
    });
    await admin
      .from('conversations')
      .update({ metadata: { ...meta, handoff_por_lentidao_at: new Date().toISOString() } })
      .eq('organization_id', args.tenantId)
      .eq('id', args.conversationId);
    args.log.info('handoff por lentidão: aviso enviado ao responsável', {
      conversation_id: args.conversationId,
      tentativas: args.tentativas,
    });
  } catch (err) {
    args.log.warn('handoff por lentidão: não consegui avisar (best-effort)', {
      conversation_id: args.conversationId,
      erro: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
    });
  }
}
