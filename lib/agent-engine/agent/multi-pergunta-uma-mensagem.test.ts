import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ACUMULA ANTES → UMA MENSAGEM (decisão do dono, 2026-10-08).
 *
 * O cliente fala de qualquer jeito e pode trazer várias dúvidas/pedidos no mesmo
 * turno. O motor acumula o contexto (~20 mensagens) + skills + material + a
 * pergunta pendente do fluxo, e o modelo resolve TUDO numa única mensagem.
 * Antes isso era a flag MULTI_PERGUNTA (off por default); agora vale sempre.
 */
describe("bloco de tarefas do turno (uma mensagem)", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"),
    "utf8",
  );

  it("o bloco está sempre ativo e pede UMA única mensagem", () => {
    expect(src).toMatch(/Tarefas deste turno — RESOLVA TUDO EM UMA ÚNICA MENSAGEM/);
    expect(src).toMatch(/UMA única mensagem, natural e bem elaborada/);
    // Não depende mais da flag de A/B.
    expect(src).not.toMatch(/process\.env\.MULTI_PERGUNTA/);
  });

  it("manda incluir a pergunta pendente do fluxo na MESMA mensagem", () => {
    expect(src).toMatch(/pergunta pendente do fluxo[\s\S]*nessa mesma mensagem/);
  });
});
