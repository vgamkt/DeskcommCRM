import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ÁUDIO == TEXTO também no Intent Router.
 *
 * O turno já tratava áudio como texto em 3 pontos (loadInboundBodyForJob,
 * loadUnansweredInboundTexts, getLeadContext). O Intent Router ficou de fora:
 * lia só `body`, então um áudio (body vazio) virava signal=null e NÃO era
 * classificado por intenção — caía em fallback/genérico, enquanto o texto era
 * classificado normalmente. Medido na análise completa de 2026-10-06.
 */

const FONTE = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/resolve-turn-agent.ts"),
  "utf8",
);

describe("resolveConversationTurn — sinal do router vem do body OU da transcrição", () => {
  it("lê media_derived_text junto de body", () => {
    expect(FONTE).toMatch(/select body, media_derived_text from messages/);
    expect(FONTE).toMatch(/media_derived_text/);
  });

  it("prefere body e cai na transcrição quando o corpo é vazio", () => {
    expect(FONTE).toMatch(/signal = body !== '' \? body : \(row\.media_derived_text \?\? ''\)\.trim\(\)/);
  });
});
