/**
 * TRAVA ANTI-TRAVAMENTO — o wrapper do turno.
 *
 * Se o modelo empaca/erra de forma transitória, o turno retenta até
 * `maxTentativas`; esgotando (ou no primeiro erro fatal), chama `aoEsgotar`
 * (handoff + libera a fila) e devolve `null`. NUNCA lança — um throw aqui
 * derrubaria o handler do job e deixaria a fila presa, que é exatamente o que a
 * resiliência existe para evitar.
 */
import { describe, expect, it, vi } from "vitest";

import { chamarTurnoComResiliencia } from "./turno-com-resiliencia";
import type { Logger } from "../obs/logger";

function fakeLog(): Logger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("chamarTurnoComResiliencia", () => {
  it("sucesso na 1ª tentativa: devolve o valor e não chama aoEsgotar", async () => {
    const tentar = vi.fn().mockResolvedValue("ok");
    const aoEsgotar = vi.fn().mockResolvedValue(undefined);

    const out = await chamarTurnoComResiliencia(tentar, {
      timeoutMs: 45_000,
      maxTentativas: 2,
      aoEsgotar,
      log: fakeLog(),
    });

    expect(out).toBe("ok");
    expect(tentar).toHaveBeenCalledTimes(1);
    expect(aoEsgotar).not.toHaveBeenCalled();
  });

  it("sucesso após timeout transitório: retenta e devolve o valor", async () => {
    const tentar = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout: chamada abortada"))
      .mockResolvedValueOnce("depois do retry");
    const aoEsgotar = vi.fn().mockResolvedValue(undefined);

    const out = await chamarTurnoComResiliencia(tentar, {
      timeoutMs: 45_000,
      maxTentativas: 2,
      aoEsgotar,
      log: fakeLog(),
    });

    expect(out).toBe("depois do retry");
    expect(tentar).toHaveBeenCalledTimes(2);
    expect(aoEsgotar).not.toHaveBeenCalled();
  });

  it("esgotou as tentativas: chama aoEsgotar uma vez e devolve null", async () => {
    const tentar = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    const aoEsgotar = vi.fn().mockResolvedValue(undefined);

    const out = await chamarTurnoComResiliencia(tentar, {
      timeoutMs: 45_000,
      maxTentativas: 2,
      aoEsgotar,
      log: fakeLog(),
    });

    expect(out).toBeNull();
    expect(tentar).toHaveBeenCalledTimes(2);
    expect(aoEsgotar).toHaveBeenCalledTimes(1);
    expect(aoEsgotar.mock.calls[0]?.[0]).toMatchObject({ tentativas: 2 });
  });

  it("erro não-retentável não repete — cai direto em aoEsgotar", async () => {
    const tentar = vi.fn().mockRejectedValue(new Error("invalid_api_key"));
    const aoEsgotar = vi.fn().mockResolvedValue(undefined);

    const out = await chamarTurnoComResiliencia(tentar, {
      timeoutMs: 45_000,
      maxTentativas: 5,
      aoEsgotar,
      log: fakeLog(),
    });

    expect(out).toBeNull();
    expect(tentar).toHaveBeenCalledTimes(1);
    expect(aoEsgotar).toHaveBeenCalledTimes(1);
  });

  it("aoEsgotar que lança NÃO derruba o turno (best-effort)", async () => {
    const tentar = vi.fn().mockRejectedValue(new Error("timeout"));
    const aoEsgotar = vi.fn().mockRejectedValue(new Error("handoff falhou"));
    const log = fakeLog();

    await expect(
      chamarTurnoComResiliencia(tentar, {
        timeoutMs: 45_000,
        maxTentativas: 1,
        aoEsgotar,
        log,
      }),
    ).resolves.toBeNull();
    expect(log.error).toHaveBeenCalled();
  });
});
