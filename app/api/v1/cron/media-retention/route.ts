/**
 * GET /api/v1/cron/media-retention — limpeza automática de mídia por organização.
 *
 * Roda de HORA EM HORA (scheduler). A própria rota decide se é a hora/frequência
 * configurada em `organizations.settings.mediaCleanup` e, se for, apaga no bucket
 * `whatsapp-media` a mídia mais velha que a retenção — respeitando:
 *   - direção (enviadas/recebidas/ambas);
 *   - EXCEÇÃO de conversa com atividade recente (`excecaoHoras`): o "pedido"
 *     recente não perde a mídia;
 *   - `media_url` também é limpo, senão a rota de mídia baixaria de novo do
 *     WhatsApp e o lixo voltaria.
 *
 * Auth: mesmo contrato dos outros crons (Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { Pool } from "pg";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  deveRodarAgora,
  direcoesDaConfiguracao,
  janelasDaConfiguracao,
  lerConfiguracaoDeLimpeza,
} from "@/lib/midia/limpeza";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const LOTE = 200;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const aceitos: string[] = [];
  if (env.INTERNAL_CRON_SECRET) aceitos.push(env.INTERNAL_CRON_SECRET);
  if (env.INTERNAL_SECRET) aceitos.push(env.INTERNAL_SECRET);
  if (aceitos.length === 0 || !provided || !aceitos.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const agora = new Date();
  const admin = createAdminClient();
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, timezone, settings");
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  const resultados: Array<{ org: string; apagados: number; motivo?: string }> = [];
  try {
    for (const org of orgs ?? []) {
      const settings = (org.settings as Record<string, unknown> | null) ?? {};
      const raw = settings.mediaCleanup as Record<string, unknown> | undefined;
      // Sem bloco configurado (ou desligado), a organização não é tocada.
      if (!raw || raw.ativo !== true) continue;

      const config = lerConfiguracaoDeLimpeza(settings);
      if (!deveRodarAgora(config, agora, (org.timezone as string) ?? "America/Sao_Paulo")) continue;

      const dirs = direcoesDaConfiguracao(config);
      if (dirs.length === 0) {
        resultados.push({ org: org.id as string, apagados: 0, motivo: "sem_direcao" });
        continue;
      }

      const { corte, atividadeRecente } = janelasDaConfiguracao(config, agora);
      const { rows } = await pool.query<{ id: string; media_storage_path: string }>(
        `select m.id, m.media_storage_path
           from messages m
           join conversations c on c.id = m.conversation_id
          where m.organization_id = $1
            and m.media_storage_path is not null
            and m.direction = any($2::text[])
            and m.created_at < $3
            and coalesce(c.last_message_at, c.created_at) < $4
          order by m.created_at asc
          limit $5`,
        [org.id, dirs, corte.toISOString(), atividadeRecente.toISOString(), LOTE],
      );

      let apagados = 0;
      let removidos = true;
      if (rows.length > 0) {
        const paths = rows.map((r) => r.media_storage_path);
        for (let i = 0; i < paths.length; i += 100) {
          const { error: rmErr } = await admin.storage
            .from("whatsapp-media")
            .remove(paths.slice(i, i + 100));
          if (rmErr) {
            removidos = false;
            logger.warn("[media-retention] storage remove falhou", {
              org: org.id,
              erro: rmErr.message,
            });
            break;
          }
        }
        // Só desvincula a mensagem se os BYTES saíram; senão o próximo ciclo
        // tentaria de novo um arquivo que ainda existe.
        if (removidos) {
          const ids = rows.map((r) => r.id);
          await pool.query(
            `update messages
                set media_storage_path = null,
                    media_url = null,
                    metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('media_status', 'cleaned', 'media_cleaned_at', $2)
              where organization_id = $1 and id = any($3::uuid[])`,
            [org.id, agora.toISOString(), ids],
          );
          apagados = ids.length;
        }
      }

      // Avança o relógio da frequência mesmo quando não havia nada a apagar.
      await admin
        .from("organizations")
        .update({
          settings: {
            ...settings,
            mediaCleanup: {
              ...raw,
              ultimaExecucao: removidos ? agora.toISOString() : raw.ultimaExecucao ?? null,
              ultimaQtd: apagados,
            },
          },
        })
        .eq("id", org.id as string);

      resultados.push({ org: org.id as string, apagados });
      logger.info("[media-retention] rodada", { org: org.id, apagados });
    }
  } finally {
    await pool.end();
  }

  return ok({ rodadas: resultados.length, resultados }, { requestId });
}
