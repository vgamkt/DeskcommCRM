/**
 * FECHO DO TURNO — ponto ÚNICO onde o turno decide a PERGUNTA FINAL.
 *
 * DEEP FIX (2026-10-13): quando o turno MOSTROU MOTOS (catálogo) e há um fluxo com
 * pergunta pendente, a pergunta do TURNO é a de VENDA (escolha) — NÃO a do fluxo.
 * O modelo VARIA (medido ao vivo: uns turnos inclui a de venda, outros a do fluxo),
 * então o MOTOR garante, num único ponto que TODOS os caminhos de envio usam
 * (apresentação automática, `media_urls`, `sendInBubbles`):
 *   1. remove a pergunta do FLUXO do texto — o texto dela é CONHECIDO
 *      (`textoDaPergunta`); não é adivinhação nem regex de conteúdo;
 *   2. garante a pergunta de ESCOLHA como fecho.
 * A pergunta do fluxo NÃO se perde: o campo segue pendente e vira a do próximo
 * turno. Módulo PURO.
 */
import type { FechoDaApresentacao } from '@/lib/ai/jev/pontos/oferta';
import {
  perguntaDeAquisicao,
  perguntaDeEscolha,
  perguntaDeMaisOpcoes,
  perguntaDeOutrosNoValor,
  perguntaDeSaberMais,
  perguntaProsseguimentoAposMoto,
} from './mais-opcoes';

/**
 * Decide o TIPO de fecho que a apresentação vai renderizar, pela CONTAGEM real de
 * motos e pelo veredito da JEV. Regra estrutural: se saiu moto, o turno SEMPRE
 * fecha — mesmo quando a JEV diz `nenhum` (ex.: continuação do "ver mais", em que
 * ela não "oferece" de novo) ou quando ela não respondeu. Sem isso, o "ver mais"
 * terminava em frase afirmativa ("marcamos um horário…"), sem pergunta.
 */
export function fechoEfetivoDaApresentacao(args: {
  fechoJev: FechoDaApresentacao | null;
  motosDistintas: number;
  temMaisOpcoes: boolean;
  outrosNoValor: boolean;
}): FechoDaApresentacao {
  const base: FechoDaApresentacao | null =
    args.motosDistintas > 1 && args.temMaisOpcoes && !args.outrosNoValor
      ? 'escolha'
      : args.motosDistintas === 1 && args.fechoJev === 'escolha'
        ? 'saber_mais'
        : args.fechoJev;
  if (args.motosDistintas > 0 && (base === null || base === 'nenhum')) {
    // Com moto na tela, "nenhum" NÃO existe: plural → escolha; uma só → saber mais.
    return args.motosDistintas > 1 ? 'escolha' : 'saber_mais';
  }
  return base ?? 'nenhum';
}

export function ajustarFechoDoTurnoDeCatalogo(args: {
  corpo: string;
  perguntaDoFluxo: string | null;
  variacao?: number;
  /**
   * O cliente JÁ escolheu uma moto? Então o fecho NÃO é "qual delas?" (não há o que
   * escolher) — é a pergunta de AQUISIÇÃO (à vista/financiado/troca), que induz o
   * fluxo de pagamento. Estrutural: mesma regra do motor, sem regra nova por fora.
   */
  temEscolha?: boolean;
  /**
   * Ainda há mais opções que casam (o motor guarda a fila do "quer ver mais?")? Sem
   * isto, o fecho REMOVE a cauda interrogativa e apaga o "Quer ver mais?" que o motor
   * garantiu (medido ao vivo 2026-10-14: "Lander" → só "qual delas?", sem "mais").
   * Só entra quando NÃO há escolha (com moto escolhida, o fecho é o de aquisição).
   */
  temMaisOpcoes?: boolean;
  /** Modelo que o cliente tem em vista — varia a pergunta de "mais opções". */
  modeloCitado?: string | null;
  /** Nome do cliente — a pergunta de aquisição o chama pelo nome. */
  nomeCliente?: string | null;
  /**
   * ESCOPO 9: o cliente adicionou um critério a uma moto em foco e a família dela
   * não preencheu o valor — o convite do turno é "quer ver OUTROS MODELOS nesse
   * valor?" (não o "mais opções" genérico). Só entra com `temMaisOpcoes`.
   */
  outrosNoValor?: boolean;
  /**
   * O turno mostrou UMA moto só (pedido específico/única em estoque)? O fecho NÃO é
   * "qual delas?" (não há escolha plural) — é o de SABER MAIS ("quer saber mais sobre
   * ela?"), como pediu o dono (2026-10-16). Só entra sem `temEscolha`.
   */
  umaMoto?: boolean;
  /**
   * Já perguntamos como o cliente pretende ADQUIRIR? Se sim, o fecho de UMA moto NÃO
   * repete a progressão (à vista/cartão/financiamento/troca) — só o convite a saber
   * mais / ver na loja. Regra do dono (2026-10-16): pergunta UMA vez.
   */
  formaJaPerguntada?: boolean;
}): { corpo: string; ajustado: boolean } {
  let corpo = args.corpo.trim();

  // 1) Tira a pergunta do FLUXO inteira, quando colada literalmente (atalho: o texto
  //    dela é conhecido). Não é o caminho principal — o modelo PARAFRASEIA — mas
  //    quando copia exato, já sai limpo.
  const pf = (args.perguntaDoFluxo ?? '').trim();
  if (pf !== '' && corpo.includes(pf)) corpo = corpo.split(pf).join('').trim();

  // 2) ESTRUTURAL: o fecho do turno é do MOTOR. Remove a CAUDA interrogativa — TODA
  //    pergunta no fim, seja a do fluxo (parafraseada) ou a do modelo. Não casa
  //    conteúdo (não é regex de texto): só reconhece "isto é uma pergunta no fim".
  const paragrafos = corpo.split(/\s*\n\s*\n/);
  const ultimo = paragrafos[paragrafos.length - 1] ?? '';
  const sentencas = ultimo
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
  // Acha a ÚLTIMA frase com '?' e corta DALI até o fim — assim some a pergunta do
  // modelo (mesmo que venha seguida de um "Se quiser, posso te chamar…" sem '?').
  // Antes, uma cauda sem '?' preservava a pergunta do modelo e o fecho DUPLICAVA
  // (medido ao vivo: "Te conto mais sobre ela?… Te conto mais sobre a Biz…?").
  let ultimaPergunta = -1;
  for (let k = sentencas.length - 1; k >= 0; k -= 1) {
    if (sentencas[k]!.includes('?')) {
      ultimaPergunta = k;
      break;
    }
  }
  const semCauda = [
    ...paragrafos.slice(0, -1),
    sentencas.slice(0, ultimaPergunta >= 0 ? ultimaPergunta : sentencas.length).join(' '),
  ]
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join('\n\n')
    .trim();
  corpo = semCauda;

  // 3) Garante o fecho do turno: se o cliente JÁ escolheu, é a pergunta de AQUISIÇÃO
  //    (induz o fluxo de pagamento); senão, a de ESCOLHA.
  const v = args.variacao ?? 0;
  const pergunta = args.temEscolha === true
    ? // Escolha travada: fecho de AQUISIÇÃO — MENOS se já perguntamos a forma de
      // pagamento (regra do dono: UMA vez). Aí não repõe fecho (a próxima etapa,
      // ex.: fluxo de pagamento, ou a resposta do modelo, assume).
      args.formaJaPerguntada === true
      ? ''
      : perguntaDeAquisicao({ nome: args.nomeCliente ?? null, variacao: v })
    : args.umaMoto === true
      ? args.formaJaPerguntada === true
        ? perguntaDeSaberMais({ modelo: args.modeloCitado ?? null, variacao: v })
        : perguntaProsseguimentoAposMoto({
            modelo: args.modeloCitado ?? null,
            nome: args.nomeCliente ?? null,
            variacao: v,
          })
      : perguntaDeEscolha({ variacao: v });
  // 3b) Sem escolha e com MAIS opções que casam → re-adiciona o "quer ver mais?"
  //     (o passo 2 apagou a cauda interrogativa). Com escolha, NÃO (o fecho é o de
  //     aquisição — o cliente já decidiu; não se pergunta por mais fotos/opções).
  const mais =
    args.temEscolha !== true && args.temMaisOpcoes === true
      ? args.outrosNoValor === true
        ? perguntaDeOutrosNoValor({ modelo: args.modeloCitado ?? null, variacao: v })
        : perguntaDeMaisOpcoes({ modeloCitado: args.modeloCitado ?? null, variacao: v })
      : '';
  // O convite "mais opções" JÁ contém a escolha ("Alguma delas... ou prefere...?").
  // Somar a pergunta de escolha antes dele DUPLICAVA ("Qual delas...?" + "Alguma
  // delas...?"). Uma pergunta só (dono, 2026-10-23).
  const fechoDoTurno =
    mais !== ''
      ? args.outrosNoValor === true
        ? // "outros modelos nesse valor" NÃO contém a escolha → mantém as duas.
          `${pergunta}\n\n${mais}`
        : // O "mais opções" já contém a escolha ("Alguma delas...ou prefere...?").
          mais
      : pergunta;
  corpo = corpo === '' ? fechoDoTurno : `${corpo}\n\n${fechoDoTurno}`;

  return { corpo, ajustado: true };
}

/**
 * Garante que a pergunta de fecho seja a ÚLTIMA pergunta do texto.
 *
 * O modelo pode ter escrito uma pergunta que NÃO é fecho ("Você já tem
 * experiência com scooter?", "Como você se chama?") no lugar do fecho decidido
 * pela JEV. Antes, qualquer "?" fazia o motor DESISTIR do fecho — e o turno
 * terminava na pergunta errada (ou sem pergunta, quando ela ficava na chamada).
 *
 * Estrutural: só reconhece "há uma pergunta no fim" e troca a cauda pela
 * pergunta da JEV. Não olha o CONTEÚDO da pergunta (não é regex de decisão).
 */
export function garantirFechoNoFinal(final: string, pergunta: string): string {
  const p = pergunta.trim();
  const t = final.trim();
  if (p === '') return t;
  const i = t.lastIndexOf('?');
  if (i < 0) return t === '' ? p : `${t}\n\n${p}`;
  const corte = Math.max(
    t.lastIndexOf('\n', i),
    t.lastIndexOf('.', i),
    t.lastIndexOf('!', i),
  );
  return corte >= 0 ? `${t.slice(0, corte + 1).trim()}\n${p}` : p;
}

/**
 * Tira da CHAMADA a oração interrogativa (pergunta que sairia ANTES das fotos).
 *
 * Corta na última pergunta e volta até o separador forte anterior (`.`/`!`/`\n`/`:`/`;`),
 * preservando a chamada que vem antes. Se não há separador (pergunta já no começo),
 * NÃO mexe — para não comer a chamada inteira (saudação interrogativa é exceção).
 * Estrutural: não olha o conteúdo da pergunta.
 */
export function removerPerguntaDaChamada(introducao: string): string {
  const t = introducao.trim();
  const i = t.lastIndexOf('?');
  if (i < 0) return t;
  const corte = Math.max(
    t.lastIndexOf('.', i),
    t.lastIndexOf('!', i),
    t.lastIndexOf('\n', i),
    t.lastIndexOf(':', i),
    t.lastIndexOf(';', i),
  );
  return corte < 0 ? t : t.slice(0, corte).trim();
}

const semAcentoMinusculo = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Tira da CHAMADA o pedido do CAMPO do fluxo que está pendente (nome/cidade/CNH…).
 *
 * O modelo às vezes pede o campo no meio da chamada, como IMPERATIVO e sem "?"
 * ("Ah, e me diz seu nome…"), e ele sairia ANTES das fotos. O campo pendente é
 * DADO do fluxo (não adivinhação): remove a oração que menciona o rótulo do campo.
 * Se a remoção esvaziar a chamada, devolve a original (nunca deixa sem texto).
 */
export function removerPedidoDoCampoDaChamada(
  introducao: string,
  campo: string | null,
): string {
  const t = introducao.trim();
  const alvo = semAcentoMinusculo((campo ?? '').trim());
  if (t === '' || alvo === '') return t;
  const partes = t.split(/(?<=[.!?:])\s+|\n+/u);
  const mantidas = partes.filter((p) => p.trim() !== '' && !semAcentoMinusculo(p).includes(alvo));
  const resultado = mantidas.join(' ').trim();
  return resultado !== '' ? resultado : t;
}

/**
 * Contingência quando o modelo não enviou NADA (texto vetado/vazio): se há um
 * campo do fluxo pendente, manda a PERGUNTA dele (a conversa continua; o cliente
 * acabou de responder um dado) — o handoff humano só quando não há fluxo.
 * Medido no pesado 2026-10-22: "Meu nome é Letícia" caiu em handoff.
 */
export function textoDeContingenciaSemModelo(
  perguntaDoFluxo: string | null,
  humanoQuandoSemFluxo: string,
): string {
  const p = (perguntaDoFluxo ?? '').trim();
  return p !== '' ? p : humanoQuandoSemFluxo;
}
