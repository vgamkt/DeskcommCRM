/**
 * Motor de tentativas da Jev (§3 do plano): a Jev SEMPRE tem de devolver uma
 * resposta. Regras decididas pelo dono:
 *   - mínimo 10 tentativas (default 12);
 *   - espera SEGURA: backoff exponencial + jitter, respeitando `Retry-After`;
 *   - timeout por tentativa e teto total (sem pendurar o turno);
 *   - FAILOVER: as tentativas varrem a lista de provedores (primário → fallback);
 *   - resposta NÃO preenchida conta como tentativa e repete.
 * Só quando tudo esgota é que o chamador cai no último recurso (regex/LLM).
 *
 * Relógio, sono e aleatoriedade são injetáveis → testável sem esperar de verdade.
 */
import { ErroDeJev, type MotivoDeFalha } from "./tipos";

export interface OpcoesDoMotor {
  maxTentativas: number;
  timeoutPorTentativaMs: number;
  baseMs: number;
  maxMs: number;
  jitterMs: number;
  capTotalMs: number;
  dormir: (ms: number) => Promise<void>;
  agora: () => number;
  aleatorio: () => number;
  aoTentar?: (info: InfoDaTentativa) => void;
}

export interface InfoDaTentativa {
  tentativa: number;
  provider: string;
  latenciaMs: number;
  respostaOk: boolean;
  motivo?: MotivoDeFalha;
}

export const MOTOR_PADRAO: OpcoesDoMotor = {
  maxTentativas: 12,
  timeoutPorTentativaMs: 8000,
  baseMs: 500,
  maxMs: 10000,
  jitterMs: 400,
  capTotalMs: 120000,
  dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  agora: () => Date.now(),
  aleatorio: () => Math.random(),
};

/** Espera antes da tentativa `n` (1-based). `retryAfterMs` vence o backoff calculado. */
export function calcularEspera(
  n: number,
  o: { baseMs: number; maxMs: number; jitterMs: number; aleatorio: () => number },
  retryAfterMs?: number,
): number {
  const exp = Math.min(o.maxMs, o.baseMs * 2 ** Math.max(0, n - 1));
  const alvo = retryAfterMs != null ? Math.max(retryAfterMs, exp) : exp;
  return alvo + Math.floor(o.aleatorio() * o.jitterMs);
}

/** Uma fonte tentável (um provedor). `tentar` devolve `null` = resposta não preenchida. */
export interface Fonte<T> {
  provider: string;
  tentar: () => Promise<T | null>;
}

export interface ResultadoDoMotor<T> {
  valor: T;
  provider: string;
  tentativas: number;
}

export async function decidirComTentativas<T>(
  fontes: Fonte<T>[],
  opcoes: Partial<OpcoesDoMotor> = {},
): Promise<ResultadoDoMotor<T> | null> {
  const o: OpcoesDoMotor = { ...MOTOR_PADRAO, ...opcoes };
  if (fontes.length === 0) return null;
  const porFonte = Math.max(1, Math.ceil(o.maxTentativas / fontes.length));
  const inicio = o.agora();
  let tentativas = 0;
  let aguardarMs = 0;

  for (const fonte of fontes) {
    for (let i = 0; i < porFonte; i++) {
      if (tentativas >= o.maxTentativas) return null;
      const restante = o.capTotalMs - (o.agora() - inicio);
      if (restante <= 0) return null;
      if (aguardarMs > 0) {
        await o.dormir(Math.min(aguardarMs, restante));
        aguardarMs = 0;
      }
      tentativas++;
      const t0 = o.agora();
      try {
        const valor = await fonte.tentar();
        const latenciaMs = o.agora() - t0;
        if (valor != null) {
          o.aoTentar?.({ tentativa: tentativas, provider: fonte.provider, latenciaMs, respostaOk: true });
          return { valor, provider: fonte.provider, tentativas };
        }
        o.aoTentar?.({
          tentativa: tentativas,
          provider: fonte.provider,
          latenciaMs,
          respostaOk: false,
          motivo: "unfilled",
        });
        aguardarMs = calcularEspera(i + 1, o);
      } catch (err) {
        const latenciaMs = o.agora() - t0;
        const erro = err instanceof ErroDeJev ? err : new ErroDeJev("desconhecido", "erro desconhecido");
        o.aoTentar?.({
          tentativa: tentativas,
          provider: fonte.provider,
          latenciaMs,
          respostaOk: false,
          motivo: erro.motivo,
        });
        if (!erro.retentavel) {
          aguardarMs = 0;
          break; // fatal (auth/schema): passa para o próximo provedor
        }
        aguardarMs = calcularEspera(i + 1, o, erro.retryAfterMs);
      }
    }
  }
  return null;
}
