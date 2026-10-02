/**
 * Porta pública da Jev: `decidir()` junta o cliente (`cliente.ts`) e o motor de
 * tentativas (`motor.ts`) com o failover de provedores.
 *
 * Recebe uma LISTA de alvos (primário + fallback) e devolve a primeira decisão
 * com TODAS as perguntas obrigatórias preenchidas — ou `null`, e aí o chamador
 * usa o último recurso (regex/LLM). Não lança.
 */
import { chamarSystemone, endpointDeJev, type FazerRequisicao } from "./cliente";
import {
  decidirComTentativas,
  motorDeJevDe,
  type Fonte,
  type OpcoesDoMotor,
} from "./motor";
import type { PerguntasDeJev, RespostasDeJev, UsoDeJev } from "./tipos";

export interface AlvoDeJev {
  provider: string;
  apiKey: string;
  model?: string;
  /**
   * URL COMPLETA do `systemone`, quando o provedor NÃO é uma das bases
   * conhecidas (`BASES_SYSTEMONE`). Permite cadastrar qualquer provedor novo que
   * exponha a mesma API, sem mexer no código.
   */
  baseUrl?: string;
  extraHeaders?: Record<string, string>;
}

export interface DecisaoDeJev {
  provider: string;
  model: string;
  respostas: RespostasDeJev;
  usage: UsoDeJev;
  tentativas: number;
}

export interface ArgsDeDecisao {
  alvos: AlvoDeJev[];
  state: unknown;
  questions: PerguntasDeJev;
  /** Ids que precisam vir preenchidos p/ a resposta valer (default: todas). */
  perguntasObrigatorias?: string[];
  opcoes?: Partial<OpcoesDoMotor>;
  fazerRequisicao?: FazerRequisicao;
  /**
   * Chamado quando a Jev esgota por falha de INFRAESTRUTURA (TPM/instabilidade) —
   * permite persistir a decisão para retry durável (outbox). Best-effort: o que
   * o callback fizer não muda a resposta do turno (que já cai no fallback).
   */
  aoEsgotar?: (info: {
    state: unknown;
    questions: PerguntasDeJev;
    perguntasObrigatorias?: string[];
  }) => void | Promise<void>;
}

/**
 * CIRCUIT BREAKER da Jev — por PROCESSO.
 *
 * POR QUE EXISTE: um mesmo turno chama a Jev em VÁRIOS pontos (estágio, catálogo,
 * fluxo, intenção, escolha). Cada ponto pode esperar até o teto do motor (~2min).
 * Se o provedor estourou o TPM, insistir ponto a ponto SOMA as esperas e estoura
 * o timeout do turno — e o cliente fica sem resposta, exatamente o que não pode.
 * Com o breaker, ao esgotar por motivo de INFRAESTRUTURA (429/overloaded/network/
 * timeout) a Jev fica "indisponível" por um cooldown, e os pontos seguintes vão
 * DIRETO ao último recurso (chat/regex). O agente sempre responde — rápido.
 *
 * `JEV_COOLDOWN_MS` (0 desliga). Sem `Retry-After`, usa o cooldown configurado;
 * com ele, respeita o que o provedor pediu.
 */
let jevIndisponivelAte = 0;

const MOTIVOS_DE_INDISPONIBILIDADE: ReadonlySet<string> = new Set([
  "rate_limit",
  "overloaded",
  "network",
  "timeout",
]);

/** Só para testes: zera o breaker. */
export function _resetarBreakerDeJev(): void {
  jevIndisponivelAte = 0;
}

/** Cooldown em ms após a Jev esgotar. `JEV_COOLDOWN_MS=0` desliga o breaker. */
export function cooldownDeJevDe(env: Record<string, string | undefined>): number {
  const bruto = env.JEV_COOLDOWN_MS;
  if (bruto === undefined || bruto.trim() === "") return 30000;
  const n = Number(bruto);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 30000;
}

function preenchida(respostas: RespostasDeJev, obrigatorias: string[]): boolean {
  for (const id of obrigatorias) {
    const a = respostas[id];
    if (!a) return false;
    if (a.type === "choice" && !a.choice) return false;
    if (a.type === "noul" && typeof a.noul !== "number") return false;
    if (a.type === "score" && typeof a.score !== "number") return false;
  }
  return true;
}

export async function decidir(args: ArgsDeDecisao): Promise<DecisaoDeJev | null> {
  // Breaker ABERTO: a Jev acabou de esgotar por TPM/instabilidade. Não tenta de
  // novo (nem por outro ponto do turno nem em outro turno do mesmo processo) —
  // cai direto no último recurso. É o que impede a espera de se multiplicar.
  if (Date.now() < jevIndisponivelAte) return null;

  const obrigatorias = args.perguntasObrigatorias ?? Object.keys(args.questions);
  const fontes: Fonte<DecisaoDeJev>[] = [];

  for (const alvo of args.alvos) {
    const ep = endpointDeJev(alvo.provider, alvo.apiKey, alvo.model);
    if (!ep) continue; // provedor sem base Jev conhecida → descartado (cai no fallback)
    if (alvo.extraHeaders) ep.extraHeaders = alvo.extraHeaders;
    const endpoint = ep;
    fontes.push({
      provider: endpoint.provider,
      tentar: async () => {
        const r = await chamarSystemone(endpoint, args.state, args.questions, {
          timeoutMs: args.opcoes?.timeoutPorTentativaMs,
          fazerRequisicao: args.fazerRequisicao,
        });
        if (!preenchida(r.answers, obrigatorias)) return null;
        return {
          provider: endpoint.provider,
          model: r.model,
          respostas: r.answers,
          usage: r.usage,
          tentativas: 0,
        };
      },
    });
  }

  if (fontes.length === 0) return null; // sem provedor válido: não abre o breaker

  // Política do motor: a do AMBIENTE (ajustável ao TPM) como base; o que o
  // chamador passou vence. Sem env, vale o `MOTOR_PADRAO` (12 tentativas, 2min).
  let falhaDeInfra = false;
  let maiorRetryAfterMs = 0;
  const r = await decidirComTentativas(fontes, {
    ...motorDeJevDe(process.env),
    ...(args.opcoes ?? {}),
    // Envolve o `aoTentar` do chamador para (a) não perdê-lo e (b) observar o
    // motivo das falhas — é o que decide se o breaker abre.
    aoTentar: (info) => {
      if (info.motivo !== undefined && MOTIVOS_DE_INDISPONIBILIDADE.has(info.motivo)) {
        falhaDeInfra = true;
      }
      if (info.retryAfterMs !== undefined && info.retryAfterMs > maiorRetryAfterMs) {
        maiorRetryAfterMs = info.retryAfterMs;
      }
      args.opcoes?.aoTentar?.(info);
    },
  });
  if (r) return { ...r.valor, provider: r.provider, tentativas: r.tentativas };

  // Esgotou. Só ABRE o breaker quando houve falha de INFRAESTRUTURA (429 etc.):
  // erro de schema/auth é defeito de payload/config e não significa que o
  // provedor está fora — abrir aí puniria os outros pontos sem motivo.
  if (falhaDeInfra) {
    const cd = cooldownDeJevDe(process.env);
    if (cd > 0) {
      jevIndisponivelAte = Date.now() + (maiorRetryAfterMs > 0 ? maiorRetryAfterMs : cd);
    }
    // Persiste a decisão para retry durável (outbox). Só aqui — nas falhas de
    // infraestrutura, que é o caso do TPM — e NUNCA nas de schema/auth (o retry
    // só repetiria o mesmo defeito de config). Best-effort: não lança.
    if (args.aoEsgotar) {
      try {
        await args.aoEsgotar({
          state: args.state,
          questions: args.questions,
          ...(args.perguntasObrigatorias !== undefined
            ? { perguntasObrigatorias: args.perguntasObrigatorias }
            : {}),
        });
      } catch {
        // o outbox não pode derrubar o turno que já respondeu pelo fallback
      }
    }
  }
  return null;
}
