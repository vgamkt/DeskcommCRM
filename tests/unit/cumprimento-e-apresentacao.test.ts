import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { renderAgora } from "@/lib/tempo/agora";

/**
 * DOIS DEFEITOS MEDIDOS AO VIVO (2026-10-06, número comercial 2501):
 *
 *   18:12:52  "Olá, bom dia! Sou a Marcela, da Valle Motos..."        (1ª vez: certo)
 *   18:14:05  "Bom dia, Vander! Aqui é a Marcela, da Valle Motos."    (repetiu!)
 *
 * E o horário: 15h da tarde em America/Sao_Paulo, mas a IA disse "bom dia" —
 * copiou o cumprimento do cliente em vez de olhar o relógio.
 */

const INSTANTE = new Date("2026-09-04T03:30:00Z"); // sexta 00:30 em SP

describe("renderAgora — cumprimentar pelo relógio", () => {
  it("manda a IA escolher o cumprimento pela hora do bloco, não pela fala do cliente", () => {
    const bloco = renderAgora(INSTANTE, "America/Sao_Paulo");
    expect(bloco).toMatch(/até 12h/i);
    expect(bloco).toMatch(/boa tarde/i);
    expect(bloco).toMatch(/boa noite/i);
  });
});

const FONTE = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"),
  "utf8",
);

describe("turno — não se reapresentar quando já falamos", () => {
  it("calcula se já há fala NOSSA no histórico", () => {
    expect(FONTE).toMatch(/const jaFalamosComOCliente = effectiveContext\.messages\.some\(/);
    expect(FONTE).toMatch(/m\.direction === 'outbound'/);
  });

  it("injeta o bloco anti-reapresentação na abertura", () => {
    expect(FONTE).toMatch(/## Você já falou com este cliente/);
    expect(FONTE).toMatch(/NÃO se apresente de novo/);
  });
});
