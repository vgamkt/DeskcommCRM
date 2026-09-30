/**
 * O TURNO É DE CATÁLOGO? — a régua que impede o despejo indiscriminado de motos.
 *
 * ─── O defeito que isto resolve ─────────────────────────────────────────────
 * A apresentação automática de motos (`planoAutomatico`, em `inbound-turn.ts`)
 * decidia entrar apenas com `catalogoDoTurno.length > 0 || motoAtual !== null`.
 * `motoAtual` é MEMÓRIA da conversa (a moto que o cliente escolheu turnos atrás),
 * não INTENÇÃO do turno. Resultado medido ao vivo em 2026-09-29: o cliente
 * mandou um áudio perguntando "Onde fica a loja?"; como já havia escolhido uma
 * moto antes, o motor varreu o estoque inteiro, ranqueou contra o texto do
 * endereço e enviou 5 fotos de motos ANTES de responder o endereço. Qualquer
 * turno depois de uma escolha — "vocês abrem sábado?", "obrigado", "quanto é o
 * frete?" — virava despejo de catálogo.
 *
 * ─── A regra ────────────────────────────────────────────────────────────────
 * Só é turno de catálogo quando há SINAL de moto NESTE turno:
 *   - o MODELO consultou o catálogo agora (`catalogoDoTurno > 0`) — ele decidiu
 *     procurar/comparar motos; ou
 *   - o modelo chamou `crm_offer_similar_motos` — pedido explícito de opções; ou
 *   - o cliente pediu para ver OUTRAS opções depois de já ter visto algumas; ou
 *   - a mensagem do cliente PEDE moto (`querMoto`); ou
 *   - a mensagem pede "mais opções" (`querMaisOpcoes`); ou
 *   - há moto atual E a mensagem quer algo DIFERENTE dela — mas NUNCA quando a
 *     mensagem é uma objeção de valor ("achei caro"), porque aí a decisão é
 *     persuadir primeiro (C-071), não oferecer outras motos.
 *
 * Um `motoAtual` guardado sozinho NÃO autoriza nada.
 *
 * Puro, sem banco/rede — para poder ser provado sozinho, que é o que torna a
 * trava confiável: o defeito era exatamente uma condição booleana frouxa.
 */
import { ehObjecaoValor } from './objecao-de-valor';
import { mencionaMoto, querAlternativa, querMaisOpcoes } from './selecao-por-intencao';

/**
 * A mensagem pede um PROCESSO (financiar, dar a moto na troca, consignar…)?
 *
 * Um pedido de processo NÃO é pedido de catálogo, mesmo quando tem verbo de
 * pedido ("quero financiar") ou cita "moto" ("quero dar minha moto na troca").
 * Sem esta distinção, `querMoto`/termo disparava o motor de catálogo e o cliente
 * que só queria financiar recebia 5 fotos de motos (medido ao vivo 2026-09-29,
 * "Quero financiar" → 5 motos + pergunta de CPF).
 */
const RE_PROCESSO =
  /\b(financiar|financiamento|financiado|parcelar|parcela\w*|prestacao|prestação|entrada|troca|trocar|troque\w*|trocando|consignar|consignacao|consignação|consignado|vender|venda)\b/i;

export function ehIntencaoDeProcesso(mensagem: string): boolean {
  return RE_PROCESSO.test(mensagem);
}

export interface SinaisDoTurnoDeCatalogo {
  /** O modelo consultou o catálogo NESTE turno (`catalogoDoTurno.length > 0`). */
  catalogoConsultadoNoTurno: boolean;
  /** O modelo chamou `crm_offer_similar_motos` NESTE turno. */
  ofereceuSimilaresPelaFerramenta: boolean;
  /** O cliente pediu "ver outras" depois de já ter visto opções. */
  pediuOutraMoto: boolean;
  /** Existe uma moto em foco na conversa (escolhida/referência/única). */
  temMotoAtual: boolean;
  /** A mensagem que o cliente mandou NESTE turno (pode ser a transcrição do áudio). */
  mensagem: string;
}

export function turnoEhDeCatalogo(s: SinaisDoTurnoDeCatalogo): boolean {
  // OBJEÇÃO DE VALOR não vira oferta automática de motos (C-071): primeiro a IA
  // persuade; só a ferramenta de semelhantes ou um pedido EXPLÍCITO de mais
  // opções abre a busca. Sem esta linha, "achei caro, essa moto está rodada?"
  // caía na menção a "moto" e o motor despejava outras motos — medido ao vivo
  // (2026-09-30: objeção sobre a CB 300 R Flex → 5 motos não pedidas).
  if (ehObjecaoValor(s.mensagem)) {
    return s.ofereceuSimilaresPelaFerramenta || s.pediuOutraMoto || querMaisOpcoes(s.mensagem);
  }
  if (s.catalogoConsultadoNoTurno) return true;
  if (s.ofereceuSimilaresPelaFerramenta) return true;
  if (s.pediuOutraMoto) return true;
  if (querMaisOpcoes(s.mensagem)) return true;
  // CITA uma moto concreta E não é pedido de PROCESSO. "quero financiar" e
  // "quero dar minha moto na troca" são processos — o fluxo cuida deles, o motor
  // de catálogo não despeja fotos.
  if (mencionaMoto(s.mensagem) && !ehIntencaoDeProcesso(s.mensagem)) return true;
  // Diferente da moto ATUAL, sem ser objeção de valor (objeção → persuadir, C-071).
  if (s.temMotoAtual && querAlternativa(s.mensagem) && !ehObjecaoValor(s.mensagem)) {
    return true;
  }
  return false;
}
