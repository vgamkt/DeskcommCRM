/**
 * Corpo do `PUT /api/v1/ai/providers` — DUAS operações no mesmo endpoint:
 *
 *  1. gravar a escolha de um PONTO (`purpose` + `provider` + `model_id`);
 *  2. gravar a RESERVA GLOBAL (`fallback_provider` + `fallback_model`).
 *
 * ─── O defeito que fez este schema sair da rota ────────────────────────────
 *
 * `provider` e `model_id` continuaram OBRIGATÓRIOS quando a reserva foi
 * acrescentada. A tela manda só `fallback_*`, o `safeParse` reprovava antes de
 * chegar ao ramo da reserva e o card devolvia `422 invalid_body` ("provider:
 * expected string, received undefined"). Ou seja: o card existia, explicava a
 * reserva e **nunca gravava** — medido em 2026-10-21, salvando pela tela.
 *
 * A obrigatoriedade é da OPERAÇÃO, não do corpo: quem grava um ponto precisa de
 * provedor e modelo (a rota confere isso no ramo do ponto, com a mensagem que o
 * operador lê); quem grava a reserva precisa de `fallback_*`. Por isso o schema
 * aceita os campos como opcionais e o ramo decide — é o mesmo critério que a
 * rota já usava para `reserva_incompleta`.
 */
import { z } from "zod";

import { ehProvedorDeJev } from "../jev/provedores";
import { ehProvedorSuportado } from "./provedores";

export const corpoDoPut = z.object({
  purpose: z.string().min(1).optional(),
  fallback_provider: z.string().min(1).nullable().optional(),
  fallback_model: z.string().min(1).nullable().optional(),
  // A migration 0127 removeu os CHECKs do banco dizendo que "a garantia de que
  // a tela não oferece opção inválida passa a morar" na lista de provedores —
  // mas a lista não era aplicada em NENHUM ponto de escrita. Um PUT direto (e a
  // API é pública) gravava `provider: "foobar"`, a rota respondia 200, e todo
  // uso daquele ponto morria em produção com provedor desconhecido. Metade da
  // defesa transferida e nunca instalada.
  provider: z
    .string()
    .min(1)
    .refine((id: string) => ehProvedorSuportado(id) || ehProvedorDeJev(id), {
      message:
        "provedor não suportado por esta instalação — escolha um da lista em Agente de IA → Provedores",
    })
    .optional(),
  model_id: z.string().min(1).optional(),
  credential_id: z.string().uuid().nullable().optional(),
  base_url: z.string().url().nullable().optional(),
  is_enabled: z.boolean().optional(),
});

export type CorpoDoPut = z.infer<typeof corpoDoPut>;

/** O corpo é da RESERVA global (e não de um ponto)? */
export function ehCorpoDeReserva(corpo: CorpoDoPut): boolean {
  return corpo.fallback_provider !== undefined || corpo.fallback_model !== undefined;
}
