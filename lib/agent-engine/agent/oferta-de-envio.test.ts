/**
 * CAMADA 1 — "oferta só existe se a decisão liberar".
 *
 * Prova o contrato do conserto: o parâmetro `motos` do `send_message` SÓ é
 * entregue ao modelo quando a decisão de oferta do turno libera. Sem isso, a IA
 * tenta enviar uma oferta que a régua vai bloquear — e re-tenta até o timeout
 * (bug medido ao vivo: `breaker: same_tool_failure`, `agent_turn aborted`).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { inputSchemaDeEnvio } from "./oferta-de-envio";

const base = z.object({
  body: z.string().min(1),
  motos: z.array(z.string().min(1)).max(10).optional(),
  fonte_ids: z.array(z.string().min(1)).max(12).optional(),
});

describe("inputSchemaDeEnvio", () => {
  it("oferta NEGADA: o schema não expõe `motos` — a IA não pode declarar oferta", () => {
    const schema = inputSchemaDeEnvio(base, false);
    expect(Object.keys(schema.shape)).not.toContain("motos");
    const r = schema.safeParse({ body: "oi", motos: ["CG 160 Fan"] });
    // zod remove chave desconhecida → `motos` não sobrevive ao parse
    expect(r.success).toBe(true);
    expect(r.success && "motos" in (r.data as object)).toBe(false);
  });

  it("oferta LIBERADA: o schema mantém `motos` — nada muda no caminho feliz", () => {
    const schema = inputSchemaDeEnvio(base, true);
    expect(Object.keys(schema.shape)).toContain("motos");
    const r = schema.safeParse({ body: "oi", motos: ["CG 160 Fan"] });
    expect(r.success).toBe(true);
    expect(r.success && (r.data as { motos?: string[] }).motos).toEqual(["CG 160 Fan"]);
  });

  it("não muta o schema de origem", () => {
    inputSchemaDeEnvio(base, false);
    expect(Object.keys(base.shape)).toContain("motos");
  });
});
