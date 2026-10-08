import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET/PUT /api/v1/ai/transcription — a CADEIA de transcrição de áudio do cliente.
 *
 * A transcrição é o PRIMEIRO passo do fluxo de mídia (o turno do agente só segue
 * depois que o áudio vira texto), então quem ela usa decide se o agente "ouve" ou
 * não. Até aqui o ponto era fixo no produto e a tela não deixava trocar; agora o
 * operador monta uma CADEIA ORDENADA — principal, reservas, na ordem — e cada
 * posição aceita qualquer provedor de transcrição, inclusive Deepgram.
 *
 * A escolha vive em `ai_transcription_targets` (uma linha por posição), não em
 * `ai_purpose_bindings`: uma lista ORDENADA não cabe em um binding por purpose.
 *
 * GET  — manager+ lê a cadeia, os provedores de transcrição, as chaves da org e
 *        os modelos disponíveis.
 * PUT  — admin substitui a cadeia inteira, de forma ATÔMICA (RPC
 *        `fn_guardar_cadeia_de_transcricao`). Recusa provedor que não transcreve
 *        e chave de outro provedor/org.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import {
  OPCOES_DE_TRANSCRICAO,
  PROVEDORES_DE_TRANSCRICAO,
  ehProvedorDeTranscricao,
} from "@/lib/ai/pontos/provedores";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

const alvoSchema = z.object({
  provider: z
    .string()
    .min(1)
    .refine(ehProvedorDeTranscricao, {
      message: "provedor não transcreve áudio — escolha Groq, OpenAI, OpenRouter ou Deepgram",
    }),
  model_id: z.string().trim().min(1),
  credential_id: z.string().uuid().nullable().optional(),
  base_url: z.string().url().nullable().optional(),
});

const corpoDoPut = z.object({
  // Teto generoso: uma cadeia de mais de 10 provedores de transcrição não existe
  // na prática e um array ilimitado é vetor de abuso.
  alvos: z.array(alvoSchema).max(10),
});

export async function GET(): Promise<Response> {
  const authz = await requireRole("manager", { resource: "ai_providers" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const db = await createClient();

  const [alvosRes, credsRes, modelosRes] = await Promise.all([
    db
      .from("ai_transcription_targets")
      .select("id, position, provider, model_id, credential_id, base_url, is_enabled")
      .eq("organization_id", org.orgId)
      .order("position", { ascending: true }),
    db
      .from("ai_provider_credentials")
      .select("id, provider, label, api_key_last4")
      .eq("organization_id", org.orgId)
      .eq("is_active", true)
      .in("provider", [...PROVEDORES_DE_TRANSCRICAO]),
    db
      .from("ai_models")
      .select("provider, model_id, display_name")
      .in("provider", [...PROVEDORES_DE_TRANSCRICAO])
      .is("deprecated_at", null)
      .order("provider")
      .order("display_name"),
  ]);

  return ok({
    alvos: alvosRes.data ?? [],
    provedores: OPCOES_DE_TRANSCRICAO,
    credenciais: credsRes.data ?? [],
    modelos: modelosRes.data ?? [],
    podeEditar: roleAtLeast(org.role, "admin"),
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const authz = await requireRole("admin", { resource: "ai_providers" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  const parsed = corpoDoPut.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_body", t("corpo inválido"), 422, { details: parsed.error.issues });
  }
  const alvos = parsed.data.alvos;

  const db = await createClient();

  // Cada chave precisa ser DESTA organização e do MESMO provedor do alvo — a
  // mesma catraca do painel de provedores. Chave de outro provedor faria o
  // endpoint recusar a chamada; pegar aqui é o que dá à tela a chance de
  // corrigir antes de gravar.
  for (const alvo of alvos) {
    if (!alvo.credential_id) continue;
    const { data: cred } = await db
      .from("ai_provider_credentials")
      .select("id, provider")
      .eq("id", alvo.credential_id)
      .eq("organization_id", org.orgId)
      .maybeSingle();
    if (!cred) return fail("credencial_invalida", t("chave não encontrada nesta organização"), 422);
    if (cred.provider !== alvo.provider) {
      return fail(
        "credencial_de_outro_provedor",
        `a chave escolhida é de ${cred.provider}, mas o provedor do alvo é ${alvo.provider}. ` +
          `Modelo e chave precisam ser do mesmo provedor.`,
        422,
      );
    }
  }

  const paraGravar = alvos.map((alvo, index) => ({
    position: index,
    provider: alvo.provider,
    model_id: alvo.model_id,
    credential_id: alvo.credential_id ?? null,
    base_url: alvo.base_url ?? null,
    is_enabled: true,
  }));

  const { error } = await db.rpc("fn_guardar_cadeia_de_transcricao", {
    p_organization_id: org.orgId,
    p_alvos: paraGravar,
  });
  if (error) return fail("save_failed", error.message, 500);

  void audit({
    action: "ai.transcription_chain_updated",
    organizationId: org.orgId,
    actorUserId: user.id,
    resourceType: "ai_transcription_targets",
    resourceId: org.orgId,
    // Os provedores/modelos entram; a credencial NÃO (nem o id) — o hábito de
    // mandar campo de credencial para o audit é o que acaba vazando a chave.
    metadata: {
      alvos: paraGravar.map((a) => ({ provider: a.provider, model_id: a.model_id })),
    },
  });

  return ok({ alvos: paraGravar });
}
