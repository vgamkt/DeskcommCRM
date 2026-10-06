import { describe, expect, it } from "vitest";

import { temReferenciaAMoto } from "@/lib/agent-engine/agent/catalogo-da-conversa";
import type { MotoDoCatalogo } from "@/lib/agent-engine/agent/fotos-do-catalogo";

/**
 * TRAVA ESTRUTURAL contra "escolha inventada" (medido ao vivo 2026-10-06).
 *
 * O agente tinha mostrado 5 motos. O cliente respondeu "Gostei" (sem escolher) e,
 * noutro turno, "Sao paulo" (resposta de CIDADE). Nos DOIS a Jev foi consultada e
 * "escolheu" uma moto — e o agente passou a dizer "a moto que você escolheu", que
 * o cliente nunca escolheu. A trava: só é escolha se a mensagem (ou a citada)
 * fizer REFERÊNCIA a alguma moto mostrada (nome/trecho, ano ou cor).
 */

const CATALOGO: MotoDoCatalogo[] = [
  { nome: "HONDA CB 300 R FLEX", fotos: [], ano: "2015", cor: "Preto" },
  { nome: "HONDA CB 300 R", fotos: [], ano: "2011", cor: "Preto" },
  { nome: "HONDA CB 300 F Twister", fotos: [], ano: "2022", cor: "Vermelho" },
  { nome: "YAMAHA XMax 250", fotos: [], ano: "2023", cor: "Vermelho" },
];

describe("temReferenciaAMoto — só é escolha com referência a uma moto mostrada", () => {
  it("'Sao paulo' (resposta de cidade) NÃO referencia moto", () => {
    expect(temReferenciaAMoto("Sao paulo", "", CATALOGO)).toBe(false);
  });

  it("'Gostei' (afirmação sem alvo) NÃO referencia moto", () => {
    expect(temReferenciaAMoto("Gostei", "", CATALOGO)).toBe(false);
  });

  it("'ok' / 'quero comprar uma moto' não referenciam moto", () => {
    expect(temReferenciaAMoto("ok", "", CATALOGO)).toBe(false);
    expect(temReferenciaAMoto("quero comprar uma moto", "", CATALOGO)).toBe(false);
  });

  it("nome completo da moto referencia", () => {
    expect(temReferenciaAMoto("gostei da CB 300 R Flex", "", CATALOGO)).toBe(true);
  });

  it("trecho do nome (ex.: '300') referencia (mesmo que ambíguo)", () => {
    expect(temReferenciaAMoto("gostei da 300", "", CATALOGO)).toBe(true);
  });

  it("ano ('a de 2015') referencia", () => {
    expect(temReferenciaAMoto("quero a de 2015", "", CATALOGO)).toBe(true);
  });

  it("cor ('a preta') referencia", () => {
    expect(temReferenciaAMoto("essa preta", "", CATALOGO)).toBe(true);
  });

  it("citação de uma moto referencia mesmo com fala genérica ('gostei dessa')", () => {
    expect(temReferenciaAMoto("gostei dessa", "HONDA CB 300 R FLEX 2015 Preto", CATALOGO)).toBe(true);
  });
});
