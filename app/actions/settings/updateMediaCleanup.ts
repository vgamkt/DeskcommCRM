"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { mediaCleanupSchema, type MediaCleanupInput } from "@/lib/schemas/settings";
import { createAdminClient } from "@/lib/supabase/admin";

export type UpdateMediaCleanupResult = { ok: true } | { ok: false; error: string };

/**
 * Salva a limpeza automática de mídia em `organizations.settings.mediaCleanup`.
 *
 * A escrita em `organizations` vai pelo admin client (a policy de escrita exige
 * platform admin), com o gate de papel resolvido de fonte confiável aqui e o
 * filtro por `organization_id` explícito — mesmo desenho de `updateTenant`.
 */
export async function updateMediaCleanup(input: MediaCleanupInput): Promise<UpdateMediaCleanupResult> {
  const parsed = mediaCleanupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed" };

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }

  const supabase = createAdminClient();
  const { data: row, error: readErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const atual = (row?.settings as Record<string, unknown> | null) ?? {};
  const anterior = (atual.mediaCleanup as Record<string, unknown> | null) ?? {};
  const nextSettings = {
    ...atual,
    mediaCleanup: {
      ...parsed.data,
      // Preserva o histórico de execução; o formulário não o edita.
      ultimaExecucao:
        typeof anterior.ultimaExecucao === "string" ? anterior.ultimaExecucao : null,
      ultimaQtd: typeof anterior.ultimaQtd === "number" ? anterior.ultimaQtd : 0,
    },
  };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", activeOrg.orgId);
  if (error) return { ok: false, error: error.message };

  await audit({
    action: "org.updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    metadata: { fields_changed: ["media_cleanup"], media_cleanup: parsed.data },
  });

  revalidatePath("/app/integracao-dados");
  return { ok: true };
}
