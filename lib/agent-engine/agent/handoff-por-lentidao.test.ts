import { describe, expect, it } from 'vitest';

import { avisoVoltariaAoCliente } from './handoff-por-lentidao';

describe('avisoVoltariaAoCliente (2026-10-14)', () => {
  it('destino == número do cliente → voltaria (não avisar)', () => {
    expect(avisoVoltariaAoCliente('5512997700101', '+5512997700101')).toBe(true);
    expect(avisoVoltariaAoCliente('12997700101', '5512997700101')).toBe(true);
  });
  it('destino DIFERENTE do cliente → avisa normalmente', () => {
    expect(avisoVoltariaAoCliente('5511988887777', '+5512997700101')).toBe(false);
  });
  it('vazio → não bloqueia', () => {
    expect(avisoVoltariaAoCliente(null, '+5512997700101')).toBe(false);
    expect(avisoVoltariaAoCliente('5512997700101', null)).toBe(false);
  });
});
