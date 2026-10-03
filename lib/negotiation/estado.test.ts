import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

import { topicDeObjecao, carregarNegociacao, registrarTentativa } from './estado';

function dbMock(rows: unknown[]): pg.Pool {
  return { query: vi.fn(async () => ({ rows })) } as unknown as pg.Pool;
}

describe('topicDeObjecao', () => {
  it('monta o tópico com motivo e moto normalizada', () => {
    expect(topicDeObjecao('preco', 'HONDA CB 300')).toBe('objecao:preco:honda cb 300');
    expect(topicDeObjecao('km', null)).toBe('objecao:km:_');
  });
});

describe('carregarNegociacao', () => {
  it('mapeia a linha do banco', async () => {
    const db = dbMock([
      {
        id: '1', contact_id: 'c1', conversation_id: 'v1', topic: 'objecao:preco:_',
        motivo: 'preco', attempts: 2, valor_proposta_cents: '2700000',
        status: 'negociando', awaiting_confirmation: false, encaminhado_at: null,
      },
    ]);
    const s = await carregarNegociacao(db, 'org', 'c1');
    expect(s).toMatchObject({ attempts: 2, valorPropostaCents: 2700000, motivo: 'preco' });
  });

  it('sem linha → null', async () => {
    expect(await carregarNegociacao(dbMock([]), 'org', 'c1')).toBeNull();
  });

  it('erro do banco → null (não lança)', async () => {
    const db = { query: vi.fn(async () => { throw new Error('down'); }) } as unknown as pg.Pool;
    expect(await carregarNegociacao(db, 'org', 'c1')).toBeNull();
  });
});

describe('registrarTentativa', () => {
  it('devolve o estado do upsert', async () => {
    const db = dbMock([
      {
        id: '1', contact_id: 'c1', conversation_id: 'v1', topic: 'objecao:preco:_',
        motivo: 'preco', attempts: 1, valor_proposta_cents: null,
        status: 'negociando', awaiting_confirmation: false, encaminhado_at: null,
      },
    ]);
    const s = await registrarTentativa(db, {
      organizationId: 'org', contactId: 'c1', conversationId: 'v1',
      topic: 'objecao:preco:_', motivo: 'preco',
    });
    expect(s?.attempts).toBe(1);
  });
});
