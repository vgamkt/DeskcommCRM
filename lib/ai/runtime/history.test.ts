import { describe, expect, it } from 'vitest';

import { loadHistoryWithBudget } from './history';

type Linha = { id: string; body: string | null; direction: string; sent_at: string };

function bancoFalso(rows: Linha[]) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.order = () => chain;
  chain.limit = () => Promise.resolve({ data: rows, error: null });
  return { from: () => chain } as never;
}

const msg = (id: string, body: string | null, direction: 'inbound' | 'outbound', sent_at: string): Linha => ({
  id,
  body,
  direction,
  sent_at,
});

describe('loadHistoryWithBudget — mídia pura não come a janela', () => {
  it('álbum de fotos (body vazio) não esconde o texto anterior', async () => {
    // Mais recentes primeiro, como o PostgREST devolve.
    const rows = [
      msg('p1', '', 'outbound', '10'),
      msg('p2', '', 'outbound', '9'),
      msg('p3', '', 'outbound', '8'),
      msg('p4', '', 'outbound', '7'),
      msg('t3', 'Acho que vou fechar a CG 160.', 'inbound', '6'),
      msg('t2', 'Consigo dar minha Biz 125 na troca? Ela é 2019, 40 mil km.', 'inbound', '5'),
      msg('t1', 'Oi, boa tarde!', 'inbound', '4'),
    ];
    const h = await loadHistoryWithBudget(bancoFalso(rows), {
      conversationId: 'c',
      organizationId: 'o',
      messageWindow: 2,
      tokenWindow: 10_000,
    });
    const textos = h.map((m) => m.content);
    expect(textos).toHaveLength(2);
    expect(textos.join(' | ')).toContain('Biz 125');
    expect(textos.join(' | ')).toContain('fechar a CG 160');
  });

  it('sem mídia, respeita a janela de mensagens', async () => {
    const rows = [
      msg('a', 'terceira', 'inbound', '3'),
      msg('b', 'segunda', 'outbound', '2'),
      msg('c', 'primeira', 'inbound', '1'),
    ];
    const h = await loadHistoryWithBudget(bancoFalso(rows), {
      conversationId: 'c',
      organizationId: 'o',
      messageWindow: 2,
      tokenWindow: 10_000,
    });
    expect(h.map((m) => m.content)).toEqual(['segunda', 'terceira']);
  });
});
