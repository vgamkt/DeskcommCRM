import { beforeEach, describe, expect, it, vi } from 'vitest';

const decidirMock = vi.fn();
const alvosMock = vi.fn();

vi.mock('./index', () => ({ decidir: (...a: unknown[]) => decidirMock(...a) }));
vi.mock('./resolver', () => ({ alvosDeJevDaOrg: (...a: unknown[]) => alvosMock(...a) }));

import { arbitrar, type PedidoAoArbitro } from './arbitro';

const ALVO = { provider: 'opencode', apiKey: 'k', model: 'jev-1' };
const db = {} as never;

const pedidoEscolha: PedidoAoArbitro = {
  ponto: 'moto_escolhida',
  contexto: { cliente: 'Essa', citado: '', candidatas: ['CB 300 R'] },
  perguntas: {
    moto: { type: 'choice', instructions: 'qual?', criteria: { nenhuma: 'n', 'CB 300 R': 'x' } },
  },
};
const pedidoCriterios: PedidoAoArbitro = {
  ponto: 'catalog_criteria',
  contexto: { mensagem: 'quero uma cb 250', estoque: ['CB 300 R'] },
  perguntas: {
    intencao: {
      type: 'choice',
      instructions: 'pedido?',
      criteria: { pedido: 'p', alternativa: 'a', nenhum: 'n' },
    },
  },
  obrigatorias: ['intencao'],
};

beforeEach(() => {
  decidirMock.mockReset();
  alvosMock.mockReset();
  alvosMock.mockResolvedValue([ALVO]); // default: os pontos compartilham o alvo
});

describe('arbitrar — uma chamada da Jev para vários pontos', () => {
  it('une dois pontos numa chamada só e devolve ids ORIGINAIS por ponto', async () => {
    decidirMock.mockResolvedValue({
      provider: 'opencode',
      model: 'jev-1',
      respostas: {
        'moto_escolhida::moto': { type: 'choice', choice: 'CB 300 R', confidence: 1, probabilities: {} },
        'catalog_criteria::intencao': { type: 'choice', choice: 'pedido', confidence: 1, probabilities: {} },
      },
      usage: { input_tokens: 5, output_tokens: 2 },
      tentativas: 1,
    });
    const r = await arbitrar({
      db,
      tenantId: 'o',
      turno: { cliente: 'x' },
      pedidos: [pedidoEscolha, pedidoCriterios],
    });
    expect(r).not.toBeNull();
    expect(r!.porPonto.moto_escolhida!.moto).toMatchObject({ choice: 'CB 300 R' });
    expect(r!.porPonto.catalog_criteria!.intencao).toMatchObject({ choice: 'pedido' });

    const arg = decidirMock.mock.calls[0]![0] as {
      questions: Record<string, unknown>;
      perguntasObrigatorias: string[];
      state: { pontos: Record<string, { cliente?: string }> };
    };
    expect(Object.keys(arg.questions)).toEqual(['moto_escolhida::moto', 'catalog_criteria::intencao']);
    expect(arg.perguntasObrigatorias).toEqual(['moto_escolhida::moto', 'catalog_criteria::intencao']);
    expect(arg.state.pontos.moto_escolhida!.cliente).toBe('Essa');
    // Obrigatoriedade POR PONTO preservada (criteria pediu só 'intencao').
    expect(arg.perguntasObrigatorias).not.toContain('catalog_criteria::exigidos_x');
  });

  it('alvos divergentes entre os pontos → NÃO unifica (null)', async () => {
    alvosMock.mockImplementation((_db: unknown, _t: unknown, ponto: string) =>
      Promise.resolve(ponto === 'moto_escolhida' ? [ALVO] : [{ ...ALVO, model: 'outro' }]),
    );
    const r = await arbitrar({
      db,
      tenantId: 'o',
      turno: {},
      pedidos: [pedidoEscolha, pedidoCriterios],
    });
    expect(r).toBeNull();
    expect(decidirMock).not.toHaveBeenCalled();
  });

  it('a Jev não respondeu (null) → null', async () => {
    decidirMock.mockResolvedValue(null);
    const r = await arbitrar({
      db,
      tenantId: 'o',
      turno: {},
      pedidos: [pedidoEscolha, pedidoCriterios],
    });
    expect(r).toBeNull();
  });

  it('sem pedidos → null (não chama a Jev)', async () => {
    const r = await arbitrar({ db, tenantId: 'o', turno: {}, pedidos: [] });
    expect(r).toBeNull();
    expect(alvosMock).not.toHaveBeenCalled();
  });
});
