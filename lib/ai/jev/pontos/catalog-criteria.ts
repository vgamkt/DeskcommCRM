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
  /**
   * ESCOPO 9 — motos que o cliente JÁ tem em FOCO na conversa (interesse
   * demonstrado, ex.: as CB apresentadas). Quando o cliente ADICIONA um critério
   * numérico a elas ("e tem alguma até 17 mil?"), isto é um REFINO do interesse
   * (interesse ∩ critério) — não um pedido novo. A Jev usa isto como CONTEXTO
   * para ancorar as hipóteses na MESMA família/linha da moto em foco.
   */
  motoEmFoco?: readonly string[];
}

/** Lista compacta de nomes para o contexto (evita estourar o prompt). */
function listaDeFoco(motos: readonly string[]): string {
  return motos.slice(0, 6).join('; ');
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

  const foco = e.motoEmFoco ?? [];
  const temFoco = foco.length > 0;
  // ESCOPO 9 + segmentação: definir a intenção SEM deixar pedido de modelo virar
  // "alternativa" (que no motor desliga o filtro). Casos, nesta ordem:
  //   (1) pede um MODELO por nome (mesmo de outro estilo) → "pedido";
  //   (2) ADICIONA um critério às motos em foco ("e tem alguma até 17 mil?") → "pedido" (REFINO);
  //   (3) só REAGE à moto em foco SEM pedir modelo novo (caro/cor/ano/barata/rodada) → "alternativa".
  const instrucaoIntencao = temFoco
    ? `O cliente JÁ tem estas motos em FOCO na conversa (interesse demonstrado): ${listaDeFoco(foco)}. REGRAS: ` +
      '(1) Se a mensagem PEDE/PERGUNTA por um MODELO por NOME (ex.: "tem uma Lander 250?", "queria uma XRE 190") → responda "pedido": é um PEDIDO NOVO, MESMO que o modelo seja de outro estilo/marca que o foco. NUNCA responda "alternativa" só porque o modelo pedido é diferente do foco. ' +
      '(2) Se a mensagem ADICIONA um critério (preço, cilindrada, ano, cor) às motos em foco — ex.: "e tem alguma até 17 mil?" → responda "pedido" também (é REFINO: continua querendo a MESMA família/linha, agora com o critério) e marque em "parecida" as motos da MESMA família/linha. ' +
      '(3) Só responda "alternativa" se o cliente REAGIR à moto em foco SEM pedir um modelo novo: achou caro, quer outra cor/ano, quer mais barata, está muito rodada (ex.: "achei caro", "quero outra cor", "tem mais barata?").'
    : 'O cliente está PEDINDO uma moto, ou falando de uma e quer algo DIFERENTE dela (alternativa)?';
  const perguntas: PerguntasDeJev = {
    intencao: {
      type: 'choice',
      instructions: instrucaoIntencao,
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

  // A MARCA POR SI precisa de um ALVO único (2026-10-05, medido: "quero uma
  // Honda" marcava Yamaha como parecida e o filtro de marca — que casa o alvo
  // pelas hipóteses — virava união e não filtrava nada). Aqui a Jev diz O VALOR
  // da marca que o cliente pediu; o motor filtra por ele. Conserto na Jev, não
  // regex.
  const marcaCol = e.colunas.find((c) => ehColunaDeMarca(c));
  if (marcaCol) {
    const marcas: string[] = [];
    for (const m of e.estoque) {
      const v = (m.valores?.[marcaCol] ?? '').trim();
      if (v !== '' && !marcas.includes(v)) marcas.push(v);
    }
    const criteriaMarca: Record<string, string> = {
      nenhuma: 'o cliente NÃO pediu marca (ou a marca veio só DENTRO do nome do modelo)',
    };
    for (const m of marcas) criteriaMarca[m] = `a marca ${m}`;
    perguntas.marca_alvo = {
      type: 'choice',
      instructions:
        'O cliente pediu uma MARCA por si, como FILTRO? Ex.: "quero uma Honda"→Honda; "tem Yamaha?"→Yamaha. Se a marca apareceu apenas DENTRO do nome de um modelo (ex.: "Honda CB 250", "CB 250") ou o cliente não citou marca, responda "nenhuma".',
      criteria: criteriaMarca,
    };
  }

  // ESCOPO 11 — ESTILO/CATEGORIA por si (como a marca-alvo): quando o cliente
  // pede um estilo ("quero uma trail", "pra trilha", "uma naked", "scooter"),
  // a Jev escolhe a CATEGORIA REAL do estoque. O motor então MANTÉM esse estilo
  // (filtro exato) — não completa com outros estilos (medido ao vivo: "trail"
  // trazendo CB 300 F seminova). Sem isto, a categoria só vinha por acaso.
  const catCol = e.colunas.find((c) => detectarPapelColuna(c) === 'tipo');
  if (catCol) {
    const categorias: string[] = [];
    for (const m of e.estoque) {
      const v = (m.valores?.[catCol] ?? '').trim();
      if (v !== '' && !categorias.includes(v)) categorias.push(v);
    }
    const criteriaCat: Record<string, string> = {
      nenhuma: 'o cliente NÃO pediu estilo/categoria por si (ou citou só dentro de um modelo)',
    };
    for (const c of categorias) criteriaCat[c] = `o estilo/categoria "${c}"`;
    perguntas.categoria_alvo = {
      type: 'choice',
      instructions:
        'O cliente pediu um ESTILO/CATEGORIA por si, como FILTRO? Ex.: "quero uma trail", "algo pra trilha/on-off", "uma naked", "scooter", "esportiva", "custom", "uso misto cidade e trilha" (escolha a categoria REAL do estoque que corresponde). Se ele citou o estilo apenas DENTRO do nome de um modelo, ou não citou estilo, responda "nenhuma".',
      criteria: criteriaCat,
    };
  }

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
          : detectarPapelColuna(col) === 'tipo'
            ? 'O cliente mencionou um ESTILO/CATEGORIA por si como FILTRO? Ex.: "quero uma trail", "algo pra trilha/on-off", "uma naked", "scooter", "esportiva", "custom", "uso misto cidade e trilha". Quando ele descreve o USO/TERRENO (trilha, terra, estrada, cidade), marque SIM — o motor vai MANTER esse estilo (não completar com outros). Se ele citou o estilo apenas DENTRO de um modelo, responda NÃO.'
            : detectarPapelColuna(col) === 'km'
              ? 'O cliente FALOU de QUILOMETRAGEM/rodagem/km por si (ex.: "com pouca km", "menos rodada", "até 30 mil km")? Na DÚVIDA, responda NÃO — marcar km sem o cliente pedir EXCLUI motos boas (medido ao vivo).'
              : ehColunaDePotencia(col)
                ? 'O cliente FALOU de POTÊNCIA/cavalos/cv por si (ex.: "uma mais potente", "acima de 30 cavalos")? Na DÚVIDA, responda NÃO — marcar potência sem o cliente pedir EXCLUI motos boas.'
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

  // ESCOPO 9: quando há moto em FOCO e o cliente adiciona um critério, a família
  // dela MANDA na nota (interesse ∩ critério): quem é da MESMA linha e cabe no
  // critério vem antes; quem é de outra linha só entra se não houver da linha.
  const regraDeFoco = temFoco
    ? `REGRA DO INTERESSE EM FOCO: o cliente já demonstrou interesse por: ${listaDeFoco(foco)}. Se a mensagem apenas ADICIONA um critério a essas motos (ex.: "e tem alguma até 17 mil?"), dê nota ALTA (≥0,7) às motos do estoque da MESMA família/linha (ex.: uma CB se o foco é CB), desde que caibam no critério; dê nota BAIXA a modelos de OUTRA família, MESMO que caibam no critério (eles são só o "plano B"). `
    : '';
  e.estoque.slice(0, MAX_MOTOS_HIPOTESES).forEach((m, i) => {
    perguntas[`parecida_${i}`] = {
      type: 'noul',
      // Julgamento por TODOS os atributos relevantes — cor/marca/preço só quando o
      // cliente pediu. PESO: a CILINDRADA pesa mais quando não há outro filtro
      // (moto de cc próxima conta, mesmo de outra marca — dono, 2026-10-06), e os
      // FILTROS COMBINADOS ("CB 2025" = modelo+ano) pesam mais que uma parte só.
      // A FAMÍLIA do nome (ex.: "CB") conta, mas NÃO é obrigatória nem excludente;
      // NÃO exclua por marca. Na dúvida, sim.
      //
      // EXCEÇÃO (2026-10-05, medido: "quero uma Honda" trazia Yamaha): quando o
      // cliente PEDE UMA MARCA por si, a marca É o filtro — o motor casa a marca
      // pelas hipóteses, então marcar moto de OUTRA marca como parecida anula o
      // filtro e mistura concorrentes. Nesse caso, só a MESMA marca é parecida.
      instructions: `${regraDeFoco}Esta moto do ESTOQUE se parece com o que o cliente quer? Dê uma NOTA de 0 a 1 de semelhança (assimile o CONJUNTO do que ele pediu — nome/modelo/família, cilindrada COM MARGEM, ano, preço, categoria, potência — mas NÃO pontue por COR, cor não ordena). 1 = combina quase tudo; 0,7 = combina a maioria; 0,5 = combina em parte/próximo (ex.: cilindrada perto ±30%); 0 = não combina quase nada. A CILINDRADA pesa um pouco MAIS. REGRA DA NOTA ALTA: só dê nota ≥0,7 a quem casa o MODELO/FAMÍLIA do que o cliente pediu OU tem CILINDRADA próxima (±30%). Quem NÃO casa nem o modelo/família NEM a cilindrada (ex.: cliente quer "cb 250" e a moto é uma Dominar 400 — outro modelo E outra cilindrada) recebe nota BAIXA (≤0,2). NUNCA dê nota alta por marca, preço ou categoria sozinhos. (1) quando o cliente NÃO especificou marca, preço, cor nem outro atributo à parte, a CILINDRADA é o critério que MAIS pesa — moto de cilindrada próxima (±30%) conta como PARECIDA, mesmo de OUTRA marca (ex.: quer "250" → a Yamaha XMax 250 conta). (2) FILTROS COMBINADOS (ex.: "CB 2025" = modelo + ano; "Honda 300" = marca + cilindrada) — a moto que casa a COMBINAÇÃO INTEIRA é MUITO mais parecida. REGRA: se o cliente NÃO pediu marca, NUNCA exclua por marca. EXCEÇÃO: se o cliente PEDIU UMA MARCA por si (ex.: "quero uma Honda", "tem Yamaha?"), só dê nota alta para motos DESSA MESMA marca. "${m.nome}"`,
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

/**
 * Alarga a faixa em ±`pct`% (para cima e para baixo), arredondando. O teto
 * ("até X") MANTÉM a margem (dono, 2026-10-15): "até 15 mil" busca até ~19.500,
 * mas ORDENA pela mais próxima de 15.000 primeiro — o que fica acima do teto
 * entra depois, por proximidade. A margem é decisão do dono.
 */
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

  // ESCOPO 11: `faixas` = EXATO (o que o cliente pediu) — a 1ª oferta mostra SÓ
  // quem casa exatamente. `faixasSimilares` = mesmo intervalo com a MARGEM de
  // ±30% — vira a FILA do "quer ver similares?": motos que NÃO batem o pedido
  // (acima do teto, etc.) saem SOMENTE depois da confirmação do cliente. Antes a
  // margem ia embutida na faixa estrita e uma moto de 22.5k aparecia antes das de
  // ≤20k (medido ao vivo).
  const faixas: Record<string, unknown> = {};
  const faixasSimilares: Record<string, unknown> = {};
  const registrarFaixa = (
    col: string,
    escolha: string | undefined,
    modo: string | undefined,
    opcoes: readonly FaixaDeOpcao[],
  ): void => {
    if (escolha === undefined) return;
    const exata = aplicarModo(faixaEscolhida(escolha, opcoes), modo);
    if (!exata) return;
    faixas[col] = exata;
    const margem = aplicarMargem(exata, MARGEM_NUMERICA_PCT);
    if (margem) faixasSimilares[col] = margem;
  };
  const precoCol = e.colunas.find((c) => detectarPapelColuna(c) === 'preco');
  const precoResp = respostas.cx_preco;
  if (precoCol && precoResp?.type === 'choice') {
    registrarFaixa(precoCol, precoResp.choice, modoDe(respostas, 'modo_preco'), FAIXAS_DE_PRECO);
  }
  const ccCol = e.colunas.find((c) => detectarPapelColuna(c) === 'cilindrada');
  const ccResp = respostas.cx_cilindrada;
  if (ccCol && ccResp?.type === 'choice') {
    registrarFaixa(ccCol, ccResp.choice, modoDe(respostas, 'modo_cilindrada'), FAIXAS_DE_CILINDRADA);
  }
  const potenciaCol = e.colunas.find(ehColunaDePotencia);
  const potenciaResp = respostas.cx_potencia;
  if (potenciaCol && potenciaResp?.type === 'choice') {
    registrarFaixa(potenciaCol, potenciaResp.choice, modoDe(respostas, 'modo_potencia'), FAIXAS_DE_POTENCIA);
  }

  // Marca-alvo dita pela Jev: vira EXIGÊNCIA + faixa de texto. O motor filtra
  // pela marca exata (não pela união das marcas das hipóteses).
  const marcaCol = e.colunas.find((c) => ehColunaDeMarca(c));
  const marcaResp = respostas.marca_alvo;
  if (
    marcaCol &&
    marcaResp?.type === 'choice' &&
    marcaResp.choice !== 'nenhuma' &&
    marcaResp.choice.trim() !== ''
  ) {
    if (!exigidos.includes(marcaCol)) exigidos.push(marcaCol);
    faixas[marcaCol] = [marcaResp.choice];
  }

  // ESTILO/CATEGORIA por si: vira EXIGÊNCIA + faixa de texto na coluna de
  // categoria — o motor MANTÉM o estilo (não completa com outros).
  const catCol = e.colunas.find((c) => detectarPapelColuna(c) === 'tipo');
  const catResp = respostas.categoria_alvo;
  if (
    catCol &&
    catResp?.type === 'choice' &&
    catResp.choice !== 'nenhuma' &&
    catResp.choice.trim() !== ''
  ) {
    if (!exigidos.includes(catCol)) exigidos.push(catCol);
    faixas[catCol] = [catResp.choice];
  }

  const comoHipotese = (
    m: { nome: string; valores?: Record<string, string> },
    score?: number,
  ): HipoteseDeMoto => {
    const hip: HipoteseDeMoto = { nome: m.nome };
    for (const col of e.colunas) {
      const v = m.valores?.[col];
      if (typeof v === 'string' && v.trim() !== '') hip[col] = v.trim();
    }
    // O "passo extra": guarda a NOTA (0–1) que a Jev deu à candidata, para o
    // motor ORDENAR por ela (maior primeiro) — não só pelo sim/não.
    if (typeof score === 'number') hip.score = score;
    return hip;
  };

  const notaDa = (i: number): number => {
    const resp = respostas[`parecida_${i}`];
    return resp?.type === 'noul' && typeof resp.noul === 'number' ? resp.noul : 0;
  };

  const hipoteses: HipoteseDeMoto[] = [];
  e.estoque.slice(0, MAX_MOTOS_HIPOTESES).forEach((m, i) => {
    if (!ehVerdadeiro(respostas[`parecida_${i}`])) return;
    hipoteses.push(comoHipotese(m, notaDa(i)));
  });

  // A Jev NÃO pode devolver VAZIO quando pontuou (dono, 2026-10-06): se nenhuma
  // passou do limiar, mantém as MELHORES pela própria nota dela (top 3). Assim o
  // motor sempre tem a decisão da Jev e não cai no ranking geral por texto.
  if (hipoteses.length === 0) {
    const top = e.estoque
      .slice(0, MAX_MOTOS_HIPOTESES)
      .map((m, i) => ({ m, score: notaDa(i) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    for (const x of top) hipoteses.push(comoHipotese(x.m, x.score));
  }

  return { intencao, criterios: {}, hipoteses, faixas, faixasSimilares, principal, exigidos };
}
