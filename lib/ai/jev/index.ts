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

  // Política do motor: a do AMBIENTE (ajustável ao TPM) como base; o que o
  // chamador passou vence. Sem env, vale o `MOTOR_PADRAO` (12 tentativas, 2min).
  const r = await decidirComTentativas(fontes, {
    ...motorDeJevDe(process.env),
    ...(args.opcoes ?? {}),
  });
  if (!r) return null;
  return { ...r.valor, provider: r.provider, tentativas: r.tentativas };
}
