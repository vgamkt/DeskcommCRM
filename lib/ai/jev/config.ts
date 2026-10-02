/**
 * Configuração da Jev (Fase 0 — flag + alvos), vinda do ambiente.
 *
 * Default DESLIGADA: sem `JEV_ENABLED`, `alvosDeJevDe` devolve `[]` e nada muda
 * no sistema. Quando ligada, monta a lista de alvos (primário → fallback) a
 * partir de `JEV_*` / `JEV_FALLBACK_*`.
 *
 * A leitura é INJETADA (`envLike`) de propósito: fica testável sem tocar em
 * `process.env` e sem acoplar este módulo ao schema de ambiente do app.
 */
import type { AlvoDeJev } from "./index";

function ligado(v: string | undefined): boolean {
  return v === "1" || (v?.trim().toLowerCase() ?? "") === "true";
}

function montarAlvo(
  provider: string | undefined,
  apiKey: string | undefined,
  model: string | undefined,
): AlvoDeJev | null {
  const p = provider?.trim();
  const k = apiKey?.trim();
  if (!p || !k) return null;
  const alvo: AlvoDeJev = { provider: p, apiKey: k };
  const m = model?.trim();
  if (m) alvo.model = m;
  return alvo;
}

/**
 * Alvos da Jev a partir do ambiente. Vazio = Jev desligada (comportamento atual).
 *
 * - Primário: `JEV_PROVIDER` + `JEV_API_KEY` (+ `JEV_MODEL` opcional).
 * - Fallback: `JEV_FALLBACK_PROVIDER` + `JEV_FALLBACK_API_KEY` (+ `JEV_FALLBACK_MODEL`).
 *   Só entra se vier preenchido — é ele que dá a resiliência "se um cair, uso o outro".
 */
export function alvosDeJevDe(env: Record<string, string | undefined>): AlvoDeJev[] {
  if (!ligado(env.JEV_ENABLED)) return [];
  const alvos: AlvoDeJev[] = [];
  const primario = montarAlvo(env.JEV_PROVIDER, env.JEV_API_KEY, env.JEV_MODEL);
  if (primario) alvos.push(primario);
  const fallback = montarAlvo(
    env.JEV_FALLBACK_PROVIDER,
    env.JEV_FALLBACK_API_KEY,
    env.JEV_FALLBACK_MODEL,
  );
  if (fallback) alvos.push(fallback);
  return alvos;
}

/**
 * O alvo de FALLBACK vindo do ambiente, lido SEM exigir `JEV_ENABLED`.
 *
 * Serve ao caso em que o alvo PRIMÁRIO veio de um binding da tela: mesmo com a
 * Jev desligada por ambiente, um `JEV_FALLBACK_*` configurado deve dar para onde
 * correr se o provedor do binding der 429/esgotar. Assim a Jev tem sempre um
 * segundo caminho, que é a garantia "se um cair, uso o outro".
 */
export function fallbackDeJevDe(env: Record<string, string | undefined>): AlvoDeJev[] {
  const f = montarAlvo(env.JEV_FALLBACK_PROVIDER, env.JEV_FALLBACK_API_KEY, env.JEV_FALLBACK_MODEL);
  return f ? [f] : [];
}

/**
 * O BRIEF do turno (Parte 1) está ligado? Flag PRÓPRIA e default DESLIGADA
 * (`JEV_BRIEF_ENABLED`) para o rollout ser seguro: mesmo com a Jev ligada por
 * binding/ambiente, o brief só entra quando o operador ligar explicitamente.
 *
 * Lê `JEV_BRIEF_ENABLED` (1/true). Ausente = desligado = o turno manda os blocos
 * crus de sempre.
 */
export function briefDoTurnoDe(
  env: Record<string, string | undefined>,
): boolean {
  return ligado(env.JEV_BRIEF_ENABLED);
}
