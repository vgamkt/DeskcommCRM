/**
 * Telemetria das decisões da Jev (Fase 2 do plano de conclusão).
 *
 * Cada ponto, ao usar a Jev, registra UMA linha estruturada com o provedor, o
 * modelo, o nº de tentativas e os tokens — para MEDIR o consumo real da Jev e
 * comparar `llm_calls` (chat) com Jev OFF × ON. A interface mínima casa com o
 * `Logger` do agent-engine (`info(msg, meta)`), sem acoplar este módulo a ele.
 */
import type { DecisaoDeJev } from "./index";

export interface RegistradorDeJev {
  info(msg: string, meta?: Record<string, unknown>): void;
}

/** Registra a decisão da Jev. Nunca lança. */
export function registrarDecisaoJev(
  log: RegistradorDeJev,
  ponto: string,
  decisao: DecisaoDeJev,
): void {
  try {
    log.info(`jev: ${ponto}`, {
      provider: decisao.provider,
      model: decisao.model,
      tentativas: decisao.tentativas,
      input_tokens: decisao.usage.input_tokens,
      output_tokens: decisao.usage.output_tokens,
    });
  } catch {
    // telemetria não pode quebrar o turno
  }
}
