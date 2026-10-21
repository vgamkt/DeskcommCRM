/**
 * Um erro de modelo merece nova tentativa (ou modelo de reserva)?
 *
 * A lista é a MESMA usada pelo wrapper do turno (`turno-com-resiliencia`): se
 * um lado considera `Endpoint is unavailable` transitório e o outro não, o
 * mesmo incidente tem dois desfechos dependendo de quem chamou o modelo.
 *
 * Fica no seam (`edge/llm`) porque agora quem decide a reserva é o seam; o
 * wrapper importa daqui para não manter uma segunda cópia da régua.
 */
export function ehFalhaTransitoria(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|abort|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|network|overloaded|rate limit|429|502|503|504|500|unavailable|upstream request failed|service unavailable|bad gateway|gateway timeout/i.test(
    msg,
  );
}
