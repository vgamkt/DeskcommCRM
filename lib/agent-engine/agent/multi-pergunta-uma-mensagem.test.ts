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

/**
 * PEDIDO DE HUMANO → ABRE CASO, NÃO SILENCIA (decisão do dono, 2026-10-08).
 *
 * O bot deve SEMPRE responder. Antes, o pedido explícito de humano (detecção
 * determinística) chamava `performHumanHandoff` + `return`, SILENCIANDO o bot e
 * deixando o cliente mudo para sempre. Agora abre um caso e o turno segue.
 */
describe("pedido de humano abre caso e o bot segue respondendo", () => {
  const src = readFileSync(join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");

  it("o ramo do pedido de humano abre CASO e NÃO silencia", () => {
    const i = src.indexOf("detectHumanHandoffRequest(texto)");
    const bloco = src.slice(i, i + 1600);
    expect(bloco).toMatch(/openCase\(/);
    expect(bloco).toMatch(/o bot SEGUE respondendo/);
    // Não pode mais CHAMAR o handoff que silencia neste ramo.
    expect(bloco).not.toMatch(/await performHumanHandoff\(/);
    expect(bloco).not.toMatch(/return; \/\/ bot silencia/);
  });
});
