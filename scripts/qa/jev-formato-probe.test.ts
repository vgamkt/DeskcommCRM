/**
 * F0 — PROBE DE FORMATO DA JEV (exploratório, dados REAIS).
 *
 * NÃO é fixture: lê uma conversa real do banco (30 mensagens, com `respondida`),
 * o estado (orçamento/escolhida/mostradas/fila/objeção) e o catálogo da conversa,
 * chama a JEV REAL (binding da org) com as perguntas do "plano" e imprime:
 *   - a resposta CRUA da JEV (answers)
 *   - a ação/critério/fecho/handoff
 *   - os IDs das motos que o motor extrairia (nota >= 0.7)
 *
 * Objetivo: descobrir a FORMA de resposta que a JEV devolve de maneira consistente
 * e que o motor consegue executar sem reinterpretar. O `PlanoDoTurno` é hipótese.
 *
 * Rodar (fora da suíte normal):
 *   JEV_PROBE=1 vitest run scripts/qa/jev-formato-probe.test.ts
 */
import { describe, it, expect } from 'vitest';
import { Pool } from 'pg';

import { decidir } from '@/lib/ai/jev';
import { alvosDeJevDaOrg } from '@/lib/ai/jev/resolver';
import type { PerguntasDeJev } from '@/lib/ai/jev/tipos';
import { montarContextoDaConversa } from '@/lib/agent-engine/agent/contexto-da-conversa';

const ORG = 'e40dc035-b553-4383-8aac-311d29abcfdc';
const JANELA = 30;
const PROBE = process.env.JEV_PROBE === '1';

type LinhaMsg = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  sent_at: string;
};

describe.skipIf(!PROBE)('F0 — probe do formato da JEV (dados reais)', () => {
  it('decide sobre uma conversa real de 30 msgs e imprime a resposta crua', async () => {
    const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL });
    try {
      // Conversa real da org com pelo menos 5 inbounds (a maior atividade recente).
      const conv = await pool.query<{ conversation_id: string }>(
        `select conversation_id
           from messages
          where organization_id = $1 and direction = 'inbound'
          group by conversation_id
         having count(*) >= 4
          order by max(created_at) desc
          limit 3`,
        [ORG],
      );
      const conversationIds = conv.rows.map((r) => r.conversation_id);
      expect(conversationIds.length, 'sem conversas reais').toBeGreaterThan(0);
      for (const conversationId of conversationIds) {

      const msgs = await pool.query<LinhaMsg>(
        `select id, direction, coalesce(body,'') as body, sent_at
           from messages
          where organization_id = $1 and conversation_id = $2
          order by sent_at desc
          limit $3`,
        [ORG, conversationId, JANELA],
      );
      const rows = [...msgs.rows].reverse();
      const ctx = montarContextoDaConversa({
        mensagens: rows,
        estado: {
          orcamento: null,
          escolhida: null,
          referencia: null,
          motosMostradas: [],
          fila: [],
          objecao: null,
          formaDePagamentoPerguntada: false,
          usoCategoria: null,
          cambioPedido: null,
        },
        janela: JANELA,
      });
      const conversa = ctx.mensagens;
      void ctx.rajada;
      console.log('\n===== CONVERSA', conversationId, '=====');
      console.log('ULTIMAS', JSON.stringify(conversa.slice(-4)));

      const meta = await pool.query<{ cat: Record<string, unknown> | null }>(
        `select metadata -> 'agent_catalogo' as cat from conversations where id = $1`,
        [conversationId],
      );
      const cat = (meta.rows[0]?.cat ?? {}) as {
        motos?: Array<Record<string, unknown>>;
        escolhida?: Record<string, unknown> | null;
        referencia?: Record<string, unknown> | null;
        orcamento?: number | null;
        objecao?: { motivo?: string; tentativas?: number } | null;
        opcoes?: { pendentes?: unknown[] } | null;
      };
      const catalogo = (cat.motos ?? []).slice(0, 20).map((m) => ({
        id: String((m.valores as Record<string, unknown>)?.id ?? m.id ?? m.nome ?? ''),
        nome: String(m.nome ?? ''),
        ano: m.ano ?? null,
        cor: m.cor ?? null,
        quilometragem: m.quilometragem ?? null,
        preco: m.preco ?? null,
        categoria: (m.valores as Record<string, unknown>)?.categoria ?? null,
        cambio: (m.valores as Record<string, unknown>)?.cambio ?? null,
      }));

      const estado = {
        orcamento: cat.orcamento ?? null,
        escolhida: cat.escolhida?.nome ?? null,
        motosMostradas: (cat.motos ?? []).map((m) => m.nome),
        fila: (cat.opcoes?.pendentes ?? []).length,
        objecao: cat.objecao ?? null,
      };

      const state = {
        regra: {
          conversa:
            `state.conversa tem as últimas ${conversa.length} mensagens (cronológico). ` +
            '`respondida:true` = a loja JÁ respondeu; `respondida:false` = a última/rajada AINDA pede resposta. ' +
            'Não trate mensagem antiga como pedido novo.',
          estado: 'state.estado: orçamento (FIXO), escolhida, motosMostradas, fila, objeção.',
          catalogo: 'state.catalogo: motos REAIS com id/nome/ano/cor/km/preço/categoria/câmbio.',
          decisao:
            'Decida o turno EXATAMENTE: ação, critério, quais IDs de motos (nota por moto), escolhida (ID), fecho, handoff. ' +
            'Só use IDs de state.catalogo. Se não for mostrar, não pontue motos.',
        },
        conversa,
        estado,
        catalogo,
      };

      const perguntas: PerguntasDeJev = {
        acao: {
          type: 'choice',
          instructions:
            'O que o turno deve fazer AGORA? Considere a conversa inteira (só a última/rajada pede resposta).',
          criteria: {
            oferecer: 'mostrar motos do catálogo agora',
            perguntar: 'não mostrar ainda; perguntar o que falta (sem critério suficiente)',
            persuadir: 'defender a moto em foco (objeção, 1ª/2ª tentativa)',
            mostrar_opcoes: 'mostrar alternativas que atacam a objeção',
            encaminhar: 'passar/avisar o responsável mantendo o atendimento',
            nenhuma: 'nada a fazer neste turno',
          },
        },
        criterio: {
          type: 'choice',
          instructions: 'Se for mostrar/oferecer, qual aspecto atacar?',
          criteria: {
            nenhum: 'não se aplica',
            preco: 'preço/mais em conta',
            km: 'menos rodada',
            ano: 'mais nova',
            categoria: 'mesmo estilo/uso',
            cambio: 'câmbio específico (automático/manual)',
          },
        },
        escolhida: {
          type: 'choice',
          instructions:
            'O cliente ESCOLHEU uma moto do catálogo? Responda o ID exato dela; se nenhuma, "nenhuma".',
          criteria: {
            nenhuma: 'nenhuma escolha',
            ...Object.fromEntries(catalogo.map((m) => [m.id, `${m.nome} ${m.ano ?? ''}`])),
          },
        },
        fecho: {
          type: 'choice',
          instructions: 'Se mostrar, qual o fecho?',
          criteria: {
            nenhum: 'não mostra/não se aplica',
            escolha: 'perguntar qual chamou mais a atenção (várias)',
            saber_mais: 'convidar a saber mais/ver de perto (uma)',
            outra_opcao: 'oferecer outra fabricante/estilo (objeção esgotada)',
          },
        },
        handoff: {
          type: 'noul',
          instructions: 'O cliente pediu humano OU o caso exige uma pessoa AGORA?',
        },
      };
      // Nota por moto (a seleção sai daqui; o motor pega >= 0.7, como no catalog-criteria).
      catalogo.forEach((m, i) => {
        perguntas[`parecida_${i}`] = {
          type: 'noul',
          instructions:
            `Esta moto do estoque combina com o que o cliente quer AGORA? ` +
            `ID ${m.id} — ${m.nome} ${m.ano ?? ''} ${m.cor ?? ''} ${m.quilometragem ?? ''} km ` +
            `${m.preco ?? ''} (${m.categoria ?? ''}, câmbio ${m.cambio ?? '?'}). ` +
            'Nota alta (>=0.7) só para o que atende ao pedido/critérios; respeite o orçamento FIXO.',
        };
      });

      const alvos = await alvosDeJevDaOrg(pool, ORG, 'catalog_criteria');
      console.log('ALVOS', JSON.stringify(alvos.map((a) => ({ p: a.provider, m: a.model }))));
      if (alvos.length === 0) {
        console.log('SEM_ALVO_JEV');
        return;
      }
      const decisao = await decidir({
        alvos,
        state,
        questions: perguntas,
        opcoes: { timeoutPorTentativaMs: 30000, capTotalMs: 120000 },
      });
      if (decisao === null) {
        console.log('JEV_NULL');
        return;
      }
      console.log('PROVIDER', decisao.provider, decisao.model);
      console.log('ANSWERS', JSON.stringify(decisao.respostas));

      const a = decisao.respostas;
      const acao = a.acao?.type === 'choice' ? a.acao.choice : null;
      const criterio = a.criterio?.type === 'choice' ? a.criterio.choice : null;
      const escolhida = a.escolhida?.type === 'choice' ? a.escolhida.choice : null;
      const fecho = a.fecho?.type === 'choice' ? a.fecho.choice : null;
      const handoff = a.handoff?.type === 'noul' ? a.handoff.noul : null;
      const selecionadas = catalogo
        .map((m, i) => {
          const r = a[`parecida_${i}`];
          return { id: m.id, nome: m.nome, n: r?.type === 'noul' ? r.noul : 0 };
        })
        .filter((x) => x.n >= 0.7)
        .sort((x, y) => y.n - x.n);
      console.log(
        'EXTRAIDO',
        JSON.stringify({ acao, criterio, escolhida, fecho, handoff, selecionadas }),
      );

      expect(acao, 'a JEV precisa devolver a ação').toBeTruthy();
      } // fim do loop de conversas
    } finally {
      await pool.end();
    }
  }, 130_000);
});
