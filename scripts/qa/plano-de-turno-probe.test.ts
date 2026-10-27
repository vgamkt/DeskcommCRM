/**
 * F3 (peça) — probe do MÓDULO `decidirPlanoDoTurno` com a JEV REAL e o binding
 * `plano_de_turno__jev`. Lê conversas reais, chama a JEV (30 msgs + estado +
 * catálogo) e imprime o `PlanoDoTurno` (ação + IDs + fecho + handoff).
 *
 *   JEV_PROBE=1 vitest run scripts/qa/plano-de-turno-probe.test.ts
 */
import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import type { CatalogoDaConversa } from '@/lib/agent-engine/agent/catalogo-da-conversa';
import { decidirPlanoDoTurno } from '@/lib/agent-engine/agent/plano-de-turno';

const ORG = 'e40dc035-b553-4383-8aac-311d29abcfdc';
const PROBE = process.env.JEV_PROBE === '1';

describe.skipIf(!PROBE)('F3 — plano_de_turno (módulo + JEV real)', () => {
  it('computa o plano em conversas reais', async () => {
    const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
    try {
      const conv = await pool.query<{ id: string }>(
        `select conversation_id as id
           from messages
          where organization_id = $1 and direction = 'inbound'
          group by conversation_id
         having count(*) >= 4
          order by max(created_at) desc
          limit 2`,
        [ORG],
      );
      expect(conv.rows.length).toBeGreaterThan(0);
      for (const { id } of conv.rows) {
        const meta = await pool.query<{ cat: Partial<CatalogoDaConversa> | null }>(
          `select metadata -> 'agent_catalogo' as cat from conversations where id = $1`,
          [id],
        );
        const cat = meta.rows[0]?.cat ?? {};
        const catalogo: CatalogoDaConversa = {
          motos: cat.motos ?? [],
          detalhadas: cat.detalhadas ?? [],
          escolhida: cat.escolhida ?? null,
          referencia: cat.referencia ?? null,
          objecao: cat.objecao ?? null,
          opcoes: cat.opcoes ?? null,
          orcamento: cat.orcamento ?? null,
          pedidosDeOpcoes: cat.pedidosDeOpcoes ?? 0,
          formaDePagamentoPerguntada: cat.formaDePagamentoPerguntada ?? false,
        };
        const plano = await decidirPlanoDoTurno({
          pool,
          tenantId: ORG,
          conversationId: id,
          catalogoDaConversa: catalogo,
          catalogo: catalogo.motos,
          orcamento: catalogo.orcamento ?? null,
          cambioPedido: null,
          limite: 5,
        });
        console.log('CONVERSA', id, 'PLANO', JSON.stringify(plano));
        expect(plano === null || typeof plano.acao === 'string').toBe(true);
      }
    } finally {
      await pool.end();
    }
  }, 200_000);
});
