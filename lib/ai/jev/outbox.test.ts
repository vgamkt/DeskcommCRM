import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/agent-engine/db/request-pool', () => ({
  getRequestPool: () => ({ query: vi.fn() }),
}));
vi.mock('./resolver', () => ({ alvosDeJevDaOrg: vi.fn() }));
vi.mock('./index', () => ({ decidir: vi.fn() }));

import type { EventRow } from '@/lib/event-log/dispatcher';
import { alvosDeJevDaOrg } from './resolver';
import { decidir } from './index';
import { EVENTO_DE_RETRY_DA_JEV, enfileirarDecisaoJev, jevRetryHandler } from './outbox';
import type { PerguntasDeJev } from './tipos';

const perguntas: PerguntasDeJev = {
  intencao: { type: 'choice', instructions: '?', criteria: { catalogo: 'ver moto' } },
};

function rowComPayload(payload: Record<string, unknown>): EventRow {
  return {
    id: 'e1',
    organization_id: 'org-1',
    event_type: EVENTO_DE_RETRY_DA_JEV,
    entity_kind: 'jev_point',
    entity_id: null,
    payload,
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('enfileirarDecisaoJev', () => {
  it('grava um evento durável com o ponto/estado/perguntas (sem segredo)', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await enfileirarDecisaoJev({ query } as never, {
      organizationId: 'org-1',
      point: 'catalog_criteria',
      state: { mensagem: 'oi' },
      questions: perguntas,
      perguntasObrigatorias: ['intencao'],
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('insert into event_log');
    expect(params[0]).toBe('org-1');
    expect(params[1]).toBe(EVENTO_DE_RETRY_DA_JEV);
    const payload = JSON.parse(params[2] as string) as Record<string, unknown>;
    expect(payload).toMatchObject({
      point: 'catalog_criteria',
      state: { mensagem: 'oi' },
      perguntasObrigatorias: ['intencao'],
    });
    // Sem segredo no payload.
    expect(JSON.stringify(payload)).not.toContain('apiKey');
  });

  it('NÃO lança quando o banco falha (best-effort)', async () => {
    const query = vi.fn(async () => {
      throw new Error('db down');
    });
    await expect(
      enfileirarDecisaoJev({ query } as never, {
        organizationId: 'org-1',
        point: 'stage_classifier',
        state: {},
        questions: perguntas,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('jevRetryHandler', () => {
  it('payload inválido → skipped', async () => {
    const r = await jevRetryHandler.handle(rowComPayload({ foo: 1 }));
    expect(r.status).toBe('skipped');
  });

  it('sem alvos Jev → skipped', async () => {
    vi.mocked(alvosDeJevDaOrg).mockResolvedValue([]);
    const r = await jevRetryHandler.handle(
      rowComPayload({ point: 'stage_classifier', state: {}, questions: perguntas }),
    );
    expect(r.status).toBe('skipped');
  });

  it('Jev responde → ok e registra a decisão', async () => {
    vi.mocked(alvosDeJevDaOrg).mockResolvedValue([{ provider: 'opencode', apiKey: 'k' }]);
    vi.mocked(decidir).mockResolvedValue({
      provider: 'opencode',
      model: 'jev-1.13-free',
      respostas: { intencao: { type: 'choice', choice: 'catalogo', confidence: 0.9, probabilities: {} } },
      usage: { input_tokens: 10, output_tokens: 2 },
      tentativas: 1,
    });
    const r = await jevRetryHandler.handle(
      rowComPayload({ point: 'catalog_criteria', state: {}, questions: perguntas }),
    );
    expect(r.status).toBe('ok');
    expect(r.detail).toContain('catalog_criteria');
  });

  it('Jev esgota de novo → error (o drain reagenda com backoff)', async () => {
    vi.mocked(alvosDeJevDaOrg).mockResolvedValue([{ provider: 'opencode', apiKey: 'k' }]);
    vi.mocked(decidir).mockResolvedValue(null);
    const r = await jevRetryHandler.handle(
      rowComPayload({ point: 'catalog_criteria', state: {}, questions: perguntas }),
    );
    expect(r.status).toBe('error');
  });
});
