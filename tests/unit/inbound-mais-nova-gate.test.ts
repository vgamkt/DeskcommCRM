import { describe, expect, it, vi } from "vitest";

import {
  haInboundMaisNova,
  jobInboundFoiSuperado,
} from "@/lib/agent-engine/guardrails/inbound-superado";
import type { Queryable } from "@/lib/agent-engine/queue/queue";

/**
 * "Inbound mais nova" — a checagem determinística que impede o turno de enviar
 * resposta VELHA (medido ao vivo 2026-10-06: a pergunta do CPF voltou depois de o
 * cliente já ter mandado o CPF). Compara a última inbound da conversa com a que o
 * turno responde — por id, não por tempo.
 */

const ORG = "org-1";
const CONV = "conv-1";

function db(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { db: { query } as unknown as Queryable, query };
}

describe("haInboundMaisNova", () => {
  it("última inbound diferente do gatilho → true (chegou mensagem mais nova)", async () => {
    const { db: d } = db([{ id: "msg-nova" }]);
    await expect(haInboundMaisNova(d, ORG, CONV, "msg-velha")).resolves.toBe(true);
  });

  it("última inbound igual ao gatilho → false (nada novo)", async () => {
    const { db: d } = db([{ id: "msg-x" }]);
    await expect(haInboundMaisNova(d, ORG, CONV, "msg-x")).resolves.toBe(false);
  });

  it("sem gatilho → false; sem linha → false", async () => {
    await expect(haInboundMaisNova(db([]).db, ORG, CONV, null)).resolves.toBe(false);
    await expect(haInboundMaisNova(db([]).db, ORG, CONV, "msg")).resolves.toBe(false);
  });

  it("falha de leitura NÃO veta envio (best-effort → false)", async () => {
    const quebrado = { query: vi.fn().mockRejectedValue(new Error("db down")) } as unknown as Queryable;
    await expect(haInboundMaisNova(quebrado, ORG, CONV, "msg")).resolves.toBe(false);
  });
});

describe("jobInboundFoiSuperado", () => {
  it("job inbound_turn com inbound mais nova → true", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ kind: "inbound_turn", conversation_id: CONV, inbound_message_id: "msg-velha" }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "msg-nova" }] });
    await expect(
      jobInboundFoiSuperado({ query } as unknown as Queryable, ORG, "job-1"),
    ).resolves.toBe(true);
  });

  it("job que NÃO é inbound_turn → false (não se aplica)", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ kind: "followup_turn", conversation_id: CONV, inbound_message_id: null }],
    });
    await expect(
      jobInboundFoiSuperado({ query } as unknown as Queryable, ORG, "job-2"),
    ).resolves.toBe(false);
  });

  it("sem jobId → false", async () => {
    await expect(jobInboundFoiSuperado(db([]).db, ORG, null)).resolves.toBe(false);
  });
});
