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
 * PEDIDO DE HUMANO → ABRE CASO, AVISA E ENCERRA O TURNO (decisão do dono,
 * 2026-10-21).
 *
 * O cliente pediu uma pessoa: o bot manda a mensagem de transferência e para.
 * Não emenda pergunta de venda ("Qual moto você pretende dar na troca?" foi
 * medido no pesado). Só volta a responder se o cliente mandar outra mensagem —
 * por isso o ramo não grava `force_human`.
 */
describe("pedido de humano abre caso, avisa e encerra o turno", () => {
  const src = readFileSync(join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");

  it("o ramo do pedido de humano abre CASO, envia o aviso e retorna", () => {
    const i = src.indexOf("const inboundsPendentes = inboundsNaoRespondidos");
    const bloco = src.slice(i, i + 2600);
    expect(bloco).toMatch(/openCase\(/);
    expect(bloco).toMatch(/pediuHumanoNoTurno/);
    expect(bloco).toMatch(/detectHumanHandoffRequest\(mensagemDoTurnoParaJev\)/);
    expect(bloco).toMatch(/avisarLeadDaEscalacao\(/);
    expect(bloco).toMatch(/motivo: 'pediu_humano'/);
    // O aviso é guardado pelo buffer da junção: sem liberar, o turno termina
    // com `sent` sintético e o cliente não recebe nada.
    expect(bloco).toMatch(/liberarAvisoDeterministico\('pedido_de_humano'\)/);
    expect(bloco).toMatch(/return; \/\/ bot para aqui/);
    // Não pode gravar force_human: o próximo inbound precisa poder ser respondido.
    expect(bloco).not.toMatch(/await performHumanHandoff\(/);
  });
});

/**
 * ANTI-DUPLICAÇÃO NÃO PODE VIRAR 2º FECHO (medido 2026-10-21, pesado).
 *
 * A trava que impediu o turno "escolha + objeção" de ficar mudo não pode deixar
 * passar uma 2ª bolha de texto fora de objeção: o turno "moto para cidade" saiu
 * com dois fechos ("Alguma delas é a sua praia...?" e "Desculpa, ficou
 * faltando..."). Quem libera a resposta nova é o estado de objeção/negociação
 * decidido pela JEV — nunca regex.
 */
describe("anti-duplicação: resposta nova só em objeção/negociação", () => {
  const src = readFileSync(join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"), "utf8");

  it("a 2ª bolha de texto após apresentação automática é barrada fora de objeção", () => {
    const i = src.indexOf("const emObjecaoNoTurno");
    expect(i).toBeGreaterThan(-1);
    const bloco = src.slice(i, i + 900);
    expect(bloco).toMatch(/faseObjecaoTurno !== null \|\| motivoNegociacao !== null/);
    expect(bloco).toMatch(/repeteApresentacao \|\| !emObjecaoNoTurno/);
  });
});
