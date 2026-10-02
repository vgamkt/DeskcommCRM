/**
 * Mapeamento do ponto `catalog_criteria` para a Jev (Fase 4).
 *
 * O extrator devolve um objeto RICO. A Jev NÃO extrai valor livre/número, então
 * o recorte (decidido com o dono em 2026-10-02) é:
 *  - CLASSIFICAÇÃO pela Jev: `intencao`, `exigidos` (noul por coluna) e `principal` (choice);
 *  - FAIXAS pela Jev: `preco` e `cilindrada` escolhidas entre as FAIXAS abaixo (definidas
 *    pelo dono) — evitando inventar números;
 *  - `hipoteses`: a Jev diz quais motos do ESTOQUE são parecidas (noul por moto), e os
 *    VALORES vêm do próprio estoque (não inventados).
 *  - `criterios` (valor livre por coluna) fica vazio no caminho da Jev.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import { detectarPapelColuna } from '@/lib/external-db/catalogo';

import type { CriteriosExtraidos, HipoteseDeMoto } from '../../../agent-engine/agent/extrair-criterios';
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export interface FaixaDeOpcao {
  rotulo: string;
  min?: number;
  max?: number;
}

/** Faixas de PREÇO (R$) — definidas com o dono em 2026-10-02. */
export const FAIXAS_DE_PRECO: readonly FaixaDeOpcao[] = [
  { rotulo: 'não citou' },
  { rotulo: 'até 10 mil', max: 10000 },
  { rotulo: '10 a 15 mil', min: 10000, max: 15000 },
  { rotulo: '15 a 20 mil', min: 15000, max: 20000 },
  { rotulo: '20 a 30 mil', min: 20000, max: 30000 },
  { rotulo: 'acima de 30 mil', min: 30000 },
];

/** Faixas de CILINDRADA (cc) — definidas com o dono em 2026-10-02. */
export const FAIXAS_DE_CILINDRADA: readonly FaixaDeOpcao[] = [
  { rotulo: 'não citou' },
  { rotulo: 'até 125', max: 125 },
  { rotulo: '126 a 160', min: 126, max: 160 },
  { rotulo: '161 a 250', min: 161, max: 250 },
  { rotulo: '251 a 300', min: 251, max: 300 },
  { rotulo: 'acima de 300', min: 300 },
];

/** Limiar de `noul` para considerar a hipótese verdadeira. */
const LIMIAR_NOUL = 0.5;
const MAX_MOTOS_HIPOTESES = 60;

/** O mínimo de uma moto do estoque que a Jev precisa. */
export interface MotoDeEstoque {
  nome: string;
  valores?: Record<string, string>;
}

export interface EntradaDeCriterios {
  /** Colunas de critério PERMITIDAS (já sem o `ano` quando bloqueado). */
  colunas: readonly string[];
  estoque: readonly MotoDeEstoque[];
}

function rotulos(opcoes: readonly FaixaDeOpcao[]): Record<string, string> {
  return Object.fromEntries(opcoes.map((o) => [o.rotulo, o.rotulo]));
}

function ehVerdadeiro(a: RespostasDeJev[string] | undefined): boolean {
  return a?.type === 'noul' && typeof a.noul === 'number' && a.noul > LIMIAR_NOUL;
}

/** Monta as perguntas da Jev para o `catalog_criteria`. */
export function perguntaDeCriteriosDeJev(e: EntradaDeCriterios): PerguntasDeJev {
  const criteriaPrincipal: Record<string, string> = { nenhum: 'sem destaque' };
  for (const col of e.colunas) criteriaPrincipal[col] = `o cliente enfatizou "${col}"`;

  const perguntas: PerguntasDeJev = {
    intencao: {
      type: 'choice',
      instructions:
        'O cliente está PEDINDO uma moto, ou falando de uma e quer algo DIFERENTE dela (alternativa)?',
      criteria: {
        pedido: 'o cliente pede/quer uma moto (nome, marca, cilindrada, estilo…)',
        alternativa:
          'o cliente fala de uma moto e quer algo DIFERENTE (achou caro, outra cor/ano/marca, mais barata)',
        nenhum: 'nenhuma das duas',
      },
    },
    principal: {
      type: 'choice',
      instructions: 'Qual coluna de critério o cliente MAIS enfatizou?',
      criteria: criteriaPrincipal,
    },
  };

  for (const col of e.colunas) {
    perguntas[`exigidos_${col}`] = {
      type: 'noul',
      instructions: `O cliente DECLAROU EXPLICITAMENTE a coluna "${col}"? (NÃO conte o que foi apenas deduzido)`,
    };
  }

  const criteriaModo = {
    teto: 'TETO/limite superior (até, no máximo, uns)',
    intervalo: 'INTERVALO (entre X e Y)',
    nao_citou: 'não citou esse número',
  } as const;
  if (e.colunas.some((c) => detectarPapelColuna(c) === 'preco')) {
    perguntas.cx_preco = {
      type: 'choice',
      instructions: 'Qual faixa de PREÇO o cliente citou?',
      criteria: rotulos(FAIXAS_DE_PRECO),
    };
    perguntas.modo_preco = {
      type: 'choice',
      instructions:
        'O preço foi um TETO (até/uns) ou um INTERVALO (entre X e Y)? "até 20 mil" = teto.',
      criteria: criteriaModo,
    };
  }
  if (e.colunas.some((c) => detectarPapelColuna(c) === 'cilindrada')) {
    perguntas.cx_cilindrada = {
      type: 'choice',
      instructions: 'Qual faixa de CILINDRADA o cliente citou?',
      criteria: rotulos(FAIXAS_DE_CILINDRADA),
    };
    perguntas.modo_cilindrada = {
      type: 'choice',
      instructions: 'A cilindrada foi um TETO (até) ou um INTERVALO (entre X e Y)?',
      criteria: criteriaModo,
    };
  }

  e.estoque.slice(0, MAX_MOTOS_HIPOTESES).forEach((m, i) => {
    perguntas[`parecida_${i}`] = {
      type: 'noul',
      instructions: `Esta moto do ESTOQUE tem configuração PARECIDA com o que o cliente quer (na dúvida, sim)? "${m.nome}"`,
    };
  });

  return perguntas;
}

function faixaEscolhida(
  escolha: string,
  opcoes: readonly FaixaDeOpcao[],
): { min?: number; max?: number } | null {
  const opt = opcoes.find((o) => o.rotulo === escolha);
  if (!opt || (opt.min === undefined && opt.max === undefined)) return null;
  return {
    ...(opt.min !== undefined ? { min: opt.min } : {}),
    ...(opt.max !== undefined ? { max: opt.max } : {}),
  };
}

/**
 * Ajusta a faixa ao MODO dito pelo cliente: em "teto" (até), vale só o LIMITE
 * SUPERIOR — sem inventar um mínimo que ele não pediu (ex.: "até 20 mil" não
 * pode virar "15 a 20 mil"). Em "intervalo", min e max valem.
 */
function aplicarModo(
  f: { min?: number; max?: number } | null,
  modo: string | undefined,
): { min?: number; max?: number } | null {
  if (!f) return null;
  if (modo === 'teto') return f.max !== undefined ? { max: f.max } : f;
  return f;
}

function modoDe(respostas: RespostasDeJev, chave: string): string | undefined {
  const a = respostas[chave];
  return a?.type === 'choice' ? a.choice : undefined;
}

/** Converte as respostas da Jev no `CriteriosExtraidos` do motor. */
export function criteriosDaRespostaDeJev(
  respostas: RespostasDeJev,
  e: EntradaDeCriterios,
): CriteriosExtraidos {
  const intencaoResp = respostas.intencao;
  const intencao =
    intencaoResp?.type === 'choice' &&
    (intencaoResp.choice === 'pedido' || intencaoResp.choice === 'alternativa')
      ? intencaoResp.choice
      : null;

  const exigidos: string[] = [];
  for (const col of e.colunas) {
    if (ehVerdadeiro(respostas[`exigidos_${col}`])) exigidos.push(col);
  }

  const principalResp = respostas.principal;
  const principal =
    principalResp?.type === 'choice' && e.colunas.includes(principalResp.choice)
      ? principalResp.choice
      : null;

  const faixas: Record<string, { min?: number; max?: number }> = {};
  const precoCol = e.colunas.find((c) => detectarPapelColuna(c) === 'preco');
  const precoResp = respostas.cx_preco;
  if (precoCol && precoResp?.type === 'choice') {
    const f = aplicarModo(
      faixaEscolhida(precoResp.choice, FAIXAS_DE_PRECO),
      modoDe(respostas, 'modo_preco'),
    );
    if (f) faixas[precoCol] = f;
  }
  const ccCol = e.colunas.find((c) => detectarPapelColuna(c) === 'cilindrada');
  const ccResp = respostas.cx_cilindrada;
  if (ccCol && ccResp?.type === 'choice') {
    const f = aplicarModo(
      faixaEscolhida(ccResp.choice, FAIXAS_DE_CILINDRADA),
      modoDe(respostas, 'modo_cilindrada'),
    );
    if (f) faixas[ccCol] = f;
  }

  const hipoteses: HipoteseDeMoto[] = [];
  e.estoque.slice(0, MAX_MOTOS_HIPOTESES).forEach((m, i) => {
    if (!ehVerdadeiro(respostas[`parecida_${i}`])) return;
    const hip: HipoteseDeMoto = { nome: m.nome };
    for (const col of e.colunas) {
      const v = m.valores?.[col];
      if (typeof v === 'string' && v.trim() !== '') hip[col] = v.trim();
    }
    hipoteses.push(hip);
  });

  return { intencao, criterios: {}, hipoteses, faixas, principal, exigidos };
}
