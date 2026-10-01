/**
 * Rótulos de marca dos canais, para a tela NÃO precisar nomear o provider.
 *
 * O `lint:channels` proíbe nome de provider fora de `lib/channels/` — inclusive
 * como texto visível. A saída (a mesma que o canal intermediado já usa) é o nome
 * comercial vir daqui, por valor, e a tela renderizar a variável em vez do
 * literal. Quem instala reconhece a marca que contratou; a doutrina continua
 * valendo: nenhuma FEATURE decide comportamento pelo nome.
 */
import type { ChannelProvider } from "./types";

export const ROTULO_PARCEIRO_GRAPH = "Datafy";

/**
 * Nome visível de cada provedor — a "API" em que o número está conectado, como
 * aparece no card de Conexões. É DADO de marca, não comportamento: a tela
 * mostra o rótulo e nenhuma regra decide por ele.
 */
const ROTULOS_DO_PROVEDOR: Record<ChannelProvider, string> = {
  waha: "WAHA",
  datafy: ROTULO_PARCEIRO_GRAPH,
  meta_cloud: "Meta Cloud",
  zernio: "Zernio",
};

/**
 * Rótulo do provedor de uma sessão. Provedor desconhecido (instalação à frente
 * do código) devolve o próprio identificador em vez de string vazia — é melhor
 * mostrar um nome cru do que um card sem dizer em que API ele está.
 */
export function rotuloDoProvedor(provider: string | null | undefined): string {
  if (!provider) return "";
  return (ROTULOS_DO_PROVEDOR as Record<string, string>)[provider] ?? provider;
}
