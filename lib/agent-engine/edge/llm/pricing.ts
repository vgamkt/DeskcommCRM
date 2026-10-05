/**
 * Tabela de preços versionada (stack.md §2: usage × pricing.ts → llm_calls.cost_cents).
 * ÚNICO lugar com preço de modelo no repo.
 *
 * Fonte: https://docs.claude.com/en/docs/about-claude/pricing (conferida 2026-07);
 * cache write cotado no TTL 1h (2× input) — o TTL adotado pela doutrina de caching
 * (CLAUDE.md regra 15); cache read = 0.1× input.
 *
 * Modelo fora da tabela → custo NULL (desconhecido): mais honesto que inventar 0 —
 * o budget soma coalesce(cost_cents, 0), então modelo sem preço não consome teto;
 * quem habilitar um modelo novo para uma org adiciona a linha de preço aqui.
 */

/** USD por MILHÃO de tokens; match por prefixo do id (cobre sufixo de data do vendor). */
const USD_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite1h: number }> = {
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite1h: 6 },
  'claude-haiku-4': { input: 1, output: 5, cacheRead: 0.1, cacheWrite1h: 2 },
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheWrite1h: 30 },
  // Jev (TypeSafe) — decisão estruturada: input US$0,042/M, output grátis (docs Zen).
  // O id pode vir como `jev-1.13-free` (OpenCode) ou `typesafe/jev-1.13-<data>` (OpenRouter).
  jev: { input: 0.042, output: 0, cacheRead: 0, cacheWrite1h: 0 },
  'typesafe/jev': { input: 0.042, output: 0, cacheRead: 0, cacheWrite1h: 0 },
};

/**
 * Fator do cache read sobre o preço de input quando o provedor não expõe um preço
 * de cache próprio. `opencode`/`opencode_go` cobram ~1/50 do input pico (docs Go:
 * deepseek cache read US$0,003–0,006/1M vs input US$0,15–0,30/1M); os demais
 * seguem a doutrina de 0.1× (CLAUDE.md regra 15).
 */
export function fatorCacheRead(provider: string): number {
  return provider === 'opencode' || provider === 'opencode_go' ? 0.02 : 0.1;
}

/**
 * Custo (centavos) a partir de preços em CENTAVOS por milhão — usado pela rota do
 * catálogo (`ai_models`), que tem preço por `(provider, model)`. Mesma fórmula do
 * `costCents`, mas com o preço vindo de fora.
 */
export function custoComPrecos(
  preco: { input: number; output: number },
  usage: TokenUsage,
  provider: string,
): number {
  const noCacheInput = Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);
  const fator = fatorCacheRead(provider);
  return (
    (noCacheInput * preco.input +
      usage.cacheReadTokens * preco.input * fator +
      usage.cacheWriteTokens * preco.input * 2 +
      usage.outputTokens * preco.output) /
    1_000_000
  );
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Custo em CENTS (fracionário; coluna numeric) ou null se o modelo não tem preço
 * conhecido. `inputTokens` aqui é o TOTAL do usage do SDK — a parcela cacheada é
 * descontada e cobrada pela tarifa de cache.
 */
export function costCents(model: string, usage: TokenUsage): number | null {
  const priceKey = Object.keys(USD_PER_MTOK).find((prefix) => model.startsWith(prefix));
  if (priceKey === undefined) {
    return null;
  }
  const p = USD_PER_MTOK[priceKey];
  if (p === undefined) {
    return null; // inalcançável (key veio de Object.keys); satisfaz noUncheckedIndexedAccess
  }
  const noCacheInput = Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);
  const usd =
    (noCacheInput * p.input +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite1h +
      usage.outputTokens * p.output) /
    1_000_000;
  return usd * 100;
}
