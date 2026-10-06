/**
 * GET/PUT /api/v1/ai/resumo-de-conversas — configuração do informante.
 *
 * GET (manager+): devolve a configuração da org, as sessões de canal (para o
 * seletor de envio) e o binding atual do ponto `resumo_de_conversas` (qual
 * provedor/modelo resume) — este último é configurado em Provedores, não aqui.
 *
 * PUT (admin): grava ligado/desligado, sessão, destino, cadência e lote.
 *
 * O modelo que gera o resumo é um PONTO de IA (`resumo_de_conversas`), então a
 * escolha de chave (a 2ª conta Groq, por exemplo) mora no painel de Provedores,
 * como qualquer outro ponto — a tela daqui só mostra QUAL está em uso e linka.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK } from "@/lib/auth/types";
import { capabilitiesOf } from "@/lib/channels/capabilities";
import type { ChannelProvider } from "@/lib/channels";
import { PONTO_RESUMO_DE_CONVERSAS } from "@/lib/conversas/ponto";
import { PROMPT_PADRAO_DO_RESUMO } from "@/lib/conversas/resumo";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SETTINGS_COLUMNS =
  "enabled, channel_session_id, destination, destination_is_group, destination_group, channel_session_id_group, source_channel_session_ids, exclude_numbers, interval_minutes, batch_size, instructions, failure_alerts, updated_at";

/** Regra de aviso de falha POR AGENTE: número que ENVIA + número que RECEBE. */
const regraAlertaSchema = z.object({
  agent_id: z.string().uuid(),
  channel_session_id: z.string().uuid().nullable(),
  destination: z.string().trim().max(40).nullable(),
  enabled: z.boolean().default(true),
});

const putSchema = z.object({
  enabled: z.boolean(),
  channel_session_id: z.string().uuid().nullable(),
  destination: z.string().trim().max(40).nullable(),
  destination_is_group: z.boolean().default(false),
  // Destino de GRUPO independente do número: pode coexistir com `destination`.
  destination_group: z.string().trim().max(120).nullable().optional(),
  channel_session_id_group: z.string().uuid().nullable().optional(),
  // Canais (números do sistema) resumidos. Vazio = TODOS os canais.
  source_channel_session_ids: z.array(z.string().uuid()).max(200).optional(),
  // Números de cliente que NÃO são resumidos. Vazio = nenhum excluído.
  exclude_numbers: z.array(z.string().trim().min(1).max(40)).max(500).optional(),
  interval_minutes: z.number().int().min(1).max(1440),
  batch_size: z.number().int().min(1).max(200),
  instructions: z.string().max(4000).nullable().optional(),
  failure_alerts: z.array(regraAlertaSchema).max(50).optional(),
});

const PADRAO = {
  enabled: false,
  channel_session_id: null as string | null,
  destination: null as string | null,
  destination_is_group: false,
  destination_group: null as string | null,
  channel_session_id_group: null as string | null,
  source_channel_session_ids: [] as string[],
  exclude_numbers: [] as string[],
  interval_minutes: 15,
  batch_size: 20,
  instructions: null as string | null,
  failure_alerts: [] as Array<z.infer<typeof regraAlertaSchema>>,
  updated_at: null as string | null,
};

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_resumo_de_conversas" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("conversation_summary_settings")
    .select(SETTINGS_COLUMNS)
    .eq("organization_id", orgId)
    .maybeSingle();

  const { data: sessoes } = await supabase
    .from("channel_sessions")
    .select("id, display_name, phone_number, provider, status")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  const { data: binding } = await supabase
    .from("ai_purpose_bindings")
    .select("provider, model_id, credential_id, is_enabled")
    .eq("organization_id", orgId)
    .eq("purpose", PONTO_RESUMO_DE_CONVERSAS)
    .maybeSingle();

  // Agentes ativos da org — destino do seletor "quais agentes avisam aqui".
  const { data: agentes } = await supabase
    .from("ai_agents")
    .select("id, name")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  return ok(
    {
      settings: settings ?? PADRAO,
      /** Texto padrão do prompt — a tela usa para preencher a caixa quando vazia. */
      prompt_padrao: PROMPT_PADRAO_DO_RESUMO,
      sessoes: (sessoes ?? []).map((s) => ({
        ...s,
        // O envio a GRUPO só existe em canal por QR (`groups: "full"`). A tela
        // usa para avisar quando o número escolhido não envia a grupo.
        pode_enviar_grupo: capabilitiesOf((s as { provider: string }).provider as ChannelProvider).groups === "full",
      })),
      agentes: agentes ?? [],
      binding: binding ?? null,
      pode_editar: ROLE_RANK[authz.org.role] >= ROLE_RANK.admin,
    },
    { requestId },
  );
}

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_resumo_de_conversas" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from("conversation_summary_settings").upsert(
    {
      organization_id: orgId,
      enabled: input.enabled,
      channel_session_id: input.channel_session_id,
      destination: input.destination,
      destination_is_group: input.destination_is_group,
      destination_group: input.destination_group ?? null,
      channel_session_id_group: input.channel_session_id_group ?? null,
      source_channel_session_ids: input.source_channel_session_ids ?? [],
      exclude_numbers: input.exclude_numbers ?? [],
      // Zera o cache do contato do destino: ele é resolvido no próximo envio.
      // Sem isto, trocar o destino deixava o contato VELHO gravado — e a guarda
      // anti-laço passava a pular a conversa do cliente errado.
      destination_contact_id: null,
      interval_minutes: input.interval_minutes,
      batch_size: input.batch_size,
      instructions: input.instructions ?? null,
      failure_alerts: input.failure_alerts ?? [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) {
    return fail("internal_error", t("Não foi possível salvar a configuração."), 500, { requestId });
  }

  await audit({
    action: "ai.resumo_de_conversas_configurado",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "conversation_summary_settings",
    resourceId: orgId,
    requestId,
    metadata: {
      enabled: input.enabled,
      destination_is_group: input.destination_is_group,
      interval_minutes: input.interval_minutes,
      batch_size: input.batch_size,
    },
  });

  const { data: settings } = await (await createClient())
    .from("conversation_summary_settings")
    .select(SETTINGS_COLUMNS)
    .eq("organization_id", orgId)
    .maybeSingle();

  return ok({ settings: settings ?? PADRAO }, { requestId });
}
