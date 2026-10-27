/**
 * F3 (peça de execução) — COMPUTA O PLANO DA JEV PARA O TURNO.
 *
 * Junta: últimas 30 mensagens (com `respondida`), o estado da conversa e o
 * estoque real → chama a JEV (`plano_de_turno__jev`) → devolve o `PlanoDoTurno`
 * com os IDs. É a fonte que o turno vai consumir (atrás da flag por agente).
 *
 * NÃO altera o turno ainda: módulo aditivo, testável isolado (probe F0/F3).
 */
import type pg from 'pg';

import { decidir } from '@/lib/ai/jev';
import { alvosDeJevDaOrg } from '@/lib/ai/jev/resolver';
import {
  perguntaDoPlanoDeTurno,
  planoDoTurnoDaJev,
  type PlanoDoTurno,
} from '@/lib/ai/jev/pontos/plano-de-turno';
import {
  JANELA_DA_CONVERSA,
  montarContextoDaConversa,
  type ContextoDaConversa,
  type EstadoDaConversa,
} from './contexto-da-conversa';
import type { CatalogoDaConversa } from './catalogo-da-conversa';
import type { MotoDoCatalogo } from './fotos-do-catalogo';
import { idDaMoto } from '@/lib/ai/jev/pontos/plano-de-turno';

/** Mensagem mínima para o contexto (vinda do CRM). */
export interface MensagemCrua {
  direction: 'inbound' | 'outbound';
  body: string | null;
}

/** Lê as últimas `janela` mensagens da conversa (cronológico). */
export async function carregarUltimasMensagens(
  pool: pg.Pool,
  organizationId: string,
  conversationId: string,
  janela = JANELA_DA_CONVERSA,
): Promise<MensagemCrua[]> {
  const { rows } = await pool.query<MensagemCrua>(
    `select direction, body
       from messages
      where organization_id = $1 and conversation_id = $2
      order by sent_at desc
      limit $3`,
    [organizationId, conversationId, Math.max(Math.floor(janela), 1)],
  );
  return [...rows].reverse();
}

/**
 * Estado da conversa que a JEV recebe. Puro: só mapeia o snapshot do catálogo da
 * conversa + orçamento + câmbio pedido.
 */
export function estadoDaConversaDe(
  catalogo: CatalogoDaConversa,
  orcamento: number | null,
  cambioPedido: 'automatico' | 'manual' | null,
  usoCategoria: 'cidade' | 'trilha' | 'estrada' | null = null,
): EstadoDaConversa {
  return {
    orcamento,
    escolhida: catalogo.escolhida?.nome ?? null,
    referencia: catalogo.referencia?.nome ?? null,
    motosMostradas: catalogo.motos.map((m) => m.nome),
    fila: (catalogo.opcoes?.pendentes ?? []).map((m) => m.nome),
    objecao: catalogo.objecao
      ? { motivo: catalogo.objecao.motivo, tentativas: catalogo.objecao.tentativas }
      : null,
    formaDePagamentoPerguntada: catalogo.formaDePagamentoPerguntada === true,
    usoCategoria,
    cambioPedido,
  };
}

/** Monta o contexto (pure) a partir do snapshot + mensagens + estoque. */
export function montarContextoDoPlano(args: {
  mensagens: readonly MensagemCrua[];
  catalogoDaConversa: CatalogoDaConversa;
  orcamento: number | null;
  cambioPedido: 'automatico' | 'manual' | null;
  usoCategoria?: 'cidade' | 'trilha' | 'estrada' | null;
  catalogo: readonly MotoDoCatalogo[];
  janela?: number;
}): ContextoDaConversa {
  return montarContextoDaConversa({
    mensagens: args.mensagens,
    estado: estadoDaConversaDe(
      args.catalogoDaConversa,
      args.orcamento,
      args.cambioPedido,
      args.usoCategoria ?? null,
    ),
    catalogo: args.catalogo,
    janela: args.janela ?? JANELA_DA_CONVERSA,
  });
}

/**
 * Chama a JEV (`plano_de_turno`) e devolve o plano. `null` = JEV indisponível/sem
 * binding — o turno segue pelo caminho de hoje (fallback).
 */
export async function decidirPlanoDoTurno(args: {
  pool: pg.Pool;
  tenantId: string;
  conversationId: string;
  catalogoDaConversa: CatalogoDaConversa;
  catalogo: readonly MotoDoCatalogo[];
  orcamento: number | null;
  cambioPedido: 'automatico' | 'manual' | null;
  usoCategoria?: 'cidade' | 'trilha' | 'estrada' | null;
  limite?: number;
  janela?: number;
  log?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
  };
}): Promise<PlanoDoTurno | null> {
  const alvos = await alvosDeJevDaOrg(args.pool, args.tenantId, 'plano_de_turno');
  if (alvos.length === 0) return null;

  const mensagens = await carregarUltimasMensagens(
    args.pool,
    args.tenantId,
    args.conversationId,
    args.janela ?? JANELA_DA_CONVERSA,
  );
  const ctx = montarContextoDoPlano({
    mensagens,
    catalogoDaConversa: args.catalogoDaConversa,
    orcamento: args.orcamento,
    cambioPedido: args.cambioPedido,
    usoCategoria: args.usoCategoria ?? null,
    catalogo: args.catalogo,
    janela: args.janela ?? JANELA_DA_CONVERSA,
  });
  // Escolha só entre as motos EM FOCO/MOSTRADAS (as 25 do estoque no `choice`
  // deixavam a JEV lenta/sem preencher no turno — medido 2026-10-27). As notas
  // por moto continuam sobre o estoque inteiro.
  const vistos = new Set<string>();
  const escolhidaOpcoes = [
    args.catalogoDaConversa.escolhida,
    args.catalogoDaConversa.referencia,
    ...args.catalogoDaConversa.motos,
  ].filter((m): m is MotoDoCatalogo => m !== null && m !== undefined && (vistos.has(idDaMoto(m)) ? false : (vistos.add(idDaMoto(m)), true)));
  const perguntas = perguntaDoPlanoDeTurno(ctx, args.catalogo, escolhidaOpcoes);
  // STATE ENXUTO: o catálogo vai só com os FATOS (sem `fotos`/`valores` completos)
  // — com o objeto cheio + 30 mensagens o request estourava o `schema` da JEV
  // (medido 2026-10-27 no pesado). As instruções (`perguntas`) seguem com o
  // catálogo completo; o STATE é o que a JEV lê.
  const catalogoEnxuto = args.catalogo.map((m) => {
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
    state: {
      mensagens: ctx.mensagens,
      rajada: ctx.rajada,
      estado: ctx.estado,
      catalogo: catalogoEnxuto,
    },
    questions: perguntas,
    // Essenciais: as notas por moto (`parecida_i`) e a `escolhida` são OPCIONAIS —
    // exigir todas fazia a JEV devolver `null` quando omitia uma nota. O mapper
    // trata ausência (nota 0 / escolhida null).
    perguntasObrigatorias: ['acao'],
    opcoes: {
      timeoutPorTentativaMs: 30000,
      capTotalMs: 120000,
      aoTentar: (info: unknown) => args.log?.warn('plano: tentativa da JEV', { info }),
    },
    aoEsgotar: (info: unknown) =>
      args.log?.warn('plano: JEV esgotou (infra) — fallback ao caminho atual', { info }),
  });
  args.log?.info('plano: decidido', {
    respostas: decisao === null ? null : Object.keys(decisao.respostas).length,
    catalogo: args.catalogo.length,
    mensagens: ctx.mensagens.length,
  });
  if (decisao === null) return null;
  return planoDoTurnoDaJev(decisao.respostas, args.catalogo, {
    limite: args.limite ?? 5,
  });
}
