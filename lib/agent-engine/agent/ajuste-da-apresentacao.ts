/**
 * AJUSTES DETERMINÍSTICOS DA APRESENTAÇÃO — o motor EXECUTA o que a JEV decidiu.
 *
 * Dois casos medidos ao vivo (2026-10-25) que a decisão da JEV já cobria, mas a
 * seleção não executava:
 *
 *   1. "Achei um pouco salgada. Tem alguma opção parecida mais em conta?" — a
 *      JEV liberou a oferta com `criterio: preco`, e a apresentação trouxe
 *      V-Strom/R 1200 GS/CB 650 (TODAS acima da NMax). Atacar preço é mostrar o
 *      que é MAIS EM CONTA que a moto em foco — nunca o que é mais caro.
 *
 *   2. "Vocês têm as duas pra eu comparar?" — o texto dizia "aqui vão as duas"
 *      e só uma foto saía. Comparação explícita inclui a OUTRA moto já vista.
 *
 * Puro (sem banco/rede): o motor só filtra/ordena/renderiza. A decisão de
 * OFERECER continua sendo da JEV; aqui não se decide se mostra, só COMO.
 */
import {
  normalizarNomeDeMoto,
  type MotoDoCatalogo,
} from './fotos-do-catalogo';
import { parsePreco } from './similaridade';

function precoDaMoto(m: MotoDoCatalogo): number | null {
  return parsePreco(String(m.preco ?? m.valores?.preco ?? ''));
}

/** O cliente pediu explicitamente algo MAIS EM CONTA (e a JEV atacou preço)? */
export function pedeMaisEmConta(
  mensagem: string,
  criterio: string | null | undefined,
): boolean {
  if (criterio !== 'preco') return false;
  return /\b(mais (em conta|barat\w*)|salgad\w*|car[oa]\b|desconto)\b/.test(
    normalizarNomeDeMoto(mensagem),
  );
}

/**
 * As MAIS BARATAS do perfil, abaixo da referência (moto em foco/escolhida),
 * em ordem crescente. Sem referência de preço, ordena só por preço.
 * Devolve `[]` quando nenhuma é mais em conta — o chamador mantém a seleção.
 */
export function filtrarMaisEmConta(
  motos: readonly MotoDoCatalogo[],
  casadas: readonly MotoDoCatalogo[],
  referencia: MotoDoCatalogo | null,
  limite: number,
  /**
   * Pool EXTRA de onde tirar as mais baratas (o catálogo filtrado do turno).
   * Medido 2026-10-25: a seleção da JEV trouxe só as premium (V-Strom/R 1200
   * GS/CB 650) e as mais baratas do estoque nem entravam na reordenação.
   */
  extras: readonly MotoDoCatalogo[] = [],
): MotoDoCatalogo[] {
  const precoRef = referencia !== null ? precoDaMoto(referencia) : null;
  const vistos = new Set<string>();
  return [...motos, ...casadas, ...extras]
    .filter((m) => {
      if (vistos.has(m.nome)) return false;
      vistos.add(m.nome);
      return true;
    })
    .map((m) => ({ m, p: precoDaMoto(m) }))
    .filter(
      (x): x is { m: MotoDoCatalogo; p: number } =>
        x.p !== null && (precoRef === null || x.p < precoRef),
    )
    .sort((a, b) => a.p - b.p)
    .slice(0, Math.max(limite, 1))
    .map((x) => x.m);
}

/** O cliente pediu para COMPARAR as motos já vistas ("as duas", "comparar")? */
export function pedeComparacao(mensagem: string): boolean {
  return /\b(comparar|comparac\w*|as duas|lado a lado)\b/.test(
    normalizarNomeDeMoto(mensagem),
  );
}

/**
 * Comparação de DUAS motos: se a seleção tem UMA e há outra moto já vista na
 * conversa, inclui a outra (uma foto de cada). Sem "outra", devolve como está.
 */
export function incluirComparacao(
  motos: readonly MotoDoCatalogo[],
  vistas: readonly MotoDoCatalogo[],
  mensagem: string,
  /**
   * A moto de INTERESSE já registrada no contato (`custom_fields.moto_interesse`).
   * É a "outra" mais provável na comparação — medida 2026-10-25: sem ela, a
   * varredura pegou uma CBX de uma oferta antiga em vez da CG que o cliente
   * estava fechando.
   */
  preferida?: MotoDoCatalogo | null,
): MotoDoCatalogo[] {
  if (!pedeComparacao(mensagem) || motos.length !== 1) return [...motos];
  const alvo = motos[0]!;
  const outra =
    preferida !== null && preferida !== undefined && preferida.nome !== alvo.nome
      ? preferida
      : [...vistas].reverse().find((m) => m.nome !== alvo.nome);
  return outra !== undefined ? [alvo, outra] : [...motos];
}

/**
 * Fila do "ver mais" SOB OBJEÇÃO DE PREÇO: não sobe de preço.
 *
 * Medido 2026-10-25: o cliente disse "não cabe no meu orçamento", pediu "ver mais
 * opções" e a fila trouxe a CB 650 F de R$ 41 mil com o texto "cabem melhor no
 * bolso". Quando a objeção corrente é de preço, a fila só entrega motos ABAIXO
 * da referência (moto em foco/escolhida). Sem referência/preço, não corta.
 */
export function cortarAcimaDaReferencia(
  motos: readonly MotoDoCatalogo[],
  referencia: MotoDoCatalogo | null,
  objecaoDePrecoAtiva: boolean,
): MotoDoCatalogo[] {
  if (!objecaoDePrecoAtiva || referencia === null) return [...motos];
  const teto = precoDaMoto(referencia);
  if (teto === null) return [...motos];
  return motos.filter((m) => {
    const p = precoDaMoto(m);
    return p !== null && p < teto;
  });
}

/** Quantas motos do catálogo o texto cita (por tokens do nome, sem números). */
function motosCitadasNoCorpo(corpo: string, catalogo: readonly MotoDoCatalogo[]): number {
  const corpoN = normalizarNomeDeMoto(corpo);
  if (corpoN === '') return 0;
  let total = 0;
  for (const m of catalogo) {
    const toks = normalizarNomeDeMoto(m.nome)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !/^\d+$/.test(t));
    if (toks.length === 0) continue;
    const hits = toks.filter((t) => corpoN.includes(t)).length;
    if (hits >= Math.min(2, toks.length)) total += 1;
  }
  return total;
}

/**
 * REDE DE SEGURANÇA do corpo da apresentação.
 *
 * O modelo escreve o `body` ANTES de o motor fixar a seleção final (ele mesmo
 * consulta o catálogo e às vezes lista nomes). Se o corpo lista motos/preços,
 * o texto pode contradizer as fotos que saem. Medido 2026-10-25.
 *
 * A regra do produto é o corpo SEM nome/lista (as legendas das fotos dizem os
 * dados). Então, em apresentação de 2+ motos, um corpo que parece LISTA
 * (2+ preços, "Motos:", 2+ itens "- ") ou que cita 2+ motos do catálogo vira
 * uma abertura NEUTRA com a contagem REAL.
 */
export function corpoSemNomesForaDoEnvio(
  corpo: string,
  catalogo: readonly MotoDoCatalogo[],
  totalApresentado: number,
): string {
  if (totalApresentado < 2) return corpo;
  const pareceLista =
    (corpo.match(/R\$\s*[\d.]/g)?.length ?? 0) >= 2 ||
    /(^|\n)\s*(motos?|op[cç][oõ]es)\s*:/i.test(corpo) ||
    (corpo.match(/(^|\n)\s*[-•]\s/g)?.length ?? 0) >= 2 ||
    motosCitadasNoCorpo(corpo, catalogo) >= 2;
  if (!pareceLista) return corpo;
  return `Separei ${totalApresentado} opções pra você dar uma olhada:`;
}

/** Quilometragem numérica da moto ("87.000" → 87000). */
function kmDaMoto(m: MotoDoCatalogo): number | null {
  const raw = String(m.quilometragem ?? m.valores?.quilometragem ?? '').trim();
  if (raw === '') return null;
  const n = Number(raw.replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * OBJEÇÃO DE QUILOMETRAGEM ("tá muito rodada, tem com menos km?"): o motor
 * EXECUTA o critério `km` da JEV — mostra as MENOS rodadas que a referência, em
 * ordem crescente. Medido 2026-10-26: a JEV disse `criterio: km`, o texto
 * prometeu "duas opções menos rodadas" e as fotos eram a própria CG de 87.000 km.
 */
export function filtrarMenosRodadas(
  motos: readonly MotoDoCatalogo[],
  casadas: readonly MotoDoCatalogo[],
  referencia: MotoDoCatalogo | null,
  limite: number,
  extras: readonly MotoDoCatalogo[] = [],
): MotoDoCatalogo[] {
  const refKm = referencia !== null ? kmDaMoto(referencia) : null;
  const vistos = new Set<string>();
  return [...motos, ...casadas, ...extras]
    .filter((m) => {
      if (vistos.has(m.nome)) return false;
      vistos.add(m.nome);
      return true;
    })
    .map((m) => ({ m, km: kmDaMoto(m) }))
    .filter(
      (x): x is { m: MotoDoCatalogo; km: number } =>
        x.km !== null && (refKm === null || x.km < refKm),
    )
    .sort((a, b) => a.km - b.km)
    .slice(0, Math.max(limite, 1))
    .map((x) => x.m);
}
