/**
 * ÁRBITRO DE TURNO (Fase 4) — UMA chamada da Jev para VÁRIOS pontos.
 *
 * POR QUE EXISTE: hoje cada ponto de decisão do turno (escolha da moto, critérios
 * do catálogo, objeção, oferta, fluxo…) faz a SUA própria chamada da Jev. Pontos
 * que decidem sobre o MESMO turno acabam vendo contextos levemente diferentes e
 * custando N chamadas. O Árbitro junta vários pontos numa ÚNICA chamada: um estado
 * unificado (o contexto do turno + o contexto de cada ponto, aninhado) e as
 * perguntas de todos os pontos, com ids prefixados para não colidirem.
 *
 * É um MECANISMO (aditivo): quem migra passa a chamar `arbitrar(...)` e a usar
 * `porPonto[ponto]` no lugar da chamada própria. Se os pontos NÃO compartilharem o
 * mesmo alvo da Jev, ou se a decisão não vier, `arbitrar` devolve `null` e o
 * chamador segue pelo caminho por ponto (nada muda).
 *
 * Não lança.
 */
import type pg from 'pg';

import type { Logger } from '../../agent-engine/obs/logger';
import { decidir, type AlvoDeJev } from './index';
import { alvosDeJevDaOrg } from './resolver';
import type { PerguntasDeJev, RespostasDeJev, UsoDeJev } from './tipos';

/** Um ponto que participa da chamada única do Árbitro. */
export interface PedidoAoArbitro {
  /** Id do ponto (ex.: 'moto_escolhida', 'catalog_criteria') — vira o prefixo. */
  ponto: string;
  /** Contexto DESTE ponto (fica em `state.pontos[ponto]`). */
  contexto: Record<string, unknown>;
  /** Perguntas do ponto, com os ids ORIGINAIS dele. */
  perguntas: PerguntasDeJev;
  /** Ids obrigatórios (default: todas as perguntas do ponto). */
  obrigatorias?: readonly string[];
}

/** Resultado do Árbitro: as respostas de cada ponto, com os ids ORIGINAIS. */
export interface VereditoDoArbitro {
  provider: string;
  model: string;
  usage: UsoDeJev;
  tentativas: number;
  porPonto: Record<string, RespostasDeJev>;
}

/** Separador entre o id do ponto e o id da pergunta (não aparece em ids reais). */
const SEP = '::';

function chaveDoAlvo(a: AlvoDeJev): string {
  return `${a.provider}\u0000${a.model ?? ''}\u0000${a.baseUrl ?? ''}`;
}

/**
 * Faz UMA chamada da Jev respondendo TODOS os `pedidos`. Devolve `null` quando não
 * há como unificar (nenhum alvo, alvos divergentes, ou a Jev não respondeu) — o
 * chamador então usa o caminho por ponto.
 */
export async function arbitrar(args: {
  db: pg.Pool;
  tenantId: string;
  /** Contexto comum do turno (rajada, citação, dados do cliente…). */
  turno: Record<string, unknown>;
  pedidos: readonly PedidoAoArbitro[];
  log?: Logger;
}): Promise<VereditoDoArbitro | null> {
  if (args.pedidos.length === 0) return null;
  try {
    // Todos os pontos precisam compartilhar o MESMO alvo da Jev: uma chamada só
    // usa um provedor/modelo. Se divergirem, não unifica (caminho por ponto).
    const alvosPorPonto = await Promise.all(
      args.pedidos.map((p) => alvosDeJevDaOrg(args.db, args.tenantId, p.ponto)),
    );
    const primeiro = alvosPorPonto[0] ?? [];
    if (primeiro.length !== 1) return null;
    const k = chaveDoAlvo(primeiro[0]!);
    if (!alvosPorPonto.every((as) => as.length === 1 && chaveDoAlvo(as[0]!) === k)) return null;

    // UM ponto só: estado PLANO e perguntas SEM prefixo — chamada EXATAMENTE igual
    // à que o ponto faria sozinho (migrar um ponto não muda comportamento; o ganho
    // é o pipeline do Árbitro ficar em vigor).
    if (args.pedidos.length === 1) {
      const p = args.pedidos[0]!;
      const decisao = await decidir({
        alvos: primeiro,
        state: { ...args.turno, ...p.contexto },
        questions: p.perguntas,
        ...(p.obrigatorias !== undefined ? { perguntasObrigatorias: [...p.obrigatorias] } : {}),
      });
      if (decisao === null) return null;
      args.log?.info('árbitro: decisão da Jev (1 ponto)', {
        ponto: p.ponto,
        provider: decisao.provider,
        tentativas: decisao.tentativas,
      });
      return {
        provider: decisao.provider,
        model: decisao.model,
        usage: decisao.usage,
        tentativas: decisao.tentativas,
        porPonto: { [p.ponto]: decisao.respostas },
      };
    }

    // VÁRIOS pontos: perguntas com id prefixado + estado aninhado por ponto. A
    // instrução ganha um localizador para a Jev saber ONDE está o contexto daquele
    // ponto (evita colisão de ids — ex.: dois pontos com a pergunta `criterio`).
    const pontos: Record<string, unknown> = {};
    const questions: PerguntasDeJev = {};
    const obrigatorias: string[] = [];
    for (const p of args.pedidos) {
      pontos[p.ponto] = p.contexto;
      for (const [id, q] of Object.entries(p.perguntas)) {
        questions[`${p.ponto}${SEP}${id}`] = {
          ...q,
          instructions: `[ponto "${p.ponto}" — use os dados em state.pontos.${p.ponto}] ${q.instructions}`,
        };
      }
      const obs = p.obrigatorias ?? Object.keys(p.perguntas);
      for (const id of obs) obrigatorias.push(`${p.ponto}${SEP}${id}`);
    }

    const decisao = await decidir({
      alvos: primeiro,
      state: { turno: args.turno, pontos },
      questions,
      perguntasObrigatorias: obrigatorias,
    });
    if (decisao === null) return null;

    const porPonto: Record<string, RespostasDeJev> = {};
    for (const p of args.pedidos) {
      const respostas: RespostasDeJev = {};
      for (const id of Object.keys(p.perguntas)) {
        const v = decisao.respostas[`${p.ponto}${SEP}${id}`];
        if (v !== undefined) respostas[id] = v;
      }
      porPonto[p.ponto] = respostas;
    }

    args.log?.info('árbitro: decisão única da Jev', {
      pontos: args.pedidos.map((p) => p.ponto),
      provider: decisao.provider,
      tentativas: decisao.tentativas,
    });
    return {
      provider: decisao.provider,
      model: decisao.model,
      usage: decisao.usage,
      tentativas: decisao.tentativas,
      porPonto,
    };
  } catch {
    return null;
  }
}
