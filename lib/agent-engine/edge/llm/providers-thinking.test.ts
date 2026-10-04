import { afterEach, describe, expect, it } from 'vitest';

import { comThinkingDesligado } from './providers';

/** fetch falso que captura o corpo enviado. */
function captura(): { fetch: typeof fetch; corpos: unknown[] } {
  const corpos: unknown[] = [];
  const fetchFalso = ((_url: unknown, init?: { body?: unknown }) => {
    const raw = init?.body !== undefined ? String(init.body) : undefined;
    try {
      corpos.push(raw !== undefined ? JSON.parse(raw) : undefined);
    } catch {
      corpos.push(raw);
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as unknown as typeof fetch;
  return { fetch: fetchFalso, corpos };
}

describe('comThinkingDesligado', () => {
  afterEach(() => {
    delete process.env.LLM_THINKING;
  });

  it('injeta thinking disabled em modelos deepseek', async () => {
    const { fetch, corpos } = captura();
    const wrapped = comThinkingDesligado(fetch);
    await wrapped('http://x', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }),
    });
    expect(corpos[0]).toMatchObject({ thinking: { type: 'disabled' } });
  });

  it('NÃO injeta em modelos não-deepseek (mimo, glm)', async () => {
    const { fetch, corpos } = captura();
    const wrapped = comThinkingDesligado(fetch);
    await wrapped('http://x', { method: 'POST', body: JSON.stringify({ model: 'mimo-v2.6-flash' }) });
    await wrapped('http://x', { method: 'POST', body: JSON.stringify({ model: 'glm-5.3-flash' }) });
    expect((corpos[0] as { thinking?: unknown }).thinking).toBeUndefined();
    expect((corpos[1] as { thinking?: unknown }).thinking).toBeUndefined();
  });

  it('preserva thinking já enviado pelo chamador', async () => {
    const { fetch, corpos } = captura();
    const wrapped = comThinkingDesligado(fetch);
    await wrapped('http://x', {
      method: 'POST',
      body: JSON.stringify({ model: 'deepseek-v4-flash', thinking: { type: 'enabled' } }),
    });
    expect(corpos[0]).toMatchObject({ thinking: { type: 'enabled' } });
  });

  it('LLM_THINKING=enabled desliga a injeção', async () => {
    process.env.LLM_THINKING = 'enabled';
    const { fetch, corpos } = captura();
    const wrapped = comThinkingDesligado(fetch);
    await wrapped('http://x', { method: 'POST', body: JSON.stringify({ model: 'deepseek-v4-flash' }) });
    expect((corpos[0] as { thinking?: unknown }).thinking).toBeUndefined();
  });

  it('corpo não-JSON passa intacto (nunca quebra)', async () => {
    const { fetch, corpos } = captura();
    const wrapped = comThinkingDesligado(fetch);
    await wrapped('http://x', { method: 'POST', body: 'nao-e-json' });
    // captura não parseia; só garante que não lançou
    expect(corpos.length).toBe(1);
  });
});
