/**
 * RESILIÊNCIA DO TURNO — trava ANTI-TRAVAMENTO.
 *
 * PROPÓSITO: se UM turno empaca (modelo lento/instável), ele NÃO pode segurar a
 * fila e travar os OUTROS clientes. Este wrapper tenta a chamada do turno até
 * `maxTentativas`, cada uma com `timeoutMs` (abortada no seam por `runModelCall`).
 * Se todas falharem, chama `aoEsgotar` (handoff ao humano + libera a fila) e
 * devolve `null` — o turno termina limpo, sem `running` preso.
 *
 * NUNCA lança. Erro fatal (não-retentável) também cai em `aoEsgotar`.
 */
import type { Logger } from '../obs/logger';

export interface OpcoesDeResiliencia {
  timeoutMs: number;
  maxTentativas: number;
  /** Chamado UMA vez quando todas as tentativas falham. Best-effort. */
  aoEsgotar: (info: { tentativas: number; ultimoErro: unknown }) => Promise<void>;
  log: Logger;
}

/** O erro é transitório (vale retentar)? Timeout/rede/5xx/overloaded. */
function retentavel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|abort|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|network|overloaded|rate limit|429|502|503|504|500/i.test(
    msg,
  );
}

export async function chamarTurnoComResiliencia<T>(
  tentar: (tentativa: number) => Promise<T>,
  opts: OpcoesDeResiliencia,
): Promise<T | null> {
  const max = Math.max(1, Math.floor(opts.maxTentativas));
  let ultimoErro: unknown = null;
  for (let tentativa = 1; tentativa <= max; tentativa++) {
    try {
      return await tentar(tentativa);
    } catch (err) {
      ultimoErro = err;
      const podeRetentar = tentativa < max && retentavel(err);
      opts.log.warn('turno: tentativa do modelo falhou', {
        tentativa,
        max,
        retenta: podeRetentar,
        erro: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
      });
      if (!podeRetentar) break;
    }
  }
  // Esgotou (ou erro fatal): libera a fila e avisa o humano. Best-effort.
  try {
    await opts.aoEsgotar({ tentativas: max, ultimoErro });
  } catch (err) {
    opts.log.error('turno: aoEsgotar falhou (segue para liberar a fila)', {
      erro: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
    });
  }
  opts.log.warn('turno: esgotou as tentativas do modelo — handoff/libera fila', { tentativas: max });
  return null;
}
