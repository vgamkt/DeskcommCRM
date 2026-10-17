/**
 * Seleção de motos por INTENÇÃO (G4 do PLANO-SELECAO-MOTOS-INTENCAO).
 *
 * ─── O defeito que isto resolve ─────────────────────────────────────────────
 * O motor escolhia as semelhantes só quando o modelo havia consultado o catálogo
 * naquele turno (`catalogoDoTurno`). No turno da objeção ("Achei caro") o modelo
 * NÃO consulta o catálogo → nada era oferecido. Aqui a seleção vira uma função
 * PURA, chamável também quando só existe a MOTO ATUAL da conversa.
 *
 * ─── A regra ────────────────────────────────────────────────────────────────
 * 1. Separa PREFERÊNCIAS de ordem (`{preco:"menor"}`) dos critérios de
 *    semelhança (`{marca:"Honda"}`). Vale para QUALQUER coluna.
 * 2. Intenção "alternativa" + moto atual: usa os ATRIBUTOS da moto atual como
 *    âncora (só nas colunas de comparação que NÃO são preferência) e tira a
 *    própria moto da lista — o cliente quer algo parecido, mas diferente dela.
 *    A coluna que é PREFERÊNCIA fica FORA dos critérios de semelhança, senão a
 *    distância até o valor da atual (ex.: preço) diluiria "as mais baratas".
 * 3. `escolherComReferencia` mantém a reserva de `moto_similar` na frente.
 *
 * Funções PURAS — testáveis e sem I/O.
 */
import {
  colunaDeSimilares,
  colunasDeComparacao,
  detectarPapelColuna,
  type CatalogoMapeamento,
} from '@/lib/external-db/catalogo';

import { normalizarNomeDeMoto, type MotoDoCatalogo } from './fotos-do-catalogo';
import type { FaixasDoPedido, HipoteseDeMoto } from './extrair-criterios';
import { extrairCilindrada, extrairPrecoDoPedido, numeroDaCelula } from './similaridade';
import { escolherComReferencia } from './similaridade-referencia';

/**
 * Valores que a pergunta dirigida devolve quando o cliente quer um valor
 * DIFERENTE do atual naquela coluna (ex.: "quero outra cor" → `{cor:"outra"}`).
 * Nesse caso o motor FILTRA (exclui o valor da moto atual), em vez de tratar
 * "outra" como um valor literal de semelhança.
 */
const TOKENS_DIFERENTE = new Set([
  'outra',
  'outro',
  'outras',
  'outros',
  'diferente',
  'diferentes',
]);

export interface EntradaSelecaoPorIntencao {
  /** Texto do pedido do cliente (mensagem do turno), base do casamento textual. */
  termoBase: string;
  /** Critérios já reunidos (IA ou motor), por coluna. */
  criterios: Readonly<Record<string, string | number>>;
  /** Intenção classificada pela pergunta dirigida. */
  intencao: 'pedido' | 'alternativa' | null;
  /** Moto atual da conversa (âncora no modo "alternativa"). */
  motoAtual: MotoDoCatalogo | null;
  /** Motos candidatas (catálogo do turno, guardado e/ou consultado no banco). */
  candidatos: readonly MotoDoCatalogo[];
  mapeamento: CatalogoMapeamento;
  /**
   * Quantas motos oferecer quando há teto (default: `mapeamento.similaresQtd`,
   * por retrocompatibilidade). A fonte REAL agora é
   * `ai_agents.config.catalog.similares_qtd`, passada pelo chamador.
   */
  quantidade?: number;
  /**
   * Toggle B (`usar_limite_quantidade`): aplicar o teto de `quantidade`. Com
   * `false`, não recorta nada — devolve todas as candidatas (respeitando
   * `todasSeEspecificacao`, que também abre o teto). Default `true`.
   */
  aplicarLimite?: boolean;
  /**
   * Toggle A (`especificacao_mostra_todas`): quando o pedido casa um MODELO que
   * existe (ex.: "CB 300"), devolver TODAS as unidades que batem em vez de
   * recortar. O veredito "o modelo existe?" depende do catálogo casado — quem
   * decide é o chamador; aqui só se obedece.
   */
  todasSeEspecificacao?: boolean;
  /**
   * Hipóteses devolvidas pela IA (configurações de motos parecidas). Viram
   * FILTRO quando `filtrarPorComparacao` estiver ligado.
   */
  hipoteses?: readonly HipoteseDeMoto[];
  /**
   * Faixas/intervalos devolvidos pela IA (cc/preço/…). Viram FILTRO numérico.
   */
  faixas?: FaixasDoPedido;
  /**
   * Ligar o FILTRO por hipóteses/faixas (decisão do dono, 2026-09-26). Só as
   * colunas com valor/faxa filtram; colunas sem dado do cliente não filtram.
   * Se o filtro zerar, cai no comportamento de ranking (fallback garantido).
   */
  filtrarPorComparacao?: boolean;
  /** Tolerância (%) para casar número da hipótese × moto (cc/preço). Default 30. */
  toleranciaPct?: number;
  /**
   * C-090: interruptor "Enviar todas as motos que casam". Ligado = ignora o teto
   * N, não completa e não pagina — devolve TODAS as que casaram o filtro.
   */
  enviarTodasQueCasam?: boolean;
  /**
   * C-092 (decisão do dono, 2026-09-27): interruptor "Não completar quando
   * faltar". Ligado = quando o filtro casa MENOS que N, envia SÓ as que casam
   * (sem complemento). Ex.: N=8, casaram 4 → envia 4, não completa até 8.
   * Não afeta o modo "enviar todas que casam" (que já manda tudo que casou).
   */
  naoCompletarFaltando?: boolean;
  /**
   * C-096: coluna que o cliente ENFATIZOU (ex.: "preco" para "quero barata").
   * O motor prioriza por ela no casamento/ordenação. `null` = sem destaque.
   */
  principal?: string | null;
  /**
   * C-106: colunas que o cliente REQUER (por dedução inteligente). Quando há
   * alguma, o filtro é ESTRITO (a moto precisa casar TODAS). Faixas com limite
   * (ex.: `preco.max`) também entram como exigência, mesmo sem listagem aqui.
   * Vazio ⇒ comportamento genérico (OR pontuado), como antes.
   */
  exigidos?: readonly string[];
  /**
   * C-106 (interruptor do agente): LIGADO (default) = `exigidos` e faixas com
   * limite viram filtro ESTRITO (AND) e o preço ordena pelo teto. DESLIGADO =
   * ignora `exigidos`/teto e volta ao OR pontuado (comportamento antigo).
   */
  criteriosDinamicos?: boolean;
  /**
   * O cliente NOMEOU um modelo (ex.: "CB 250")? Quando true, o COMPLEMENTO (a
   * complementação até N, quando o filtro casa poucas) NÃO pode sair da LINHA do
   * modelo — não adianta qualquer moto da mesma marca. Sem isto, "CB 250" com
   * hipóteses só da Honda completava com qualquer Honda (ex.: XRE 190) — "só
   * separou Honda". A linha é o TOKEN compartilhado entre o nome da moto e o nome
   * das hipóteses.
   */
  nomeiaModelo?: boolean;
  /**
   * ESCOPO 9: motos que o cliente JÁ tem em FOCO na conversa (interesse). Com
   * elas + uma faixa numérica (ex.: "e tem alguma até 17 mil?"), a busca COMBINA:
   * interesse ∩ critério — as motos da família em foco que caibam na faixa vêm
   * primeiro; se o filtro esvaziar para o interesse, amplia para outros modelos
   * NO MESMO valor (`outrosNoValor`). A lista vazia desliga a combinação.
   */
  motoEmFoco?: readonly string[];
}

/** Tokens significativos (>=2 letras) do nome de uma moto, normalizados. */
function tokensDoNome(nome: string): Set<string> {
  return new Set(
    normalizarNomeDeMoto(nome)
      .split(' ')
      .filter((t) => t.length >= 2),
  );
}

/** A moto está na MESMA LINHA do modelo das hipóteses? (casamento por CONTEÚDO) */
function compartilhaLinhaDoModelo(
  nome: string,
  hipoteses: readonly HipoteseDeMoto[],
): boolean {
  // FURO CORRIGIDO (2026-10-11): a comparação usava QUALQUER token — e a CILINDRADA
  // ("250", "160") é um token. Então "YS Fazer 250" casava com QUALQUER "250"
  // (XMax 250, CBX 250 Twister) e essas motos alheias entravam na apresentação.
  // Tokens numéricos passaram a ser ignorados.
  // FURO CORRIGIDO (2026-10-17): mesmo ignorando o número, "linha" = QUALQUER token
  // significativo em comum era largo demais — "CB 300" casava com "CB 500 X"/"CB 650"
  // (token "cb") e a hipótese "CB 300 F Twister" casava com "CBX 250 Twister" (token
  // "twister"); um pedido ESPECÍFICO misturava a família inteira (medido ao vivo).
  // Agora a linha exige o NOME do modelo CONTIDO no outro (sem espaços), nos dois
  // sentidos — o mesmo critério da `notaDaJev`: "CB 300" só casa quem tem "cb300".
  const chave = normalizarNomeDeMoto(nome).replace(/\s+/g, '');
  if (chave === '') return false;
  for (const h of hipoteses) {
    if (typeof h.nome !== 'string' || h.nome.trim() === '') continue;
    const alvo = normalizarNomeDeMoto(h.nome).replace(/\s+/g, '');
    if (alvo !== '' && (chave.includes(alvo) || alvo.includes(chave))) return true;
  }
  return false;
}

/**
 * As hipóteses de MAIOR NOTA — o(s) modelo(s) que o cliente PEDIU. Quando o cliente
 * NOMEIA um modelo e ele existe no estoque, a 1ª oferta deve ser só as unidades
 * DESSE modelo; um IRMÃO da mesma família mas de designação diferente (ex.: pediu
 * "G 310 GS" e a moto é "G 310 R") recebe uma nota MENOR da Jev e fica de fora.
 * Sem notas (hipóteses antigas), devolve todas. Pura.
 */
export function hipotesesDeMaiorNota(
  hipoteses: readonly HipoteseDeMoto[],
  margem = 0.15,
): HipoteseDeMoto[] {
  const comNota = hipoteses.filter((h) => typeof h.score === 'number');
  if (comNota.length === 0) return [...hipoteses];
  const topo = Math.max(...comNota.map((h) => h.score as number));
  return hipoteses.filter((h) => typeof h.score === 'number' && h.score >= topo - margem);
}

export interface ResultadoSelecaoPorIntencao {
  motos: MotoDoCatalogo[];
  preferencias: Record<string, 'menor' | 'maior'>;
  criterios: Record<string, string | number>;
  /** Quantos candidatos o filtro por comparação manteve (0 = filtro ignorado). */
  filtrados: number;
  /** Sobrou moto parecida fora do corte? (o turno pergunta "quer ver mais?"). */
  temMaisOpcoes: boolean;
  /** Perfil interpretado pela IA (marcas/categorias) — para a fila de opções. */
  perfil: { marcas: string[]; categorias: string[] };
  /**
   * C-106: as motos que CASARAM (filtradas), na ordem de prioridade. O turno usa
   * para pôr as casadas-ainda-não-enviadas na frente da fila do "quer ver mais?".
   */
  casadas: MotoDoCatalogo[];
  /**
   * ESCOPO 9: as motos do INTERESSE (família/linha da moto em foco, segundo as
   * hipóteses da Jev) que caíram dentro do critério. Vazio quando não houve
   * combinação interesse ∩ critério, OU quando o filtro esvaziou para o interesse.
   */
  interesse: MotoDoCatalogo[];
  /**
   * ESCOPO 9: o filtro do interesse ESVAZIOU (ou sobrou menos que o pedido) e o
   * motor ampliou para OUTROS modelos no mesmo valor. O turno pergunta "quer ver
   * outros modelos nesse valor?".
   */
  outrosNoValor: boolean;
}

/** Perfil interpretado pela IA: marcas e categorias das hipóteses + faixas. */
export interface PerfilDaIA {
  marcas: Set<string>;
  categorias: Set<string>;
}

/** Extrai o perfil (marcas/categorias) das hipóteses e faixas da IA. */
export function perfilDaIA(
  hipoteses: readonly HipoteseDeMoto[],
  faixas: FaixasDoPedido,
): PerfilDaIA {
  const marcas = new Set<string>();
  const categorias = new Set<string>();
  for (const h of hipoteses) {
    for (const campo of ['marca'] as const) {
      const v = h[campo];
      if (typeof v === 'string' && v.trim() !== '') marcas.add(normalizarNomeDeMoto(v));
    }
    for (const campo of ['categoria', 'tipo'] as const) {
      const v = h[campo];
      if (typeof v === 'string' && v.trim() !== '') categorias.add(normalizarNomeDeMoto(v));
    }
  }
  // Faixas de marca/categoria (quando a IA devolve lista, ex.: {categoria:["Naked"]}).
  const faixaMarca = faixas.marca;
  if (Array.isArray(faixaMarca)) {
    for (const v of faixaMarca) if (typeof v === 'string' && v.trim() !== '') marcas.add(normalizarNomeDeMoto(v));
  }
  const faixaCat = faixas.categoria;
  if (Array.isArray(faixaCat)) {
    for (const v of faixaCat) if (typeof v === 'string' && v.trim() !== '') categorias.add(normalizarNomeDeMoto(v));
  }
  return { marcas, categorias };
}

/**
 * A moto casa o perfil da IA? Marca igual OU categoria contida (o catálogo traz
 * "Street, Naked" e a IA pode devolver "Naked"). Perfil vazio ⇒ true (sem
 * restrição — não exclui nada).
 */
export function casaPerfil(moto: MotoDoCatalogo, perfil: PerfilDaIA): boolean {
  if (perfil.marcas.size === 0 && perfil.categorias.size === 0) return true;
  const marca = normalizarNomeDeMoto(moto.valores?.marca ?? '');
  if (marca !== '' && perfil.marcas.has(marca)) return true;
  const categoria = normalizarNomeDeMoto(moto.valores?.categoria ?? moto.valores?.tipo ?? '');
  if (categoria !== '') {
    for (const c of perfil.categorias) {
      if (categoria.includes(c) || c.includes(categoria)) return true;
    }
  }
  return false;
}

/** A célula da moto numérica? (usa o mesmo critério do ranking). */
function valorNumerico(valor: string | undefined): number | null {
  if (valor === undefined || valor === '') return null;
  return numeroDaCelula(valor);
}

/** Sinônimos de categoria (o catálogo mistura PT/EN: "Trail" e "Trilha"). */
const SINONIMOS_CATEGORIA: Record<string, string> = {
  trilha: 'trail',
  trail: 'trail',
  adventure: 'trail',
  aventureiro: 'trail',
  scooter: 'scooter',
  street: 'street',
  rua: 'street',
  city: 'street',
  naked: 'naked',
  esportiva: 'esportiva',
  esportivas: 'esportiva',
  sport: 'esportiva',
  custom: 'custom',
};

/** Tokens significativos de uma categoria, com sinônimos e sem pontuação. */
function tokensCategoria(s: string): Set<string> {
  const base = s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !['com', 'off', 'road', 'para', 'and'].includes(t));
  return new Set(base.map((t) => SINONIMOS_CATEGORIA[t] ?? t));
}

/**
 * A CATEGORIA da moto casa o alvo? Por TOKEN + sinônimos — o catálogo é
 * inconsistente ("Adventure / Trilha" × "Trail, On-Off Road" × "Trail / On-Off
 * Road"). Basta UM token significativo em comum (trail ≡ trilha).
 */
function casaCategoria(celula: string, alvo: string): boolean {
  const a = tokensCategoria(celula);
  const b = tokensCategoria(alvo);
  if (a.size === 0 || b.size === 0) return false;
  for (const t of b) if (a.has(t)) return true;
  return false;
}

/**
 * C-096: a moto casa UMA coluna contra o alvo? Número → dentro de ±tolerância;
 * texto → contém (normalizado). Base da pontuação do OR.
 */
function casaColuna(moto: MotoDoCatalogo, coluna: string, alvo: string, toleranciaPct: number): boolean {
  const celula = moto.valores?.[coluna];
  if (celula === undefined || celula === '') return false;
  // CATEGORIA/TIPO/ESTILO: casamento por TOKEN + sinônimos (catálogo inconsistente).
  if (/categoria|tipo|estilo/i.test(coluna)) return casaCategoria(celula, alvo);
  const alvoNum = valorNumerico(alvo);
  const celulaNum = valorNumerico(celula);
  if (alvoNum !== null && celulaNum !== null) {
    // C-107: o ANO vale EXATO (não ±30% — 30% de 2024 seria 607 anos, o defeito
    // que aprovava o catálogo inteiro). Cilindrada/preço seguem com margem.
    if (detectarPapelColuna(coluna) === 'ano') return celulaNum === alvoNum;
    const margem = Math.max(1, (Math.abs(alvoNum) * toleranciaPct) / 100);
    return Math.abs(celulaNum - alvoNum) <= margem;
  }
  return normalizarNomeDeMoto(celula).includes(normalizarNomeDeMoto(alvo));
}

/**
 * C-106: a moto casa UMA coluna EXIGIDA? Faixa (com limite) tem prioridade;
 * senão, qualquer valor de hipótese para aquela coluna (número ±tolerância;
 * texto = contém). Sem nenhum dado da coluna em hipóteses/faixas, a coluna NÃO
 * restringe (true) — não se descarta por falta de dado.
 */
function casaColunaExigida(
  moto: MotoDoCatalogo,
  coluna: string,
  hipoteses: readonly HipoteseDeMoto[],
  faixas: FaixasDoPedido,
  toleranciaPct: number,
): boolean {
  const faixa = faixas[coluna];
  // Faixa de TEXTO (ex.: marca-alvo `["Honda"]`, dita pela Jev em "quero uma
  // Honda"): a célula tem que bater em UM dos valores. Vira filtro EXATO — sem
  // isto, a coluna marca casava a UNIÃO das marcas das hipóteses (Honda+Yamaha)
  // e não filtrava nada.
  if (Array.isArray(faixa)) {
    const alvos = faixa.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    if (alvos.length > 0) {
      return alvos.some((v) => casaColuna(moto, coluna, v, toleranciaPct));
    }
  }
  if (
    faixa !== null &&
    typeof faixa === 'object' &&
    (typeof (faixa as { min?: unknown }).min === 'number' ||
      typeof (faixa as { max?: unknown }).max === 'number')
  ) {
    return casaFaixaColuna(moto, coluna, faixa);
  }
  const valores = hipoteses
    .map((h) => h[coluna])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (valores.length === 0) return true;
  return valores.some((v) => casaColuna(moto, coluna, v, toleranciaPct));
}

/**
 * C-106: filtro ESTRITO — a moto só entra se casar TODAS as colunas exigidas
 * (o que o cliente deixou claro, incl. a marca deduzida do modelo, e as faixas
 * com limite). Lista vazia de exigidas ⇒ lista vazia (o chamador cai no genérico).
 */
export function filtrarPorExigencias(
  candidatos: readonly MotoDoCatalogo[],
  exigidos: readonly string[],
  hipoteses: readonly HipoteseDeMoto[],
  faixas: FaixasDoPedido,
  toleranciaPct: number,
): MotoDoCatalogo[] {
  if (exigidos.length === 0) return [];
  return candidatos.filter((moto) =>
    exigidos.every((coluna) => casaColunaExigida(moto, coluna, hipoteses, faixas, toleranciaPct)),
  );
}

/** A coluna numérica da moto está dentro da faixa {min,max}? */
function casaFaixaColuna(moto: MotoDoCatalogo, coluna: string, faixa: unknown): boolean {
  if (typeof faixa !== 'object' || faixa === null) return false;
  const f = faixa as { min?: unknown; max?: unknown };
  const celula = valorNumerico(moto.valores?.[coluna] ?? '');
  if (celula === null) return false;
  if (typeof f.min === 'number' && celula < f.min) return false;
  if (typeof f.max === 'number' && celula > f.max) return false;
  return typeof f.min === 'number' || typeof f.max === 'number';
}

/**
 * C-096: pontua uma moto contra hipóteses + faixas + coluna principal.
 *
 * REGRA DO DONO (2026-09-27): o casamento é OR — a moto entra se bater em PELO
 * MENOS UMA coluna, e sobe conforme bate em MAIS. NUNCA é descartada por uma
 * coluna que não bate. O `principal` (o que o cliente enfatizou) vale bônus alto.
 */
export function pontuarPorCriterios(
  moto: MotoDoCatalogo,
  hipoteses: readonly HipoteseDeMoto[],
  faixas: FaixasDoPedido,
  toleranciaPct: number,
  principal: string | null,
): { pontos: number; colunasCasadas: number } {
  let pontos = 0;
  const colunasOk = new Set<string>();
  // REGRA DO DONO (2026-10-06): PONTOS por atributo que o cliente pediu. Cada
  // atributo que a moto bate = 1 PONTO (ex.: "cb 250" → nome/família = 1 e
  // cilindrada = 1; entram TODAS as CB e TODAS as 250, de qualquer marca).
  // Numérico (cilindrada/ano/preço): bater PRÓXIMO (±tolerância) dá +0,5 e
  // bater EXATO dá +0,5 (exato = 1,5). A ORDEM de envio é a SOMA dos pontos.
  const pontosDaColuna = (coluna: string, alvo: string): void => {
    if (colunasOk.has(coluna)) return;
    colunasOk.add(coluna);
    pontos += 1;
    const alvoNum = valorNumerico(alvo);
    const motoNum = valorNumerico(moto.valores?.[coluna] ?? '');
    if (alvoNum !== null && motoNum !== null && alvoNum > 0) {
      const margem = Math.max(1, (Math.abs(alvoNum) * toleranciaPct) / 100);
      if (Math.abs(motoNum - alvoNum) <= margem) pontos += 0.5;
    }
  };
  for (const hip of hipoteses) {
    for (const [coluna, alvo] of Object.entries(hip)) {
      if (typeof alvo !== 'string' || alvo.trim() === '') continue;
      if (casaColuna(moto, coluna, alvo, toleranciaPct)) pontosDaColuna(coluna, alvo);
    }
  }
  for (const [coluna, faixa] of Object.entries(faixas)) {
    if (casaFaixaColuna(moto, coluna, faixa) && !colunasOk.has(coluna)) {
      colunasOk.add(coluna);
      pontos += 1;
    }
  }
  // O que o cliente ENFATIZOU vale um empurrãozinho (meio ponto) na ordem.
  if (principal !== null && colunasOk.has(principal)) pontos += 0.5;
  return { pontos, colunasCasadas: colunasOk.size };
}

/**
 * FILTRA/PONTUA os candidatos por hipóteses/faixas (decisão do dono, 2026-09-27):
 * OR pontuado. Devolve as motos com pontos > 0, da MAIOR pontuação para a menor.
 * Quem não casa nada NÃO entra. Lista vazia = filtro ignorado (o chamador cai no
 * ranking) — nunca zera a resposta forçadamente.
 */
/** A NOTA da JEV (0–1) para uma candidata: a maior entre as hipóteses cujo NOME casa. */
function notaDaJev(moto: MotoDoCatalogo, hipoteses: readonly HipoteseDeMoto[]): number {
  const nome = normalizarNomeDeMoto(moto.nome);
  let nota = 0;
  for (const h of hipoteses) {
    if (typeof h.score !== 'number') continue;
    const alvo = normalizarNomeDeMoto(typeof h.nome === 'string' ? h.nome : '');
    if (alvo !== '' && (nome === alvo || nome.includes(alvo) || alvo.includes(nome))) {
      nota = Math.max(nota, h.score);
    }
  }
  return nota;
}

/** A cilindrada (cc) da moto, se houver coluna de cilindrada no mapeamento. */
function cilindradaDaMoto(moto: MotoDoCatalogo): number | null {
  for (const [coluna, valor] of Object.entries(moto.valores ?? {})) {
    if (typeof valor !== 'string') continue;
    if (detectarPapelColuna(coluna) !== 'cilindrada') continue;
    const n = numeroDaCelula(valor);
    if (n !== null) return n;
  }
  return null;
}

/** Números plausíveis de cilindrada citados na mensagem (ex.: "cb 250" → [250]). */
function ccsDoTermo(termo: string): number[] {
  const nums = termo.match(/\d{2,4}/g) ?? [];
  return [...new Set(nums.map(Number))].filter((n) => n >= 50 && n <= 2000);
}

/**
 * A candidata está FORA do pedido? (o cliente citou um MODELO e/ou uma
 * CILINDRADA e a moto não casa NENHUM dos dois). Sem modelo/cc no pedido, nunca
 * está fora. É a base do FREIO determinístico (dono, 2026-10-06).
 */
function foraDoPedido(moto: MotoDoCatalogo, termo: string): boolean {
  if (termo.trim() === '') return false;
  const tokensPedido = tokensDoNome(termo);
  const modelos = [...tokensPedido].filter((t) => TOKENS_DE_MODELO.has(t));
  const ccs = ccsDoTermo(termo);
  if (modelos.length === 0 && ccs.length === 0) return false;
  const tokensMoto = tokensDoNome(moto.nome);
  const casaModelo = modelos.some((t) => tokensMoto.has(t));
  const ccMoto = cilindradaDaMoto(moto);
  const casaCc = ccMoto !== null && ccs.some((cc) => Math.abs(ccMoto - cc) / cc <= 0.3);
  return !casaModelo && !casaCc;
}

/**
 * FREIO determinístico da nota da Jev: a Jev escorrega (ex.: "cb 250" → Dominar
 * 400 nota 0,81). Quem está FORA do pedido tem a nota limitada a 0,2.
 */
function freioDaNota(moto: MotoDoCatalogo, termo: string, nota: number): number {
  return foraDoPedido(moto, termo) ? Math.min(nota, 0.2) : nota;
}

/** Tokens que identificam um MODELO/LINHA de moto (não marca nem categoria). */
const TOKENS_DE_MODELO = new Set([
  'cb', 'cbx', 'cg', 'biz', 'titan', 'fan', 'factor', 'fazer', 'fz', 'xre',
  'xtz', 'crosser', 'dominar', 'vstrom', 'boulevard', 'xmax', 'neo', 'nmax',
  'twister', 'tener', 'bros', 'pcx', 'pop', 'adv',
]);

/**
 * O NÚMERO que o cliente pediu, para a coluna que a Jev marcou como `principal`.
 * "quero uma 250" → cilindrada 250; "até 17 mil" → preço 17000; "de 2024" → 2024.
 */
function alvoNumericoDaColuna(termo: string, coluna: string): number | null {
  const papel = detectarPapelColuna(coluna);
  if (papel === 'preco') return extrairPrecoDoPedido(termo);
  if (papel === 'ano') {
    const m = termo.match(/\b(19|20)\d{2}\b/);
    return m ? Number(m[0]) : null;
  }
  return extrairCilindrada(termo);
}

export function filtrarPorHipoteses(
  candidatos: readonly MotoDoCatalogo[],
  hipoteses: readonly HipoteseDeMoto[],
  faixas: FaixasDoPedido,
  toleranciaPct: number,
  principal: string | null = null,
  termo = '',
): MotoDoCatalogo[] {
  const temHipoteses = hipoteses.some((h) =>
    Object.values(h).some((v) => typeof v === 'string' && v.trim() !== ''),
  );
  const temFaixas = Object.keys(faixas).length > 0;
  if (!temHipoteses && !temFaixas) return [];
  // ORDEM NUMÉRICA (dono, 2026-10-15): quando o cliente pediu um NÚMERO e a Jev
  // marcou a coluna principal (ex.: cilindrada em "quero uma 250"), as motos mais
  // PRÓXIMAS do número vêm primeiro — a EXATA antes da aproximada. A Jev diz QUAL
  // coluna importa (`principal`); o motor ORDENA por proximidade a ela. Vale para
  // qualquer coluna numérica (cilindrada, preço, ano, potência).
  const alvo = principal !== null ? alvoNumericoDaColuna(termo, principal) : null;
  const dist = (m: MotoDoCatalogo): number => {
    if (principal === null || alvo === null) return 0;
    const v = numeroDaCelula(m.valores?.[principal] ?? '');
    return v === null ? Number.MAX_SAFE_INTEGER : Math.abs(v - alvo);
  };
  const avaliados = candidatos
    .map((moto, i) => ({
      moto,
      i,
      ...pontuarPorCriterios(moto, hipoteses, faixas, toleranciaPct, principal),
      // A nota da Jev passa pelo FREIO determinístico (quem não casa modelo/cc do
      // pedido não pode ir na frente) e o maior entre nota e pontos ordena.
      nota: Math.max(freioDaNota(moto, termo, notaDaJev(moto, hipoteses)), 0),
      fora: foraDoPedido(moto, termo),
    }))
    .filter((x) => x.pontos > 0 || x.nota > 0);
  // FREIO: se o cliente citou modelo/cc, as candidatas FORA do pedido (ex.:
  // "cb 250" → Dominar 400) NÃO entram quando há opções que casam — só aparecem
  // se NENHUMA casar (aí é a melhor alternativa que temos). Dono, 2026-10-06.
  const dentro = avaliados.filter((x) => !x.fora);
  const usar = dentro.length > 0 ? dentro : avaliados;
  return usar
    // ORDEM: primeiro a PROXIMIDADE ao número pedido (quando há principal
    // numérico); depois a NOTA da Jev (ela assimila o conjunto, sem cor); os
    // pontos determinísticos desempatam.
    .sort(
      (a, b) =>
        dist(a.moto) - dist(b.moto) || b.nota - a.nota || b.pontos - a.pontos || a.i - b.i,
    )
    .map((x) => x.moto);
}

/**
 * Aplica a intenção sobre os candidatos e devolve as motos escolhidas (até N).
 * Nunca lança; lista vazia de candidatos ⇒ lista vazia.
 */
export function selecionarPorIntencao(
  input: EntradaSelecaoPorIntencao,
): ResultadoSelecaoPorIntencao {
  const preferencias: Record<string, 'menor' | 'maior'> = {};
  const criterios: Record<string, string | number> = {};
  for (const [coluna, valor] of Object.entries(input.criterios)) {
    const v = String(valor).toLowerCase();
    if (v === 'menor' || v === 'maior') preferencias[coluna] = v;
    else criterios[coluna] = valor;
  }

  const colunasComparacao = colunasDeComparacao(input.mapeamento);
  const alternativo = input.intencao === 'alternativa' && input.motoAtual !== null;

  let candidatos = input.candidatos;
  if (alternativo) {
    const atual = input.motoAtual!;
    for (const coluna of colunasComparacao) {
      // A coluna de preferência NÃO entra na âncora: ela já ordena por "menor/
      // maior". Se entrasse, viraria critério de distância até o valor da atual
      // e a preferência (ex.: mais barata) seria diluída.
      if (preferencias[coluna] !== undefined) continue;
      const v = atual.valores?.[coluna];
      if (v !== undefined && v !== '' && criterios[coluna] === undefined) criterios[coluna] = v;
    }
    // Remove a PRÓPRIA moto atual. Compara pela BASE (`valores.nome`) e não pelo
    // nome composto: a mesma moto pode chegar com nome composto diferente
    // (ex.: a referência veio de uma consulta que omitiu colunas → "Biz 125
    // 2021", e o catálogo traz "HONDA Biz 125 FLEX 2021"). Pela base, casa.
    const chaveAtual = normalizarNomeDeMoto(atual.valores?.nome ?? atual.nome);
    candidatos = candidatos.filter(
      (m) => normalizarNomeDeMoto(m.valores?.nome ?? m.nome) !== chaveAtual,
    );
    // A PREFERÊNCIA numérica vira FILTRO relativo à moto atual (plano §4:
    // `preco < atual`): "Achei caro" só pode oferecer o que é MAIS BARATO que a
    // atual. Sem o filtro a preferência era só desempate e a resposta ainda
    // trazia motos mais caras (medido ao vivo). Sem ninguém do lado pedido, NÃO
    // filtra — melhor oferecer parecidas do que nada.
    for (const [coluna, pref] of Object.entries(preferencias)) {
      const alvo = numeroDaCelula(atual.valores?.[coluna] ?? '');
      if (alvo === null) continue;
      const filtrados = candidatos.filter((m) => {
        const v = numeroDaCelula(m.valores?.[coluna] ?? '');
        return v !== null && (pref === 'menor' ? v < alvo : v > alvo);
      });
      if (filtrados.length > 0) candidatos = filtrados;
    }
    // Critério "DIFERENTE" (ex.: `{cor:"outra"}`, "outro modelo", "diferente") →
    // FILTRA as motos cujo valor naquela coluna é diferente do da atual. É o
    // caso "quero outra cor": o modelo devolve "outra" e o motor exclui as de
    // mesma cor. Vira filtro, não critério de semelhança.
    for (const [coluna, valor] of Object.entries(criterios)) {
      if (!TOKENS_DIFERENTE.has(String(valor).toLowerCase())) continue;
      const alvo = normalizarNomeDeMoto(atual.valores?.[coluna] ?? '');
      if (alvo === '') continue;
      const filtrados = candidatos.filter((m) => {
        const v = normalizarNomeDeMoto(m.valores?.[coluna] ?? '');
        return v !== '' && v !== alvo;
      });
      if (filtrados.length > 0) candidatos = filtrados;
      delete criterios[coluna];
    }
  }

  // FILTRO por hipóteses/faixas da IA (só no PEDIDO; no modo alternativa a âncora
  // é a moto atual). As motos que passam ganham PRIORIDADE; se derem menos que N,
  // o motor COMPLETA com as mais próximas (nunca responde vazio, nunca manda o
  // catálogo inteiro). É a regra do dono: modelo inexistente → N alternativas.
  let filtrados = 0;
  let preferidos: Set<MotoDoCatalogo> | null = null;
  const perfil = perfilDaIA(input.hipoteses ?? [], input.faixas ?? {});
  // C-106: colunas OBRIGATÓRIAS = as que o cliente exigiu + as que têm faixa com
  // limite (ex.: "até 20 mil"). Havendo alguma, o filtro é ESTRITO (AND); senão,
  // genérico (OR pontuado). Tolerância única para o casamento numérico.
  const tolerancia = input.toleranciaPct ?? 30;
  // C-106: com o interruptor DESLIGADO, `exigidos` e faixas não obrigam nada —
  // volta ao OR pontuado (comportamento antigo).
  const criteriosDinamicos = input.criteriosDinamicos !== false;
  const faixasComLimite = !criteriosDinamicos
    ? []
    : Object.entries(input.faixas ?? {})
        .filter(([, f]) => {
          const o = f as { min?: unknown; max?: unknown } | null;
          return (
            o !== null &&
            typeof o === 'object' &&
            (typeof o.min === 'number' || typeof o.max === 'number')
          );
        })
        .map(([coluna]) => coluna);
  // Atributos de PEDIDO — nome/modelo/versão, cilindrada, ANO e potência — NÃO
  // viram FILTRO rígido: PONTUAM (o que mais encaixa vem primeiro). Só o que o
  // cliente pediu EXPLÍCITO e À PARTE (cor, marca, faixa de PREÇO) continua
  // filtrando. Antes, "CB 250" virava exigência de cilindrada → faixa ±30%
  // (113–325!) e os Honda CB 300 — os mais parecidos — ficavam de fora. Idem o
  // ANO: "CB 2025" (sem 2025 no estoque) virava filtro de ano EXATO → zerava e o
  // motor caía no fallback trazendo motos nada a ver (dono, 2026-10-06).
  const ehAtributoDePedido = (c: string): boolean =>
    c === 'nome' ||
    detectarPapelColuna(c) === 'cilindrada' ||
    detectarPapelColuna(c) === 'ano' ||
    /potenci|cavalos|\bcv\b|\bhp\b/i.test(c);
  const exigencias = !criteriosDinamicos
    ? []
    : [...new Set([...(input.exigidos ?? []), ...faixasComLimite])].filter(
        (c) => !ehAtributoDePedido(c),
      );
  // ESCOPO 9: só combina quando há um critério NUMÉRICO (faixa com limite) — o
  // caso "e tem alguma até 17 mil". Sem ele, o turno NÃO é um refino e a busca
  // segue o comportamento anterior (nada de perguntar "outros nesse valor" à toa).
  const temFaixaNumerica = faixasComLimite.length > 0;
  const temFaixaDePreco = faixasComLimite.some((c) => detectarPapelColuna(c) === 'preco');
  let casadas: MotoDoCatalogo[] = [];
  // ESCOPO 9: as motos do INTERESSE (família da moto em foco, pelas hipóteses da
  // Jev) que caíram dentro do critério. `combinouInteresse` = houve REFINO
  // (moto em foco + faixa) e a Jev ancorou as hipóteses na família.
  let interesse: MotoDoCatalogo[] = [];
  let combinouInteresse = false;
  // `estrito` = havia exigência E ela casou algo. Diferente de "caiu no genérico
  // porque o estrito zerou" — só no primeiro não se completa com perfil alheio.
  let estrito = false;
  // LIGAÇÃO: o filtro que a JEV separou (`exigencias`) SEMPRE roda — inclusive no
  // modo alternativa, quando há exigência explícita (ex.: categoria da referência
  // para um modelo que não temos). Antes, `!alternativo` descartava o filtro e a
  // categoria virava filtro morto. Sem exigência, a alternativa segue no modo
  // âncora (comportamento antigo: objeção "achei caro"/"outra cor").
  if (
    input.filtrarPorComparacao === true &&
    (exigencias.length > 0 || !alternativo) &&
    (exigencias.length > 0 ||
      (input.hipoteses?.length ?? 0) > 0 ||
      Object.keys(input.faixas ?? {}).length > 0)
  ) {
    if (exigencias.length > 0) {
      casadas = filtrarPorExigencias(
        candidatos,
        exigencias,
        input.hipoteses ?? [],
        input.faixas ?? {},
        tolerancia,
      );
      estrito = casadas.length > 0;
    }
    // Estrito zerou (ou não havia exigência): o motor PONTUA e ORDENA por
    // semelhança. OR pontuado (dono, 2026-10-06): cada atributo que o cliente
    // pediu vale 1 ponto (numérico próximo +0,5; exato +0,5); a ordem é a SOMA.
    if (casadas.length === 0) {
      casadas = filtrarPorHipoteses(
        candidatos,
        input.hipoteses ?? [],
        input.faixas ?? {},
        tolerancia,
        input.principal ?? null,
        input.termoBase,
      );
    }
    // P1 (dono, 2026-10-17): pedido ESPECÍFICO de um MODELO (`nomeiaModelo`) que
    // NÃO caiu no filtro ESTRITO não pode espalhar para a FAMÍLIA/marca. O OR
    // pontuado casa por atributo (marca/categoria/cilindrada) e trazia "CBX 250
    // Twister"/"CB 500 X" num pedido de "CB 300" (medido ao vivo). Essa lista
    // `casadas` também é a FILA do "ver mais" (inbound-turn), então o vazamento ia
    // longe. Restringe à LINHA das hipóteses da JEV (o MODELO, não a família).
    // Sem linha reconhecível (ex.: hipóteses só de marca/categoria), mantém.
    if (input.nomeiaModelo === true && !estrito && casadas.length > 0) {
      const naLinhaDoModelo = casadas.filter((m) =>
        compartilhaLinhaDoModelo(m.nome, input.hipoteses ?? []),
      );
      if (naLinhaDoModelo.length > 0) casadas = naLinhaDoModelo;
    }
    if (casadas.length > 0) {
      // ESCOPO 9 — REFINO (interesse ∩ critério): com moto(s) em FOCO e hipóteses
      // da JEV com NOTA (ela ancorou a família), a busca COMBINA. O INTERESSE são
      // as casadas que a Jev reconheceu parecidas com a moto em foco.
      const hipoteses = input.hipoteses ?? [];
      if (
        temFaixaNumerica &&
        (input.motoEmFoco?.length ?? 0) > 0 &&
        hipoteses.some((h) => typeof h.score === 'number')
      ) {
        combinouInteresse = true;
        interesse = casadas.filter((m) => notaDaJev(m, hipoteses) > 0);
      }
      // Cliente nomeou um modelo: o conjunto PREFERIDO também fica na LINHA do
      // modelo. Sem isto, o casamento por MARCA (comum a toda a hipótese Honda)
      // traz outra linha (ex.: XRE) já pelos PONTOS — não só pelo complemento.
      // ESCOPO 9: no REFINO, o PREFERIDO é o INTERESSE (a família em foco); se
      // ele esvaziou, ficam as casadas (outros modelos NO VALOR — o "plano B").
      const naLinha =
        input.nomeiaModelo === true
          ? casadas.filter((m) => compartilhaLinhaDoModelo(m.nome, hipoteses))
          : casadas;
      const preferidas =
        interesse.length > 0 ? interesse : naLinha.length > 0 ? naLinha : casadas;
      preferidos = new Set(preferidas);
      filtrados = preferidas.length;
    }
  }
  const extras = Object.values(criterios)
    .map(String)
    .filter((s) => s.trim() !== '')
    .join(' ');
  const termoFinal = extras !== '' ? `${input.termoBase} ${extras}` : input.termoBase;

  const criteriosColunas = colunasComparacao.filter((c) => preferencias[c] === undefined);
  // C-096: o atributo PRINCIPAL (o que o cliente enfatizou) vira a 1ª coluna de
  // ordenação; as demais seguem a ordem configurada. Sem principal, igual a hoje.
  const principal = input.principal ?? null;
  const colunasRanking =
    principal !== null && principal !== ''
      ? [principal, ...criteriosColunas.filter((c) => c !== principal)]
      : criteriosColunas;
  // C-106: no modo ESTRITO com teto de preço ("até X"), o preço é o 1º critério
  // de ordem — as motos mais PRÓXIMAS do teto primeiro (decrescente até o limite),
  // como pediu o dono. "barata" sem valor não chega aqui (o turno pergunta antes).
  const colunasRankingFinal =
    !alternativo && faixasComLimite.includes('preco')
      ? ['preco', ...colunasRanking.filter((c) => c !== 'preco')]
      : colunasRanking;

  // Teto: `todasSeEspecificacao` (modelo existe) OU `aplicarLimite: false`
  // (toggle B desligado) abrem o teto e devolvem TODAS as candidatas. C-090: o
  // interruptor "enviar todas que casam" também abre o teto — manda tudo que casou.
  const semTeto =
    input.todasSeEspecificacao === true ||
    input.aplicarLimite === false ||
    (input.enviarTodasQueCasam === true && preferidos !== null);
  const quantidade = semTeto
    ? Math.max(candidatos.length, 1)
    : Math.max(1, input.quantidade ?? input.mapeamento.similaresQtd ?? 3);
  const basePreferida =
    preferidos !== null ? candidatos.filter((m) => preferidos!.has(m)) : candidatos;
  const quantidadeBase = semTeto ? Math.max(basePreferida.length, 1) : quantidade;
  let motos = escolherComReferencia(termoFinal, basePreferida, {
    quantidade: quantidadeBase,
    criteriosColunas: colunasRankingFinal,
    // No modo ALTERNATIVA a reserva por `moto_similar` NÃO se aplica: o cliente
    // não está pedindo uma moto pelo nome, e casar o termo (que inclui a objeção
    // e a âncora) contra as referências traria "reservas" espúrias (medido ao
    // vivo: "Achei caro" na Biz 125 reservou quase o catálogo, com a BMW G 310
    // em 2º). A reserva continua valendo para o PEDIDO de um modelo.
    colunaSimilares: alternativo ? null : colunaDeSimilares(input.mapeamento),
    ...(Object.keys(preferencias).length > 0 ? { preferencias } : {}),
  });
  // ORDEM POR SEMELHANÇA (dono, 2026-10-06): `casadas` já vem da MAIOR pontuação
  // para a menor (OR pontuado). Preserva essa ordem — o re-rank por colunas do
  // catálogo a perdia (quem tem mais atributos iguais tem que vir primeiro).
  if (casadas.length > 0 && !estrito) {
    const naLinha =
      input.nomeiaModelo === true
        ? casadas.filter((m) => compartilhaLinhaDoModelo(m.nome, input.hipoteses ?? []))
        : casadas;
    motos = (naLinha.length > 0 ? naLinha : casadas).slice(0, quantidade);
  }
  // COMPLETA até N SOMENTE com o MESMO PERFIL (decisão do dono, 2026-09-26):
  // mesma marca OU categoria das hipóteses/faixas. NÃO completa com perfil alheio
  // (era o defeito: "CB 250" trazia XMax/scooter/BMW). Se casou menos que N e não
  // há mais motos do perfil, o envio fica com as que casam — e o turno PERGUNTA
  // se o cliente quer ver as demais (temMaisOpcoes). C-090: o modo "enviar todas
  // que casam" NÃO completa (já mandou tudo que casou). C-092: o interruptor
  // `naoCompletarFaltando` desliga o complemento — envia só as que casam.
  if (
    preferidos !== null &&
    !semTeto &&
    // C-106: no modo ESTRITO não se completa com perfil alheio — as casadas são
    // a resposta; o resto das CASADAS vai para a fila do "quer ver mais?".
    !estrito &&
    input.naoCompletarFaltando !== true &&
    motos.length < quantidade
  ) {
    const jaTem = new Set(motos);
    const complemento = candidatos
      .filter((m) => !jaTem.has(m))
      .filter((m) => casaPerfil(m, perfil))
      // Cliente nomeou um modelo → o complemento fica na MESMA linha (token do
      // nome), não em qualquer moto da mesma marca. "CB 250" → só CB, não XRE.
      .filter(
        (m) =>
          input.nomeiaModelo !== true ||
          compartilhaLinhaDoModelo(m.nome, input.hipoteses ?? []),
      );
    if (complemento.length > 0) {
      const resto = escolherComReferencia(termoFinal, complemento, {
        quantidade: quantidade - motos.length,
        criteriosColunas: colunasRankingFinal,
        colunaSimilares: colunaDeSimilares(input.mapeamento),
        ...(Object.keys(preferencias).length > 0 ? { preferencias } : {}),
      });
      motos.push(...resto);
    }
  }
  // Sobrou moto parecida fora do corte? O turno usa isto para perguntar ao cliente
  // se quer ver mais opções (regra do dono, 2026-09-26). C-106: no modo estrito, o
  // "mais opções" são as CASADAS que não couberam na página.
  const temMaisOpcoes =
    preferidos !== null &&
    !semTeto &&
    (estrito ? casadas.length > motos.length : candidatos.length > motos.length);
  // ESCOPO 9: o REFINO casou MENOS que o pedido (ou ZEROU) no interesse — o motor
  // amplia/assinala "outros modelos NESSE VALOR" e o turno PERGUNTA isso. Não é
  // "mais opções" genérico: é o convite para ver outras linhas dentro do critério.
  const outrosNoValor =
    combinouInteresse && temFaixaDePreco && !semTeto && interesse.length < quantidade;
  return {
    motos,
    preferencias,
    criterios,
    filtrados,
    temMaisOpcoes,
    perfil: { marcas: [...perfil.marcas], categorias: [...perfil.categorias] },
    casadas,
    interesse,
    outrosNoValor,
  };
}

/**
 * PRÉ-FILTRO determinístico: a mensagem sugere que o cliente quer algo DIFERENTE
 * da moto atual (ou reclamou do preço/condições)? Evita acionar a classificação e
 * a consulta ao banco externo em TODO turno (ex.: "obrigado", "ok", "vou
 * financiar") — o dono pediu que o motor só consulte quando houver necessidade.
 *
 * A classificação fina continua sendo da IA; isto apenas decide se vale
 * perguntar. Falso-negativo aqui só significa "não busca sozinho" (cai no
 * comportamento atual); falso-positivo custa uma classificação barata.
 */
export function querAlternativa(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  // `car[oa]` cobre "caro" e "cara" (moto feminina: "essa está cara").
  // `outr[ao]s?` só conta quando NÃO se refere a "outra loja/dia/cidade/forma…",
  // que NÃO é querer outra moto (falso-positivo medido ao vivo 2026-09-30).
  return /\b(car[oa]|barat\w*|desconto|preco|mais nova|mais novo|outr[ao]s?\b(?!\s+(?:loja|lojas|lugar|cidade|pessoa|vendedor|vendedora|atendente|consultor|dia|dias|semana|mes|horario|hora|forma|maneira|coisa|coisas|pagamento|parcela|condicao|condicoes|momento|vez|motivo|razao|duvida|pergunta|informacao|informacoes)\b)|mud(ei|ar|ou|ando)|diferente|troc\w*|mais opcoes|outras motos|ver mais|alternativa|parecid\w*|semelhant\w*)\b/.test(
    n,
  );
}

/**
 * C-089: o cliente pediu para ver MAIS opções do que já foi oferecido?
 * ("quero ver mais", "tem mais opções?", "mostra as outras"). Diferente de
 * `querAlternativa` (que é "quero algo diferente"): aqui o motor CONTINUA a
 * fila de opções pendentes do pedido atual, sem repetir e sem reclassificar.
 */
export function querMaisOpcoes(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  return /\b(mais opcoes|mais motos|outras opcoes|outras motos|ver mais|mostra mais|tem mais|quais outras|as demais|as outras|mais alternativas|mais alguma|mais alguma opcao|restantes)\b/.test(
    n,
  );
}

/**
 * C-097: o cliente está PEDINDO/QUERENDO uma moto? (para o extrator rodar SEMPRE
 * que houver pedido — antes só rodava quando o modelo já tinha consultado o
 * catálogo e não casado, o que deixava pedidos no 1º turno sem classificação).
 *
 * Conservador de propósito: exige um TERMO de moto/produto OU um VERBO de
 * pedido. Acenos ("ok", "obrigado", "bom dia") não disparam.
 */
/**
 * C-100: o cliente pede por PREÇO/valor SEM citar um número? (ex.: "qual o preço?",
 * "quanto custa?", "tá caro"). Nesse caso o motor INSTRUI a IA a perguntar/confirmar
 * a faixa, em vez de inventar.
 */
export function pedePrecoSemValor(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  const falaDePreco = /\b(preco|valor|quanto custa|quanto fica|orcamento|faixa de preco|barat\w*|caro|custa)\b/.test(n);
  if (!falaDePreco) return false;
  const temNumero = /\b\d{3,}\b|\bmil\b|\bk\b/.test(n);
  return !temNumero;
}

/** Verbo de pedido/interesse explícito — sozinho NÃO é pedido de moto. */
const VERBO_DE_PEDIDO =
  /\b(quero|queria|quer|procur\w*|preciso|busc\w*|buscar|tem|tens|teria|mostr\w*|ver|ve|gostaria|interess\w*|indic\w*|suger\w*|opcoes|opcao|disponivel|disponiveis|comprar|adquirir)\b/;

/**
 * Termo de moto presente na mensagem (produto, "modelo(s)", categoria de moto,
 * marca, modelo). NÃO inclui os qualificadores GENÉRICOS/ambíguos `categoria`,
 * `cc` e `cilindrada`: eles casavam texto que NÃO é pedido de moto — medido ao
 * vivo (2026-10-13), "Tenho sim, CNH **categoria** A" forçava a oferta de catálogo
 * (`cliente_citou_modelo`). A categoria de moto continua valendo pelos nomes
 * concretos (naked/street/trail/…) e a cilindrada pelo "moto"/modelo que a acompanha.
 */
const TERMO_DE_MOTO =
  /\b(moto|motos|modelo|modelos|naked|street|scooter|trail|adventure|trilha|sport|esportiv\w*|custom|roadster|touring|seminova\w*|honda|yamaha|suzuki|bajaj|bmw|kawasaki|royal|enfield|biz|factor|titan|fan|cg|cb|cbx|xre|xtz|crosser|fazer|dominar|v-?strom|boulevard|xmax|neo|twister|tener\w*|lander|himalayan|tornado|bros|pcx|nmax|adv|elite|burgman|intruder|shineray|haojue|dafra|mottu|urban|mma)\b/;

/**
 * A mensagem CITA/CONSULTA uma moto (termo concreto: marca, modelo, categoria…)?
 *
 * Diferente de `querMoto`: "quero financiar" tem verbo de pedido mas NENHUM termo
 * de moto — é pedido de PROCESSO, não de catálogo. Este é o sinal que a trava
 * `turnoEhDeCatalogo` usa para não despejar motos em pedido de financiamento.
 */
export function mencionaMoto(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  return TERMO_DE_MOTO.test(n);
}

export function querMoto(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  return VERBO_DE_PEDIDO.test(n) || TERMO_DE_MOTO.test(n);
}

/**
 * PEDIDO EXPLÍCITO de moto: VERBO de pedido + TERMO de moto ("quero uma moto até
 * 20 mil", "tem uma CB 300?"). Diferente de `querMoto`, que também casa MENÇÃO
 * SOLTA ao termo ("essa moto é boa?"). É este sinal que VENCE a trava de escolha
 * (`escolha_travada`), como decidiu o dono (2026-09-30): pedido claro do cliente
 * substitui a moto que estava escolhida.
 */
export function pedeMotoExplicito(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  return VERBO_DE_PEDIDO.test(n) && TERMO_DE_MOTO.test(n);
}
