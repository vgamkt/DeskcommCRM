import { describe, expect, it } from 'vitest';

import { deveReTentarTurnoPorEnvio } from './re-tentativa-de-envio';

describe('deveReTentarTurnoPorEnvio (2026-10-14)', () => {
  it('NADA enviado + falha → re-tenta', () => {
    expect(deveReTentarTurnoPorEnvio([{ kind: 'failed' }, { kind: 'failed' }])).toBe(true);
  });
  it('envio PARCIAL (alguma peça saiu) → NÃO re-tenta (evita duplicar)', () => {
    expect(deveReTentarTurnoPorEnvio([{ kind: 'sent' }, { kind: 'failed' }])).toBe(false);
    expect(deveReTentarTurnoPorEnvio([{ kind: 'already_sent' }, { kind: 'failed' }])).toBe(false);
    expect(deveReTentarTurnoPorEnvio([{ kind: 'queued' }, { kind: 'failed' }])).toBe(false);
  });
  it('sem falha → não re-tenta', () => {
    expect(deveReTentarTurnoPorEnvio([{ kind: 'sent' }, { kind: 'sent' }])).toBe(false);
  });
  it('lista vazia → não re-tenta', () => {
    expect(deveReTentarTurnoPorEnvio([])).toBe(false);
  });
});
