/**
 * BREAKER por (provider, modelo) — curto e em memória.
 *
 * Por que existe: quando o upstream de um modelo está fora (429/503
 * consistente), tentar esse modelo em TODO turno paga o timeout inteiro antes
 * de cair na reserva. Três falhas transitórias seguidas abrem o breaker por
 * 60s; nesse intervalo a chamada vai direto para o próximo candidato. Um
 * sucesso zera o estado.
 *
 * Não é estado durável: reiniciar o worker esquece o breaker, e é assim de
 * propósito — o cooldown é curto e o custo de esquecer é uma nova tentativa,
 * não uma resposta errada.
 */
export interface OpcoesDoBreaker {
  /** Falhas transitórias seguidas que abrem o breaker. */
  limite: number;
  /** Quanto tempo o modelo fica em cooldown. */
  cooldownMs: number;
  /** Relógio injetável (teste). */
  agora?: () => number;
}

interface Estado {
  falhas: number;
  abertoAte: number;
}

export class BreakerDeModelo {
  private readonly estados = new Map<string, Estado>();
  private readonly limite: number;
  private readonly cooldownMs: number;
  private readonly relogio: () => number;

  constructor(opts: OpcoesDoBreaker) {
    this.limite = Math.max(1, opts.limite);
    this.cooldownMs = Math.max(0, opts.cooldownMs);
    this.relogio = opts.agora ?? (() => Date.now());
  }

  podeTentar(chave: string): boolean {
    const e = this.estados.get(chave);
    if (e === undefined) return true;
    if (e.abertoAte === 0) return true;
    if (this.relogio() >= e.abertoAte) {
      this.estados.delete(chave);
      return true;
    }
    return false;
  }

  registrarFalha(chave: string): void {
    const e = this.estados.get(chave) ?? { falhas: 0, abertoAte: 0 };
    e.falhas += 1;
    if (e.falhas >= this.limite) e.abertoAte = this.relogio() + this.cooldownMs;
    this.estados.set(chave, e);
  }

  registrarSucesso(chave: string): void {
    this.estados.delete(chave);
  }
}

/** Instância do processo do worker. */
export const breakerDeModelo = new BreakerDeModelo({ limite: 3, cooldownMs: 60_000 });
