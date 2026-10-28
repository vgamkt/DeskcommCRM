/**
 * SONDA — a JEV (`plano_de_turno`) resolve os 6 defeitos do teste final?
 * Cenários sintéticos (mensagem controlada) + catálogo real da conversa.
 *
 *   JEV_PROBE=1 vitest run scripts/qa/plano-6-cenarios-probe.test.ts
 *
 * Se a JEV decidir certo, o motor só executa. Se não, NÃO implantar — informar.
 */
import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { decidir } from '@/lib/ai/jev';
import { alvosDeJevDaOrg } from '@/lib/ai/jev/resolver';
import {
  idDaMoto,
  perguntaDoPlanoDeTurno,
  planoDoTurnoDaJev,
  type PlanoDoTurno,
} from '@/lib/ai/jev/pontos/plano-de-turno';
import { montarContextoDoPlano } from '@/lib/agent-engine/agent/plano-de-turno';
import type { CatalogoDaConversa } from '@/lib/agent-engine/agent/catalogo-da-conversa';
import type { MotoDoCatalogo } from '@/lib/agent-engine/agent/fotos-do-catalogo';

const ORG = 'e40dc035-b553-4383-8aac-311d29abcfdc';
const PROBE = process.env.JEV_PROBE === '1';

type Msg = { direction: 'inbound' | 'outbound'; body: string };

interface Cenario {
  nome: string;
  mensagens: Msg[];
  escolhidaNome?: string;
  orcamento?: number;
  cambio?: 'automatico' | 'manual';
  uso?: 'cidade' | 'trilha' | 'estrada';
}

async function planejar(
  pool: Pool,
  catalogo: readonly MotoDoCatalogo[],
  c: Cenario,
): Promise<PlanoDoTurno | null> {
  const escolhida =
    catalogo.find((m) => m.nome.toLowerCase().includes((c.escolhidaNome ?? '\u0000').toLowerCase())) ??
    null;
  const cat: CatalogoDaConversa = {
    motos: [...catalogo],
    detalhadas: [],
    escolhida,
    referencia: null,
    objecao: null,
    opcoes: null,
    orcamento: c.orcamento ?? null,
    pedidosDeOpcoes: 0,
    formaDePagamentoPerguntada: false,
  };
  const ctx = montarContextoDoPlano({
    mensagens: c.mensagens,
    catalogoDaConversa: cat,
    orcamento: c.orcamento ?? null,
    cambioPedido: c.cambio ?? null,
    usoCategoria: c.uso ?? null,
    catalogo,
  });
  const alvos = await alvosDeJevDaOrg(pool, ORG, 'plano_de_turno');
  const vistos = new Set<string>();
  const escolhidaOpcoes = [cat.escolhida, cat.referencia, ...cat.motos].filter(
    (m): m is MotoDoCatalogo => {
      if (m === null || m === undefined) return false;
      const id = idDaMoto(m);
      if (vistos.has(id)) return false;
      vistos.add(id);
      return true;
    },
  );
  const perguntas = perguntaDoPlanoDeTurno(ctx, catalogo, escolhidaOpcoes);
  const catalogoEnxuto = catalogo.map((m) => {
    const v = (m.valores ?? {}) as Record<string, unknown>;
    return {
      id: idDaMoto(m),
      nome: m.nome,
      ano: m.ano ?? null,
      cor: m.cor ?? null,
      quilometragem: m.quilometragem ?? null,
      preco: m.preco ?? null,
      categoria: typeof v.categoria === 'string' ? v.categoria : null,
      cambio: typeof v.cambio === 'string' ? v.cambio : null,
    };
  });
  const decisao = await decidir({
    alvos,
    state: { mensagens: ctx.mensagens, rajada: ctx.rajada, estado: ctx.estado, catalogo: catalogoEnxuto },
    questions: perguntas,
    perguntasObrigatorias: ['acao'],
    opcoes: { timeoutPorTentativaMs: 30000, capTotalMs: 120000 },
  });
  return decisao === null ? null : planoDoTurnoDaJev(decisao.respostas, catalogo, { limite: 5 });
}

describe.skipIf(!PROBE)('SONDA — 6 cenários no plano_de_turno (JEV real)', () => {
  it('mede a decisão da JEV em cada caso', async () => {
    const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
    try {
      const r = await pool.query<{ cat: { motos?: MotoDoCatalogo[] } }>(
        `select metadata -> 'agent_catalogo' as cat
           from conversations
          where organization_id = $1 and metadata -> 'agent_catalogo' is not null
          order by last_message_at desc
          limit 1`,
        [ORG],
      );
      const catalogo = r.rows[0]?.cat?.motos ?? [];
      expect(catalogo.length).toBeGreaterThan(5);

      const cenarios: Cenario[] = [
        {
          nome: 'TROCA (T15) — "dar minha Biz na troca"',
          escolhidaNome: 'Neo 125',
          mensagens: [
            { direction: 'inbound', body: 'Tenho CNH sim.' },
            { direction: 'outbound', body: 'Boa, Carlos! Com CNH tá tudo certo.' },
            { direction: 'inbound', body: 'Quero dar minha Biz 125 2018 com 30 mil km na troca.' },
          ],
        },
        {
          nome: 'COMPARAÇÃO (T28) — "diferença entre XRE 190 e XTZ 150"',
          escolhidaNome: 'XRE 190',
          mensagens: [
            { direction: 'inbound', body: 'Tem uma XRE 190?' },
            { direction: 'outbound', body: 'A HONDA XRE 190 2023 Cinza está disponível.' },
            { direction: 'inbound', body: 'Qual a diferença entre a XRE 190 e a XTZ 150?' },
          ],
        },
        {
          nome: 'KM (T27) — "XRE tá rodada? tem com menos km?"',
          escolhidaNome: 'XRE 190',
          mensagens: [
            { direction: 'inbound', body: 'Tem uma XRE 190?' },
            { direction: 'outbound', body: 'A HONDA XRE 190 2023 Cinza está disponível.' },
            { direction: 'inbound', body: 'Essa XRE tá muito rodada? Tem com menos km?' },
          ],
        },
        {
          nome: 'Q&A (T19) — "financiamento, quanto fica a parcela?"',
          escolhidaNome: 'Neo 125',
          mensagens: [
            { direction: 'inbound', body: 'Vou fechar a Neo. Como faço pra reservar?' },
            { direction: 'outbound', body: 'Boa escolha, Carlos! A Neo 125 está disponível.' },
            { direction: 'inbound', body: 'E o financiamento, quanto ficaria a parcela?' },
          ],
        },
        {
          nome: 'T03 — "só automática, orçamento até 15 mil"',
          orcamento: 15000,
          cambio: 'automatico',
          uso: 'cidade',
          mensagens: [
            { direction: 'inbound', body: 'Uso na cidade, pra ir trabalhar, uns 25 km por dia.' },
            { direction: 'outbound', body: 'Separei 5 opções do nosso estoque.' },
            { direction: 'inbound', body: 'Só automática, por favor. Meu orçamento é até 15 mil.' },
          ],
        },
      ];

      const resultados: string[] = [];
      for (const c of cenarios) {
        const p = await planejar(pool, catalogo, c);
        const ids = p?.selecao?.ids ?? [];
        const nomes = ids
          .map((id) => catalogo.find((m) => idDaMoto(m) === id)?.nome ?? id)
          .slice(0, 6);
        resultados.push(
          `${c.nome}\n  acao=${p?.acao ?? null} crit=${p?.criterio ?? null} sel=${ids.length} ` +
            `ids=${JSON.stringify(nomes)} esc=${p?.escolhida ?? null}`,
        );
      }
      console.log('\n===== SONDA 6 CENÁRIOS =====\n' + resultados.join('\n\n'));
      expect(resultados.length).toBe(cenarios.length);
    } finally {
      await pool.end();
    }
  }, 400_000);
});
