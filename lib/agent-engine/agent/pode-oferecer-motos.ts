/**
 * A RÉGUA ÚNICA: "este turno PODE oferecer motos?".
 *
 * ─── O defeito que isto resolve ─────────────────────────────────────────────
 * Oferecer motos estava decidido em VÁRIOS lugares que não se falavam: o motor
 * apresentava automaticamente quando o MODELO consultava o catálogo; a IA podia
 * chamar `crm_offer_similar_motos`/`send_message(motos)` quando quisesse; e as
 * skills/persona empurravam "ofereça outras opções". O resultado medido ao vivo:
 * o cliente respondeu "De sao paulo" (nem falou de moto) e recebeu 5 motos —
 * porque, no meio daquele turno, a IA consultou o catálogo e o MOTOR interpretou
 * a consulta como "apresente agora".
 *
 * ─── A regra ────────────────────────────────────────────────────────────────
 * Só oferece com SINAL DO CLIENTE:
 *   - pediu catálogo/moto/menos ("quero uma moto", "tem uma CB 300?");
 *   - pediu para ver MAIS opções ("quero ver mais", "tem outras?");
 *   - pediu algo DIFERENTE ("quero outra cor", "queria mais nova");
 *   - o MESMO tipo de objeção já foi tratado DUAS vezes → na 3ª vez o bot avisa o
 *     responsável e PERGUNTA se o cliente quer ver opções parecidas; a oferta só
 *     sai quando ele CONFIRMA (então oferece o que ataca o motivo: caro→mais
 *     barata, rodada→menos km, antiga→mais nova). Mudou o tipo → reinicia.
 *
 * NÃO oferece quando:
 *   - é a 1ª ou a 2ª vez do tipo de objeção → persuade;
 *   - há ESCOLHA TRAVADA e o cliente não apontou defeito nem pediu outra;
 *   - o turno é de coleta/assunto alheio ("De sao paulo");
 *   - a IA só CONSULTOU o catálogo para responder uma dúvida (isso NÃO autoriza).
 *
 * Puro, sem banco/rede — para ser provado sozinho. É a MESMA régua usada pelo
 * motor (apresentação automática) E pelas ferramentas da IA (`send_message` com
 * `motos`, `crm_offer_similar_motos`): nenhum caminho oferece sem passar aqui.
 */
import {
  ehObjecaoValor,
  ehPedidoDesconto,
  ehPedidoDiferente,
  motivoDaObjecao,
  type EstadoObjecao,
} from './objecao-de-valor';
import { normalizarNomeDeMoto } from './fotos-do-catalogo';
import { querAlternativa, querMaisOpcoes, querMoto } from './selecao-por-intencao';

/** O que a objeção pede para atacar — vira o critério da busca. */
export type CriterioDaOferta = 'preco' | 'km' | 'ano' | null;

/** A preferência que o critério impõe ao ranqueamento (`selecionarPorIntencao`). */
export function preferenciaDoCriterio(c: CriterioDaOferta): 'menor' | 'maior' | null {
  if (c === 'preco' || c === 'km') return 'menor';
  if (c === 'ano') return 'maior';
  return null;
}

/**
 * Deriva o critério da reclamação: "achei cara" → preço menor; "muito rodada" →
 * km menor; "muito antiga" → ano maior. Puro. (`outro` → null, sem critério.)
 */
export function criterioDaObjecao(mensagem: string): CriterioDaOferta {
  const m = motivoDaObjecao(mensagem);
  return m === 'outro' ? null : m;
}

/**
 * O cliente REJEITOU algo pontual da moto ("não gostei dessa cor", "não curti
 * essa", "não era essa")? Diferente de objeção de valor: aqui ele não reclama do
 * preço — rejeitou a moto e quer OUTRA. Nesse caso, oferecer outra é legitimico.
 * Puro.
 */
export function clienteRejeitouMoto(mensagem: string): boolean {
  const n = normalizarNomeDeMoto(mensagem);
  if (n === '') return false;
  return /\b(nao gostei|nao curti|nao me agradou|nao era essa|nao e essa|prefiro outra|quero outra|quero outro|outra cor|outro modelo)\b/.test(
    n,
  );
}

/**
 * A mensagem pede um PROCESSO (financiar, dar a moto na troca, consignar…)? Um
 * pedido de processo NÃO é pedido de catálogo, mesmo quando tem verbo de pedido
 * ("quero financiar") ou cita "moto" ("quero dar minha moto na troca"). Sem esta
 * distinção, "Quero financiar" disparava 5 motos (medido ao vivo 2026-09-29).
 */
const RE_PROCESSO =
  /\b(financiar|financiamento|financiado|parcelar|parcela\w*|prestacao|prestação|entrada|troca|trocar|troque\w*|trocando|consignar|consignacao|consignação|consignado|vender|venda)\b/i;

export function ehIntencaoDeProcesso(mensagem: string): boolean {
  return RE_PROCESSO.test(mensagem);
}

export interface SinaisDeOferta {
  /** Mensagem do cliente NESTE turno. */
  mensagem: string;
  /** Há uma moto ESCOLHIDA/travada na conversa. */
  temEscolhaTravada: boolean;
  /**
   * O ESTADO da objeção no turno anterior (memória da conversa): o TIPO
   * (`motivo`) e quantas vezes ele já foi tratado (`tentativas`). `null` =
   * nenhuma objeção ainda.
   */
  estadoObjecaoAnterior: EstadoObjecao | null;
  /** O cliente pediu "ver outras" depois de já ter visto opções. */
  pediuOutraMoto: boolean;
  /**
   * Estávamos aguardando a CONFIRMAÇÃO do cliente (já perguntamos se ele quer ver
   * opções parecidas) e ele confirmou. Só então a oferta pós-objeção sai.
   */
  confirmouVerOpcoes: boolean;
}

export interface DecisaoDeOferta {
  pode: boolean;
  /** Código curto do motivo — vai para log; nunca para o cliente. */
  motivo: string;
  criterio: CriterioDaOferta;
}

function decisao(pode: boolean, motivo: string, criterio: CriterioDaOferta = null): DecisaoDeOferta {
  return { pode, motivo, criterio };
}

export function podeOferecerMotos(s: SinaisDeOferta): DecisaoDeOferta {
  const msg = s.mensagem;

  // 1) Pedido EXPLÍCITO de "mais opções" (reabre mesmo com escolha travada).
  if (querMaisOpcoes(msg) || s.pediuOutraMoto) {
    return decisao(true, 'cliente_pediu_mais_opcoes');
  }

  // 2) O cliente apontou um defeito, rejeitou a moto ou pediu OUTRA.
  if (ehPedidoDiferente(msg) || clienteRejeitouMoto(msg)) {
    return decisao(true, 'cliente_pediu_diferente', criterioDaObjecao(msg));
  }

  // 3) Objeção: DUAS tentativas de persuasão POR TIPO e, na 3ª vez do MESMO tipo,
  //    o bot AVISA o responsável e PERGUNTA antes de mostrar (NÃO oferece ainda).
  //    Mudou o tipo de objeção → reinicia a contagem.
  if (ehObjecaoValor(msg)) {
    // Insistência em DESCONTO é caso de handoff (C-071), não de trocar de moto.
    if (ehPedidoDesconto(msg)) return decisao(false, 'insistencia_desconto_handoff');
    const a = s.estadoObjecaoAnterior;
    const mesmoTipo = a !== null && a.motivo === motivoDaObjecao(msg);
    if (mesmoTipo && a.tentativas >= 2) {
      // 3ª vez: pergunta antes (regra do dono) — sem motos neste turno.
      return decisao(false, 'objecao_pedir_confirmacao');
    }
    return decisao(false, mesmoTipo ? 'objecao_tentativa_2' : 'objecao_tentativa_1');
  }

  // 3.1) Já perguntamos ("é só essa ou posso mostrar outras?") e o cliente
  //      CONFIRMOU → agora sim a oferta sai, com o critério do motivo.
  if (s.estadoObjecaoAnterior !== null && s.estadoObjecaoAnterior.tentativas >= 3 && s.confirmouVerOpcoes) {
    const m = s.estadoObjecaoAnterior.motivo;
    return decisao(true, 'cliente_confirmou_opcoes', m === 'outro' ? null : m);
  }

  // 4) Pedido de PROCESSO (financiar/trocar/consignar/vender) é FLUXO, não
  //    catálogo — mesmo que `querAlternativa` case "troca". Vem antes dele.
  if (ehIntencaoDeProcesso(msg)) return decisao(false, 'pedido_de_processo');
  if (querAlternativa(msg)) {
    return decisao(true, 'cliente_quer_alternativa', criterioDaObjecao(msg));
  }

  // 5) Escolha travada + nenhum pedido explícito → NÃO oferece (nem por menção
  //    solta a "moto" no texto).
  if (s.temEscolhaTravada) return decisao(false, 'escolha_travada');

  // 6) Pedido de catálogo/moto (sem escolha travada).
  if (querMoto(msg)) return decisao(true, 'cliente_pediu_catalogo');

  // 7) Sem pedido do cliente: NÃO oferece. (Consultar o catálogo não autoriza.)
  return decisao(false, 'sem_pedido_do_cliente');
}
