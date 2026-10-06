import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { canalIsolado, AI_CANAL_ISOLADO_KEY } from "@/lib/escalacao/canal-isolado";
import { pausarIaDuravelmente } from "@/lib/escalacao/atendimento-manual";

/**
 * CANAL ISOLADO — o telefone pessoal/de teste não influencia o comercial.
 *
 * Medido ao vivo (2026-10-06): o dono respondeu um contato à mão pelo celular
 * pessoal (0101) e a Marcela parou de responder a MESMA pessoa no número
 * comercial (2501) — porque o silêncio durável é por CONTATO e valia em todos os
 * canais. Dois consertos, um só conceito (`channel_sessions.metadata.ai_isolado`):
 *   1. resposta manual em canal isolado NÃO grava o silêncio durável;
 *   2. silêncio existente em canal isolado NÃO conta como handoff para outro canal.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const T0 = new Date("2026-10-06T14:00:00.000Z");

function adminPorTabela(metadataDoCanal: unknown) {
  const updates: Array<Record<string, unknown>> = [];
  const makeChain = (table: string) => {
    const chain = {
      select: () => chain,
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return chain;
      },
      eq: () => chain,
      maybeSingle: () => {
        if (updates.length > 0) {
          return Promise.resolve({ data: { id: CONV }, error: null });
        }
        if (table === "channel_sessions") {
          return Promise.resolve({ data: { metadata: metadataDoCanal }, error: null });
        }
        return Promise.resolve({
          data: { bot_silenced_until: null, channel_session_id: "cs-1" },
          error: null,
        });
      },
    };
    return chain;
  };
  return { admin: { from: vi.fn((t: string) => makeChain(t)) } as never, updates };
}

describe("canalIsolado", () => {
  it("só `true` explícito isola; ausente/false/objeto estranho NÃO", () => {
    expect(canalIsolado({ [AI_CANAL_ISOLADO_KEY]: true })).toBe(true);
    expect(canalIsolado({ [AI_CANAL_ISOLADO_KEY]: false })).toBe(false);
    expect(canalIsolado({})).toBe(false);
    expect(canalIsolado(null)).toBe(false);
    expect(canalIsolado([])).toBe(false);
    expect(canalIsolado("true")).toBe(false);
  });
});

describe("pausarIaDuravelmente — canal isolado NÃO pausa", () => {
  it("resposta manual em canal isolado → não grava silêncio durável", async () => {
    const { admin, updates } = adminPorTabela({ [AI_CANAL_ISOLADO_KEY]: true });
    const pausou = await pausarIaDuravelmente(admin, {
      organizationId: ORG,
      conversationId: CONV,
      canal: "waha",
      agora: T0,
    });
    expect(pausou).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("canal NÃO isolado segue pausando (comportamento de sempre)", async () => {
    const { admin, updates } = adminPorTabela({});
    const pausou = await pausarIaDuravelmente(admin, {
      organizationId: ORG,
      conversationId: CONV,
      agora: T0,
    });
    expect(pausou).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it("`ai_isolado: false` explícito não isola", async () => {
    const { admin, updates } = adminPorTabela({ [AI_CANAL_ISOLADO_KEY]: false });
    await pausarIaDuravelmente(admin, { organizationId: ORG, conversationId: CONV, agora: T0 });
    expect(updates).toHaveLength(1);
  });
});

describe("isLeadInHandoff — silêncio de canal isolado não conta", () => {
  const fonte = fs.readFileSync(
    path.join(process.cwd(), "lib/agent-engine/agent/human-handoff.ts"),
    "utf8",
  );

  it("o EXISTS junta channel_sessions e exclui o canal isolado", () => {
    expect(fonte).toMatch(/join channel_sessions s/);
    expect(fonte).toMatch(/s\.metadata\s*->>\s*\$3/);
    expect(fonte).toMatch(/AI_CANAL_ISOLADO_KEY/);
  });
});
