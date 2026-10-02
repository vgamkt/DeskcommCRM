/**
 * Tipos do System One (Jev) — a API de DECISÃO ESTRUTURADA, irmã do chat.
 *
 * A Jev não gera texto: recebe um `state` e um mapa de perguntas TIPADAS e devolve
 * um rótulo/valor com probabilidade por pergunta (`answers`). É o formato da
 * TypeSafe (oficial) e o mesmo que a OpenCode e a OpenRouter expõem.
 */

export type TipoDePergunta = "noul" | "choice" | "score";

/** Sim/não: devolve `noul` (probabilidade 0–1), sem `confidence`. */
export interface PerguntaNoul {
  type: "noul";
  instructions: string;
  criteria?: Record<string, string>;
}

/** Múltipla escolha: `criteria` mapeia cada resposta possível à sua descrição. */
export interface PerguntaChoice {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

/** Rubrica ordenada do menor (índice 0) ao maior. */
export interface PerguntaScore {
  type: "score";
  instructions: string;
  criteria: (string | { label: string })[];
}

export type PerguntaDeJev = PerguntaNoul | PerguntaChoice | PerguntaScore;
export type PerguntasDeJev = Record<string, PerguntaDeJev>;

export interface RespostaNoul {
  type: "noul";
  noul: number;
}
export interface RespostaChoice {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface RespostaScore {
  type: "score";
  score: number;
  confidence: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
}
export type RespostaDeJev = RespostaNoul | RespostaChoice | RespostaScore;
export type RespostasDeJev = Record<string, RespostaDeJev>;

export interface UsoDeJev {
  input_tokens: number;
  output_tokens: number;
}

export interface RespostaSystemOne {
  model: string;
  answers: RespostasDeJev;
  usage: UsoDeJev;
  cost?: string;
}

/** Por que uma tentativa falhou — decide se ela é retentável (motor, §3 do plano). */
export type MotivoDeFalha =
  | "auth"
  | "schema"
  | "rate_limit"
  | "overloaded"
  | "network"
  | "timeout"
  | "unfilled"
  | "desconhecido";

export class ErroDeJev extends Error {
  readonly motivo: MotivoDeFalha;
  readonly retryAfterMs?: number;
  constructor(motivo: MotivoDeFalha, mensagem: string, retryAfterMs?: number) {
    super(mensagem);
    this.name = "ErroDeJev";
    this.motivo = motivo;
    this.retryAfterMs = retryAfterMs;
  }
  /** `auth`/`schema` são fatais (chave/uso errados): não adianta repetir a mesma fonte. */
  get retentavel(): boolean {
    return (
      this.motivo === "rate_limit" ||
      this.motivo === "overloaded" ||
      this.motivo === "network" ||
      this.motivo === "timeout" ||
      this.motivo === "unfilled"
    );
  }
}
