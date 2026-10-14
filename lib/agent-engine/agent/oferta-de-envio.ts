/**
 * CAMADA 1 — "oferta só existe se a decisão liberar" (conserto do loop de oferta).
 *
 * PROBLEMA (medido ao vivo 2026-10-10): o `send_message` sempre expunha o
 * parâmetro `motos`. Quando a decisão de oferta do turno NEGAVA a oferta (a Jev
 * negou, ou há fluxo de atendimento ativo), a IA tentava enviar motos mesmo
 * assim, a régua bloqueava com erro, e a IA RE-TENTAVA até estourar o timeout do
 * turno (`breaker: same_tool_failure`, `agent_turn aborted`).
 *
 * CONSERTO: a ferramenta passa a refletir a decisão. Se a oferta NÃO está
 * liberada, `motos` não existe no schema entregue ao modelo — ele simplesmente
 * não consegue declarar uma oferta (e não há erro para re-tentar). Assim a
 * ferramenta e a régua concordam por construção, sem bypass.
 *
 * A tipagem é preservada de propósito (`z.ZodObject<S>`): o campo `motos` é
 * OPCIONAL, então quem lê `motos` continua válido e, quando ausente, recebe
 * `undefined` — nada quebra no consumo.
 */
import type { z } from "zod";

export function inputSchemaDeEnvio<S extends z.ZodRawShape>(
  base: z.ZodObject<S>,
  ofertaLiberada: boolean,
): z.ZodObject<S> {
  if (ofertaLiberada) return base;
  return base.omit({ motos: true } as never) as unknown as z.ZodObject<S>;
}
