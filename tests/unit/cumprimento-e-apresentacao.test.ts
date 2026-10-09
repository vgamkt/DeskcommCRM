import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * DOIS DEFEITOS MEDIDOS AO VIVO (2026-10-06, número comercial 2501):
 *
 *   18:12:52  "Olá, bom dia! Sou a Marcela, da Valle Motos..."        (1ª vez: certo)
 *   18:14:05  "Bom dia, Vander! Aqui é a Marcela, da Valle Motos."    (repetiu!)
 *
 * E o horário: 15h da tarde em America/Sao_Paulo, mas a IA disse "bom dia" —
 * copiou o cumprimento do cliente em vez de olhar o relógio.
 *
 * Conserto: a regra de cumprir pelo relógio saiu do bloco `## Agora` (que entra
 * em TODO turno) e foi para um bloco de PRIMEIRO contato — só aparece quando
 * ainda não há fala NOSSA no histórico.
 */

const FONTE = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"),
  "utf8",
);

describe("turno — cumprimentar pelo relógio SÓ no primeiro contato", () => {
  it("a regra de cumprimento está no bloco de primeiro contato, condicionado a !jaFalamosComOCliente", () => {
    expect(FONTE).toMatch(/const saudacaoPrimeiroContato = !jaFalamosComOCliente/);
    expect(FONTE).toMatch(/## Primeiro contato/);
    // Determinístico: o texto exato do cumprimento vem do relógio (saudacaoDoHorario),
    // não de prosa que o modelo pode ignorar (defeito medido 2026-10-09: 02:01 → "bom dia").
    expect(FONTE).toMatch(/saudacaoDoHorario\(clock\(\), fusoDaOrg\)/);
  });

  it("o bloco entra na abertura (openingSuffixes)", () => {
    expect(FONTE).toMatch(/saudacaoPrimeiroContato,\n/);
  });
});

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
