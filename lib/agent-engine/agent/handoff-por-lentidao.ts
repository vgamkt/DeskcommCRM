/**
 * HANDOFF POR LENTIDÃO — avisa o humano quando o modelo do turno esgota as
 * tentativas (travou). É a parte de AVISAR da trava anti-travamento: o turno
 * segue sem segurar a fila e o responsável recebe o alerta.
 *
 * Envia para o NÚMERO PRÓPRIO configurado na tela do agente
 * (`handoffNotificationNumber`, coluna `ai_agent_versions.handoff_notification_number`).
 * Deixou de usar `conversation_summary_settings.destination` (número de RESUMOS):
 * são coisas diferentes, e o dono quer poder separá-las.
 *
 * A sessão de envio (o número que MANDA) vem do canal do agente — o mesmo que
 * atende o cliente. Best-effort: falha só loga (o turno já terminou).
 */
import { canonicalPhoneBR } from '@/lib/channels/phone-variants';
import { encontrarContatoPorTelefone } from '@/lib/channels/contato-por-telefone';
import { ensureConversation } from '@/lib/automation/start-conversation';
import { createAdminClient } from '@/lib/supabase/admin';
import { semFronteiraDeAtendimento } from '@/lib/atendimento/fronteira-server';
import { sendMessageHandler } from '@/app/api/v1/messages/_handler';

import type { Logger } from '../obs/logger';

interface AlertaDeFalha {
  channelSessionId: string | null;
  destination: string | null;
}

/**
 * Traduz o erro técnico do turno numa causa legível para o aviso de falha. Nunca
 * lança. Sem causa, assume o caso mais comum (o provedor de IA não respondeu).
 */
export function explicarCausa(causa: string | null | undefined): string {
  const bruto = (causa ?? '').trim();
  if (!bruto) return 'o provedor de IA não respondeu a tempo';

  const c = bruto.toLowerCase();
  if (/llm_calls_contact_id_fkey|foreign key.*contact/.test(c)) {
    return 'o contato foi removido durante o atendimento (o registro do histórico foi recusado)';
  }
  if (/timeout|abort|timed out|etimedout/.test(c)) {
    return 'tempo esgotado ao falar com o provedor de IA';
  }
  if (/401|403|unauthor|invalid.*(token|key)|chave/.test(c)) {
    return 'credencial/chave do provedor de IA inválida';
  }
  if (/429|rate limit|limite de uso/.test(c)) {
    return 'limite de uso do provedor de IA atingido';
  }
  if (/131042|payment|pagamento|billing|faturamento|currency|moeda|eligibility/.test(c)) {
    return 'a conta do WhatsApp Business está com pendência de pagamento/faturamento (verifique o cartão no Meta)';
  }
  if (/50[0-9]|overloaded|fetch failed|econnreset|econnrefused|network/.test(c)) {
    return 'instabilidade de rede/provedor de IA';
  }
  return `falha no turno: ${bruto.slice(0, 160)}`;
}

/**
 * Regra de aviso de falha do AGENTE, na config central do informante
 * (`conversation_summary_settings.failure_alerts`): `{ channel_session_id,
 * destination }`. `null` = não avisa. Nunca lança.
 */
export async function resolverAlertaDeFalha(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  agentId: string,
): Promise<AlertaDeFalha | null> {
  try {
    const { data } = await admin
      .from('conversation_summary_settings')
      .select('failure_alerts')
      .eq('organization_id', orgId)
      .maybeSingle();
    const bruto = (data as { failure_alerts?: unknown } | null)?.failure_alerts;
    if (!Array.isArray(bruto)) return null;
    const regra = (bruto as Array<Record<string, unknown>>).find(
      (r) => r.agent_id === agentId && r.enabled !== false,
    );
    if (regra === undefined) return null;
    return {
      channelSessionId: typeof regra.channel_session_id === 'string' ? regra.channel_session_id : null,
      destination: typeof regra.destination === 'string' ? regra.destination : null,
    };
  } catch {
    return null;
  }
}

export async function enviarHandoffPorLentidao(
  _pool: unknown,
  args: {
    tenantId: string;
    /** Canal que ENVIA o aviso — o mesmo do agente que travou. */
    channelSessionId: string | null;
    /** Telefone (só dígitos) que RECEBE o aviso. Vazio = não avisa. */
    notificationNumber: string | null;
    conversationId: string;
    contactId: string | null;
    tentativas: number;
    /** Agente que falhou — para resolver a regra de aviso central (`failure_alerts`). */
    agentId?: string | null;
    /**
     * Contexto do aviso (mesma frase no WhatsApp). Default = lentidão do modelo;
     * o encaminhamento por negociação (cliente negou as opções) reusa o canal.
     */
    motivo?: 'lentidao' | 'negociacao' | 'sem_resposta' | 'envio_falhou';
    /** Erro que causou a falha (ex.: mensagem da exceção do turno). Vai no aviso. */
    causa?: string | null;
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

    // 1) Número RECEBE (só dígitos) + número ENVIA (canal). A config central do
    // informante manda: se o chamador não passou um número explícito, resolve
    // pela regra do AGENTE (`failure_alerts`) — número que envia + que recebe.
    let digits = (args.notificationNumber ?? "").replace(/\D/g, '');
    let sessionId = args.channelSessionId;
    if (!digits && args.agentId) {
      const alerta = await resolverAlertaDeFalha(admin, args.tenantId, args.agentId);
      if (alerta !== null) {
        digits = (alerta.destination ?? "").replace(/\D/g, '');
        if (alerta.channelSessionId) sessionId = alerta.channelSessionId;
      }
    }
    if (!digits) {
      args.log.warn('handoff por lentidão: agente sem número de aviso configurado — não avisei', {
        conversation_id: args.conversationId,
      });
      return;
    }
    if (!sessionId) {
      args.log.warn('handoff por lentidão: sem sessão de canal para enviar', {
        tenant_id: args.tenantId,
      });
      return;
    }

    // 2) Contato de destino (resolve/cria) — mesmo padrão do resumo.
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

    // 3) Nome + telefone do cliente (contexto para o humano) — o NÚMERO que não
    // foi respondido precisa aparecer no aviso.
    let nome = '';
    let telefone = '';
    if (args.contactId !== null) {
      const { data: c } = await admin
        .from('contacts')
        .select('name, phone_number')
        .eq('organization_id', args.tenantId)
        .eq('id', args.contactId)
        .maybeSingle();
      nome = ((c?.name as string | null) ?? '').trim();
      telefone = ((c?.phone_number as string | null) ?? '').trim();
    }
    const quem =
      nome && telefone
        ? `${nome} (${telefone})`
        : nome || telefone || 'cliente sem identificação';
    const causa = explicarCausa(args.causa);

    const texto =
      args.motivo === 'negociacao'
        ? `⚠️ Atendimento aguardando um humano\n` +
          `O cliente não aceitou as opções apresentadas na negociação. ` +
          `Cliente: ${quem}. Assuma a conversa para responder o cliente.`
        : args.motivo === 'sem_resposta'
          ? `⚠️ Atendimento sem resposta automática\n` +
            `Número não respondido: ${quem}.\n` +
            `Motivo: ${causa}.\n` +
            `Assuma a conversa para responder o cliente.`
          : args.motivo === 'envio_falhou'
            ? `⚠️ NÃO consegui ENTREGAR a mensagem ao cliente\n` +
              `Número: ${quem}.\n` +
              `Motivo: ${causa}.\n` +
              `O cliente NÃO recebeu a resposta — assuma a conversa e responda manualmente.`
            : `⚠️ Atendimento sem resposta automática\n` +
            `Número não respondido: ${quem}.\n` +
            `Motivo: ${causa} (após ${args.tentativas} tentativa(s)).\n` +
            `Assuma a conversa para responder o cliente.`;

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
