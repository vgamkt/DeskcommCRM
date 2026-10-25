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
import { normalizarNomeDeMoto, type MotoDoCatalogo } from './fotos-do-catalogo';
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
): MotoDoCatalogo[] {
  const precoRef = referencia !== null ? precoDaMoto(referencia) : null;
  const vistos = new Set<string>();
  return [...motos, ...casadas]
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
