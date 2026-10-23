import { describe, expect, it } from "vitest";

import { ajustarContagemDaApresentacao } from "@/lib/agent-engine/agent/inbound-turn";

describe("contagem da apresentação = fotos da etapa", () => {
  it("1ª: 'essa e mais uma' com 2 motos continua 2 no total", () => {
    expect(ajustarContagemDaApresentacao("Dá uma olhada nessa e em mais uma opção.", 2, false)).toBe(
      "Dá uma olhada nessa e em mais uma opção.",
    );
  });

  it("1ª: corrige 'separei 3 opções' para o que saiu (2)", () => {
    expect(ajustarContagemDaApresentacao("Separei 3 opções pra você.", 2, false)).toBe(
      "Separei duas opções pra você.",
    );
  });

  it("2ª ('ver mais'): 'mais 2' são as 2 NOVAS da etapa", () => {
    expect(ajustarContagemDaApresentacao("Separei mais 2 opções.", 2, true)).toBe(
      "Separei mais 2 opções.",
    );
    expect(ajustarContagemDaApresentacao("Separei mais 2 opções.", 3, true)).toBe(
      "Separei mais três opções.",
    );
  });

  it("não mexe em cilindrada nem em quilometragem", () => {
    const t = "A CG 160 está com 2.000 km.";
    expect(ajustarContagemDaApresentacao(t, 2, false)).toBe(t);
  });
});
