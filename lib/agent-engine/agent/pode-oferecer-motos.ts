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
  ehPedidoDiferente,
  motivoDaObjecao,
  type EstadoObjecao,
} from './objecao-de-valor';
import { normalizarNomeDeMoto } from './fotos-do-catalogo';

/**
 * O FLUXO DE ATENDIMENTO ATIVO bloqueia a oferta de motos enquanto tiver PERGUNTA
 * PENDENTE: o roteiro do fluxo termina antes de a apresentação começar
 * (encadeamento). Tem PRIORIDADE sobre o veredito da Jev — mesmo lugar da
 * negociação: enquanto o fluxo corre, o catálogo ESPERA. Quando o fluxo conclui
 * (zero pendentes), a oferta volta a valer, inclusive no mesmo turno.
 *
 * Vale para TODOS os fluxos, presentes e futuros (guard genérico). Puro e
 * testável de propósito — a regra não pode depender de o motor lembrar dela.
 */
export function fluxoBloqueiaOferta(pendentesDoFluxo: number): boolean {
  return pendentesDoFluxo > 0;
}
import { mencionaMoto, pedeMotoExplicito, querAlternativa, querMaisOpcoes, querMoto } from './selecao-por-intencao';

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
   * Há QUALQUER moto em foco na conversa (escolhida, referência ou já
   * apresentada). Com moto em foco, só um PEDIDO EXPLÍCITO abre outra oferta —
   * menção solta ("essa moto é boa?") não.
   */
  temMotoEmFoco: boolean;
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

/**
 * PEDIDO EXPLÍCITO de "mais opções" — sinal FORTE do cliente.
 *
 * A Jev é a autoridade da oferta, mas ela NÃO pode NEGAR um pedido legítimo e
 * explícito do cliente. Medido ao vivo (2026-10-04): em "quero ver mais opções"
 * a Jev devolveu `oferecer:false` e o turno ficou mudo — contrariando a regra
 * (o cliente PEDIU). Aqui a régua determinística vence a Jev: quando a mensagem
 * reconhece o pedido, a oferta é forçada. `null` = sem pedido explícito (a Jev
 * decide normalmente). Puro.
 */
export function pedidoExplicitoDeMaisOpcoes(mensagem: string): DecisaoDeOferta | null {
  return querMaisOpcoes(mensagem) ? decisao(true, 'cliente_pediu_mais_opcoes') : null;
}

/** Validação/opinião sobre uma moto JÁ em foco — NÃO é pedido de catálogo. */
const RE_VALIDACAO_DE_MOTO =
  /\b(presta|serve|vale a pena|e boa|e bom|recomenda\w*|confiav\w*|manutencao|economica|roda bem|aguenta|da problema|tem problema|defeito|melhor que|pior que|durabilidade|satisfeit\w*)\b/;

/** Pedido de uma moto DIFERENTE ("tem outra?", "mostra outras", "quero diferente"). */
const RE_OUTRA_MOTO =
  /\b(tem|tens|teria|tinha|mostra|manda|ver|quero|queria|gostaria)\b[^.!?]*\b(outra|outras|outro|outros|diferente|parecid\w*)\b/;

/**
 * O cliente está falando da PRÓPRIA moto (a troca), NÃO pedindo catálogo. Sem esta
 * exclusão, "minha moto é uma CG 150 2012" casava o termo "CG 150" e DISPARAVA
 * motos (medido ao vivo 2026-10-13: o bot mostrou catálogo ao anotar a troca).
 */
const RE_MOTO_DO_CLIENTE =
  /\b(minha moto|minha atual|a minha|meu veiculo|meu veículo|vou dar|quero dar|dou de|de entrada|na troca|em troca|pra troca|para troca|troco|trocar|a troca)\b/i;

/**
 * G3.11 — FAIXA/ORÇAMENTO de preço SOZINHO ("até 15 mil", "no máximo 20 mil",
 * "uns 12 mil"). É um critério CLARO de catálogo — o cliente está dizendo quanto
 * quer gastar. Sem isto, o motor perguntava o valor DE NOVO e não mostrava nada
 * (medido ao vivo 2026-10-13: "ate 15 mil" → "deixei registrado pro responsável").
 */
const RE_FAIXA_DE_PRECO =
  /\b(ate|no maximo|maximo|em torno de|por volta de|uns|umas|faixa de|entre|gastar|investir|pagar|tenho|disponho)\b[^.!?]*\b(\d{2,}|\d+\s*(mil|k))\b/;

/**
 * G3.10 — REDE DE PROTEÇÃO: o cliente fez um PEDIDO INEQUÍVOCO de catálogo?
 *
 * A Jev é a autoridade da oferta — mas ela NÃO pode NEGAR um pedido claro do
 * cliente (mesmo padrão de `pedidoExplicitoDeMaisOpcoes`). Medido ao vivo
 * (2026-10-12): em "e uma lander?" a Jev devolveu `oferecer:false` (`jev_negou`)
 * e o bot PROMETEU opções sem mostrar nenhuma. Aqui a régua determinística VENCE.
 *
 * FORÇA quando: pede mais opções; verbo+termo ("quero uma moto"); OU cita um
 * modelo/categoria ("e uma lander?", "tem uma XRE?") — DESDE QUE não seja uma
 * VALIDAÇÃO de moto já em foco ("essa presta?"), nem pedido de PROCESSO
 * (financiar/trocar), nem só o nome da moto que já está em foco.
 *
 * `null` = sem pedido inequívoco (a Jev decide normalmente). Puro.
 */
/**
 * A2 — a mensagem fala da moto QUE JÁ ESTÁ EM FOCO (escolhida/referência)? Então
 * NÃO é pedido de OUTRA moto. Compara pela LINHA do modelo (token significativo
 * não numérico) e, se o nome em foco tem número (cilindrada/ano), exige que a
 * mensagem NÃO cite um número diferente:
 *   - "ver a Factor 150" (foco "YAMAHA Factor 150 ED") → MESMA moto → não força;
 *   - "tem uma CB 300?" (foco "HONDA CB 160 Fan") → nº 300 ≠ 160 → OUTRA → força.
 * Defeito corrigido (medido ao vivo 2026-10-13): "…ver ela de perto?" reabria a
 * oferta com a moto já escolhida. Puro.
 */
function citaMotoEmFoco(mensagemNorm: string, nomeEmFoco: string): boolean {
  const foco = normalizarNomeDeMoto(nomeEmFoco);
  if (foco === '' || mensagemNorm === '') return false;
  const tokens = foco.split(/\s+/).filter((t) => t.length >= 3);
  const linhas = tokens.filter((t) => !/^\d+$/.test(t));
  if (linhas.length === 0) return false;
  if (!linhas.some((t) => mensagemNorm.includes(t))) return false;
  const numeros = tokens.filter((t) => /^\d+$/.test(t));
  if (numeros.length > 0 && !numeros.some((t) => mensagemNorm.includes(t))) {
    // Citou a LINHA mas nenhum número do foco; se citou OUTRO número, é outra moto.
    if (/\b\d{2,4}\b/.test(mensagemNorm)) return false;
  }
  return true;
}

export function pedidoDeCatalogoInequivoco(
  mensagem: string,
  opcoes: { nomeMotoEmFoco?: string | null } = {},
): DecisaoDeOferta | null {
  const marcar = (motivo: string): DecisaoDeOferta => decisao(true, motivo);
  if (ehIntencaoDeProcesso(mensagem)) return null;
  // O cliente descrevendo a PRÓPRIA moto (troca) NÃO é pedido de catálogo.
  if (RE_MOTO_DO_CLIENTE.test(normalizarNomeDeMoto(mensagem))) return null;
  if (querMaisOpcoes(mensagem)) return marcar('cliente_pediu_mais_opcoes');
  if (RE_OUTRA_MOTO.test(normalizarNomeDeMoto(mensagem))) return marcar('cliente_pediu_diferente');
  if (RE_FAIXA_DE_PRECO.test(normalizarNomeDeMoto(mensagem))) return marcar('cliente_citou_faixa');
  const n = normalizarNomeDeMoto(mensagem);
  // A2: se a mensagem fala da moto QUE JÁ ESTÁ EM FOCO, NÃO é pedido de catálogo.
  if (citaMotoEmFoco(n, opcoes.nomeMotoEmFoco ?? '')) return null;
  if (pedeMotoExplicito(mensagem)) return marcar('cliente_pediu_catalogo');
  if (n === '' || !mencionaMoto(mensagem)) return null;
  if (RE_VALIDACAO_DE_MOTO.test(n)) return null;
  return marcar('cliente_citou_modelo');
}

/**
 * B1 (2026-10-13) — AUTORIDADE DA OFERTA: a Jev decide; a rede determinística é
 * FALLBACK. Ordem (doutrina `jev-decide-sempre`):
 *   1. veredito da Jev (se houver) — inclusive NEGATIVO (negativa é decisão);
 *   2. só quando o veredito é `null` (Jev desligada/indisponível) → `pedidoDeCatalogoInequivoco`
 *      (rede de proteção) → `pedidoExplicitoDeMaisOpcoes` → `podeOferecerMotos`.
 *
 * ⚠️ ANTES, a rede rodava ANTES e VENCIA a Jev: medido ao vivo (2026-10-13), a Jev
 * negou (`veredito_jev:false`) e a régua forçou a oferta mesmo com a moto já
 * escolhida (turnos 3 e 6). Puro.
 */
export function decidirOfertaComAutoridadeDaJev(args: {
  vereditoJev: { oferecer: boolean; motivo: string; criterio: 'preco' | 'km' | 'ano' | 'nenhum' } | null;
  mensagem: string;
  nomeMotoEmFoco: string | null;
  sinais: SinaisDeOferta;
}): DecisaoDeOferta {
  if (args.vereditoJev !== null) {
    return {
      pode: args.vereditoJev.oferecer,
      motivo: args.vereditoJev.motivo,
      criterio: args.vereditoJev.criterio === 'nenhum' ? null : args.vereditoJev.criterio,
    };
  }
  // Jev indisponível → rede de proteção determinística (fallback).
  const forcado = pedidoDeCatalogoInequivoco(args.mensagem, { nomeMotoEmFoco: args.nomeMotoEmFoco });
  if (forcado !== null) return forcado;
  const explicito = pedidoExplicitoDeMaisOpcoes(args.mensagem);
  if (explicito !== null) return explicito;
  return podeOferecerMotos(args.sinais);
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
    // Pedido de desconto NÃO é caso especial de handoff: é objeção de PREÇO
    // normal (persuade; na 3ª do mesmo tipo, encaminha SEM silenciar). Antes,
    // "dá pra melhorar o preço?" virava 'insistencia_desconto_handoff' e o bot
    // silenciava (medido ao vivo 2026-10-09).
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

  // 5) Pedido EXPLÍCITO (verbo + termo: "quero uma moto até 20 mil") VENCE a
  //    escolha travada — o pedido claro do cliente substitui a moto salva.
  if (pedeMotoExplicito(msg)) return decisao(true, 'cliente_pediu_catalogo');

  // 6) Escolha travada + nenhum pedido explícito → NÃO oferece (nem por menção
  //    solta a "moto" no texto).
  if (s.temEscolhaTravada) return decisao(false, 'escolha_travada');

  // 7) Menção/verbo solto de moto — só oferece quando NÃO há moto em foco (numa
  //    conversa com moto já apresentada, menção solta a "moto" não reabre oferta).
  if (querMoto(msg) && !s.temMotoEmFoco) return decisao(true, 'cliente_pediu_catalogo');

  // 7) Sem pedido do cliente: NÃO oferece. (Consultar o catálogo não autoriza.)
  return decisao(false, 'sem_pedido_do_cliente');
}
