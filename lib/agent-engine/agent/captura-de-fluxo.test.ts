import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

vi.mock('@/lib/followup/atendimento', () => ({
  camposDeColetaDosFluxosAtivos: vi.fn(),
}));
vi.mock('./flow-validate', () => ({
  validarRespostaDoFluxo: vi.fn(),
}));

import { camposDeColetaDosFluxosAtivos } from '@/lib/followup/atendimento';
import { validarRespostaDoFluxo } from './flow-validate';
import { capturarDadosDosFluxosNaMensagem } from './captura-de-fluxo';

const camposMock = vi.mocked(camposDeColetaDosFluxosAtivos);
const validarMock = vi.mocked(validarRespostaDoFluxo);

describe('captura contínua — isolamento por fluxo (P0-E)', () => {
  it('usa o enrollment MAIS RECENTE, não a união de todos os fluxos', async () => {
    camposMock.mockResolvedValue([
      { key: 'venda_fotos', label: 'Fotos', type: 'text' },
    ]);
    validarMock.mockResolvedValue({
      resultado: 'respondeu',
      respostas: [{ campo: 'venda_fotos', valor: 'foto real' }],
    } as never);

    const chamadas: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        chamadas.push({ sql, params });
        if (/from followup_enrollments/.test(sql)) {
          return { rows: [{ pointer_id: 'venda-pointer' }] };
        }
        return { rows: [] };
      },
    } as unknown as pg.Pool;

    await capturarDadosDosFluxosNaMensagem(
      pool,
      {} as never,
      { tenantId: 'org', leadId: 'ct', jobId: 'job' },
      { contactId: 'ct', texto: 'venda' },
      { log: { info: vi.fn() } as never },
    );

    expect(camposMock).toHaveBeenCalledWith(pool, 'org', 'venda-pointer');
    const update = chamadas.find((c) => /update contacts/.test(c.sql));
    expect(update).toBeDefined();
    expect(String(update!.params[2])).toContain('venda_fotos');
    expect(String(update!.params[2])).not.toContain('troca_');
  });
});
