/**
 * Mapeamento do ponto `catalog_criteria` para a Jev (Fase 4).
 *
 * O extrator devolve um objeto RICO. A Jev NÃO extrai valor livre/número, então
 * o recorte (decidido com o dono em 2026-10-02) é:
 *  - CLASSIFICAÇÃO pela Jev: `intencao`, `exigidos` (noul por coluna) e `principal` (choice);
 *  - FAIXAS pela Jev: `preco`, `cilindrada` e `potencia` escolhidas entre as FAIXAS abaixo
 *    (definidas pelo dono) — evitando inventar números. Decisão do dono (2026-10-02): depois
 *    de CATEGORIA, os atributos que MAIS importam são CILINDRADA e POTÊNCIA — a MARCA sozinha
 *    não é ênfase, e marca dentro do nome do modelo ("Honda CB 250") NÃO conta como exigência;
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

/**
 * Faixas de POTÊNCIA (cv). Decisão do dono (2026-10-02): depois de CATEGORIA, os
 * atributos que MAIS importam são CILINDRADA e POTÊNCIA — não a marca. A Jev
 * escolhe a faixa (não inventa número).
 */
export const FAIXAS_DE_POTENCIA: readonly FaixaDeOpcao[] = [
  { rotulo: 'não citou' },
  { rotulo: 'até 10', max: 10 },
  { rotulo: '11 a 15', min: 11, max: 15 },
  { rotulo: '16 a 20', min: 16, max: 20 },
  { rotulo: '21 a 30', min: 21, max: 30 },
  { rotulo: 'acima de 30', min: 30 },
];

/** A coluna é de POTÊNCIA? (não há papel próprio; detecta pelo nome.) */
export function ehColunaDePotencia(nome: string): boolean {
  const n = nome.toLowerCase();
  return /potenci/.test(n) || /cavalos/.test(n) || /\bcv\b/.test(n) || /\bhp\b/.test(n);
}

/** A coluna é de MARCA? (tratada com cuidado: não deve virar filtro por engano.) */
export function ehColunaDeMarca(nome: string): boolean {
  return /marca|fabricante|montadora/.test(nome.toLowerCase());
}

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
      instructions:
        'O cliente ENFATIZOU explicitamente UMA coluna — separada do nome do modelo? Ex.: "quero mais barata"→preco; "tem que ser Honda" (marca por si)→marca; "quero cinza"→cor; "motos de 250"/"250cc"→cilindrada; "quero uma scooter"→categoria. Se ele citou apenas um MODELO pelo NOME (ex.: "CB 250", "Fazer 250"), responda "nenhum": o nome mistura marca+cilindrada e NENHUM atributo deve dominar. Na dúvida, "nenhum".',
      criteria: criteriaPrincipal,
    },
  };

  for (const col of e.colunas) {
    perguntas[`exigidos_${col}`] = {
      type: 'noul',
      // A MARCA é a armadilha: em "Honda CB 250" ela aparece DENTRO do nome do
      // modelo, não como filtro. Marcá-la como exigida faz o motor filtrar por
      // marca e perder o MODELO (o defeito "só Honda"). Só conta como exigida
      // quando o cliente pede a marca por si ("quero uma Honda").
      //
      // A CILINDRADA tem a MESMA armadilha: o "250" de "CB 250" é parte do NOME,
      // não uma exigência de cc. Marcá-lo como exigido vira filtro de faixa (com
      // margem ±30% → 113–325!) e derruba a semelhança por nome/família (medido
      // 2026-10-05: "CB 250" deixou de fora os Honda CB 300, que são os mais
      // parecidos). Só exigir cilindrada quando o cliente falar de cc por si.
      instructions: ehColunaDeMarca(col)
        ? 'O cliente exigiu a MARCA como FILTRO (ex.: "quero uma Honda")? Se a marca apareceu apenas DENTRO do nome de um modelo (ex.: "Honda CB 250"), responda NÃO — ali o que importa é o MODELO.'
        : detectarPapelColuna(col) === 'cilindrada'
          ? 'O cliente pediu CILINDRADA por si (ex.: "quero uma 250", "250cc", "motos de 300", "entre 150 e 300")? Se o número apareceu apenas DENTRO do nome do MODELO (ex.: "CB 250", "Fazer 250"), responda NÃO — o número faz parte do nome, não é filtro.'
          : `O cliente DECLAROU EXPLICITAMENTE um valor para a coluna "${col}"? (NÃO conte o que foi apenas deduzido)`,
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
      instructions:
        'O cliente falou de CILINDRADA por si ("quero 250cc", "motos de 250", "entre 150 e 300")? Se o número é só parte do NOME do modelo (ex.: "CB 250", "Fazer 250"), responda "não citou".',
      criteria: rotulos(FAIXAS_DE_CILINDRADA),
    };
    perguntas.modo_cilindrada = {
      type: 'choice',
      instructions: 'A cilindrada foi um TETO (até) ou um INTERVALO (entre X e Y)?',
      criteria: criteriaModo,
    };
  }
  if (e.colunas.some(ehColunaDePotencia)) {
    perguntas.cx_potencia = {
      type: 'choice',
      instructions: 'Qual faixa de POTÊNCIA (cv) o cliente citou?',
      criteria: rotulos(FAIXAS_DE_POTENCIA),
    };
    perguntas.modo_potencia = {
      type: 'choice',
      instructions: 'A potência foi um TETO (até) ou um INTERVALO (entre X e Y)?',
      criteria: criteriaModo,
    };
  }

  e.estoque.slice(0, MAX_MOTOS_HIPOTESES).forEach((m, i) => {
    perguntas[`parecida_${i}`] = {
      type: 'noul',
      // Julgamento por TODOS os atributos relevantes, com PESO IGUAL — nome/
      // modelo/família, cilindrada, potência, categoria/tipo — e cor/marca/preço
      // só quando o cliente pediu. A FAMÍLIA do nome (ex.: "CB") conta, mas NÃO
      // é obrigatória nem excludente; NÃO exclua por marca. Na dúvida, sim.
      instructions: `Esta moto do ESTOQUE se parece com o que o cliente quer? Julgue por TODOS os atributos relevantes com PESO IGUAL (nome/modelo/família, cilindrada, potência, categoria/tipo); cor, marca e preço só pesam se o cliente pediu. Família do nome igual (ex.: "CB") conta, mas NÃO é obrigatória nem excludente; NUNCA exclua por marca — qualquer marca pode servir. Na dúvida, responda SIM. "${m.nome}"`,
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

/** Margem de ±30% na busca por NÚMERO (regra do dono): aceita um pouco acima e abaixo. */
export const MARGEM_NUMERICA_PCT = 30;

/** Alarga a faixa em ±`pct`% (para cima e para baixo), arredondando. */
function aplicarMargem(
  f: { min?: number; max?: number } | null,
  pct: number,
): { min?: number; max?: number } | null {
  if (!f) return null;
  const out: { min?: number; max?: number } = {};
  if (f.min !== undefined) out.min = Math.max(0, Math.round(f.min * (1 - pct / 100)));
  if (f.max !== undefined) out.max = Math.round(f.max * (1 + pct / 100));
  return out;
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
    // `nome` NUNCA é exigência de filtro: o MODELO é casado pelo próprio sistema
    // (hipóteses/pontuação). A Jev às vezes marca `nome` como exigido — ignoramos.
    if (col === 'nome') continue;
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
    const f = aplicarMargem(
      aplicarModo(faixaEscolhida(precoResp.choice, FAIXAS_DE_PRECO), modoDe(respostas, 'modo_preco')),
      MARGEM_NUMERICA_PCT,
    );
    if (f) faixas[precoCol] = f;
  }
  const ccCol = e.colunas.find((c) => detectarPapelColuna(c) === 'cilindrada');
  const ccResp = respostas.cx_cilindrada;
  if (ccCol && ccResp?.type === 'choice') {
    const f = aplicarMargem(
      aplicarModo(
        faixaEscolhida(ccResp.choice, FAIXAS_DE_CILINDRADA),
        modoDe(respostas, 'modo_cilindrada'),
      ),
      MARGEM_NUMERICA_PCT,
    );
    if (f) faixas[ccCol] = f;
  }
  const potenciaCol = e.colunas.find(ehColunaDePotencia);
  const potenciaResp = respostas.cx_potencia;
  if (potenciaCol && potenciaResp?.type === 'choice') {
    const f = aplicarMargem(
      aplicarModo(
        faixaEscolhida(potenciaResp.choice, FAIXAS_DE_POTENCIA),
        modoDe(respostas, 'modo_potencia'),
      ),
      MARGEM_NUMERICA_PCT,
    );
    if (f) faixas[potenciaCol] = f;
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
