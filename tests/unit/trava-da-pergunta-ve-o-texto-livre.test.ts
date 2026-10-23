import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A TRAVA DA PERGUNTA PRECISA VER O TEXTO LIVRE DO MODELO.
 *
 * Medido ao vivo (2026-10-06): o modelo respondeu por texto (não chamou
 * `send_message`) e o texto continha "De qual cidade você fala?". A trava só
 * olhava `corposEnviados` (envios por FERRAMENTA), não achou a pergunta, mandou a
 * dela — e o texto do modelo, enviado logo depois, repetiu a MESMA pergunta.
 * Resultado no WhatsApp: a pergunta saiu DUAS vezes no mesmo turno.
 *
 * (2026-10-23) A montagem dos textos foi extraída para `textosDoTurnoParaTrava`
 * (o texto livre só conta quando é ELE que vai sair). O teste passou a conferir
 * a chamada atual + a regra do helper.
 */

const TURNO = fs.readFileSync(
  path.join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"),
  "utf8",
);
const HELPER = fs.readFileSync(
  path.join(process.cwd(), "lib/followup/captura-do-fluxo.ts"),
  "utf8",
);

describe("trava da pergunta do fluxo", () => {
  it("conta o texto livre do modelo como fala do turno", () => {
    expect(TURNO).toMatch(
      /const textosDoTurno = textosDoTurnoParaTrava\(\s*corposEnviados,\s*turn\.result\.text \?\? '',\s*outcomes\.length > 0,?\s*\)/,
    );
    expect(HELPER).toMatch(
      /livre !== "" && !enviouPelaFerramenta \? \[\.\.\.corposEnviados, livre\] : \[\.\.\.corposEnviados\]/,
    );
  });

  it("passa os textos do turno (não só corposEnviados) para a detecção", () => {
    expect(TURNO).toMatch(/perguntaSaiuNosTextos\(pergunta, textosDoTurno\)/);
  });
});
