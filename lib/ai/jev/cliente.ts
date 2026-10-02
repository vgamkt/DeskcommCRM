/**
 * Cliente HTTP do `systemone` (Jev) — a única chamada desta família.
 *
 * Multi-provedor por DESENHO: a Jev é oferecida pela TypeSafe (oficial), pela
 * OpenCode Zen e pela OpenRouter. Este módulo só sabe a BASE de cada uma; quem
 * decide a ordem e o failover é o motor (`motor.ts` / `index.ts`).
 *
 * ⚠️ O header `x-opencode-session` NÃO entra aqui: ele é exigido no CHAT da
 * OpenCode (400 MissingSessionID), mas o `systemone` responde 200 sem ele
 * (medido em 2026-10-02).
 */
import { ErroDeJev, type PerguntasDeJev, type RespostaSystemOne } from "./tipos";

export interface EndpointDeJev {
  provider: string;
  /** URL COMPLETA do `systemone` (já com o caminho). */
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

/** As bases `systemone` conhecidas, por provedor cadastrável. */
export const BASES_SYSTEMONE: Record<string, { baseUrl: string; modeloPadrao: string }> = {
  typesafe: { baseUrl: "https://api.typesafe.ai/v1/systemone", modeloPadrao: "jev-latest" },
  opencode: { baseUrl: "https://opencode.ai/zen/v1/systemone", modeloPadrao: "jev-1.13-free" },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1/systemone",
    modeloPadrao: "typesafe/jev-1.13",
  },
};

/**
 * O modelo escolhido no painel é um modelo de JEV (decisão estruturada)?
 *
 * POR QUE ISSO EXISTE: o painel de provedores guarda, no MESMO
 * `ai_purpose_bindings`, tanto o modelo de CHAT de um ponto (ex.: OpenRouter +
 * `openai/gpt-4o-mini` para o classificador de estágio) quanto a escolha da Jev.
 * Sem esta checagem, o resolvedor tratava QUALQUER binding de provedor
 * Jev-capaz como Jev e mandava um modelo de conversa para o endpoint
 * `systemone` — HTTP 400 `schema`, tentativa desperdiçada em todo turno. A
 * decisão certa: a classificação roda com o modelo que o operador escolheu na
 * tela; se ele é de chat, quem decide é o caminho de chat (a Jev não entra).
 *
 * `typesafe` é a base OFICIAL da Jev — todo modelo dela é Jev. Para as demais, o
 * id precisa denunciar a família (`jev` em `typesafe/jev-1.13`, `jev-1.13-free`,
 * `jev-latest`).
 */
export function ehModeloDeJev(provider: string, model: string | null | undefined): boolean {
  if (provider === "typesafe") return true;
  if (model === null || model === undefined) return false;
  return /(^|[/_:.-])jev/i.test(model.trim());
}

/**
 * Monta o endpoint de um provedor. Provedor SEM base conhecida (ex.: anthropic,
 * openai, opencode_go) devolve `null` — o card deixa selecionar, mas a tentativa
 * é descartada e o motor cai no fallback (decisão do dono).
 */
export function endpointDeJev(
  provider: string,
  apiKey: string,
  model?: string,
): EndpointDeJev | null {
  const base = BASES_SYSTEMONE[provider];
  if (!base) return null;
  return { provider, baseUrl: base.baseUrl, apiKey, model: model?.trim() || base.modeloPadrao };
}

/** Resposta HTTP mínima que o cliente usa — permite dublê nos testes sem `Response`. */
export interface RespostaHttpLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}
export type FazerRequisicao = (
  url: string,
  init: RequestInit,
) => Promise<RespostaHttpLike>;

const TIMEOUT_PADRAO_MS = 8000;

export interface OpcoesDaChamada {
  timeoutMs?: number;
  fazerRequisicao?: FazerRequisicao;
}

export async function chamarSystemone(
  endpoint: EndpointDeJev,
  state: unknown,
  questions: PerguntasDeJev,
  opts: OpcoesDaChamada = {},
): Promise<RespostaSystemOne> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const fazer = opts.fazerRequisicao ?? ((url, init) => fetch(url, init) as unknown as Promise<RespostaHttpLike>);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let res: RespostaHttpLike;
  try {
    res = await fazer(endpoint.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${endpoint.apiKey}`,
        "Content-Type": "application/json",
        ...(endpoint.extraHeaders ?? {}),
      },
      body: JSON.stringify({ model: endpoint.model, state, questions }),
      signal: ctrl.signal,
    });
  } catch (err) {
    const motivo = err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    throw new ErroDeJev(motivo, `systemone ${motivo}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const retryAfterMs = lerRetryAfter(res.headers);
    if (res.status === 401 || res.status === 403) {
      throw new ErroDeJev("auth", `systemone auth ${res.status}`);
    }
    if (res.status === 400 || res.status === 422) {
      throw new ErroDeJev("schema", `systemone schema ${res.status}`);
    }
    if (res.status === 429) {
      throw new ErroDeJev("rate_limit", "systemone rate_limit", retryAfterMs);
    }
    if (res.status === 529) {
      throw new ErroDeJev("overloaded", "systemone overloaded", retryAfterMs);
    }
    throw new ErroDeJev("network", `systemone status ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ErroDeJev("network", "systemone json invalido");
  }
  const resposta = json as RespostaSystemOne | null;
  if (!resposta || typeof resposta !== "object" || !resposta.answers) {
    throw new ErroDeJev("network", "systemone resposta vazia");
  }
  return resposta;
}

function lerRetryAfter(headers: { get(name: string): string | null }): number | undefined {
  const ms = headers.get("retry-after-ms");
  if (ms != null) {
    const n = Number(ms);
    if (Number.isFinite(n)) return n;
  }
  const s = headers.get("retry-after");
  if (s != null) {
    const n = Number(s);
    if (Number.isFinite(n)) return Math.round(n * 1000);
  }
  return undefined;
}
