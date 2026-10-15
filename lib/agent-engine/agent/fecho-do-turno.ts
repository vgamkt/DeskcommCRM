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
import {
  perguntaDeAquisicao,
  perguntaDeEscolha,
  perguntaDeMaisOpcoes,
  perguntaDeOutrosNoValor,
} from './mais-opcoes';

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
  let i = sentencas.length - 1;
  while (i >= 0 && sentencas[i]!.includes('?')) i -= 1;
  const semCauda = [...paragrafos.slice(0, -1), sentencas.slice(0, i + 1).join(' ')]
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join('\n\n')
    .trim();
  corpo = semCauda;

  // 3) Garante o fecho do turno: se o cliente JÁ escolheu, é a pergunta de AQUISIÇÃO
  //    (induz o fluxo de pagamento); senão, a de ESCOLHA.
  const v = args.variacao ?? 0;
  const pergunta = args.temEscolha === true
    ? perguntaDeAquisicao({ nome: args.nomeCliente ?? null, variacao: v })
    : perguntaDeEscolha({ variacao: v });
  // 3b) Sem escolha e com MAIS opções que casam → re-adiciona o "quer ver mais?"
  //     (o passo 2 apagou a cauda interrogativa). Com escolha, NÃO (o fecho é o de
  //     aquisição — o cliente já decidiu; não se pergunta por mais fotos/opções).
  const mais =
    args.temEscolha !== true && args.temMaisOpcoes === true
      ? `\n\n${
          args.outrosNoValor === true
            ? perguntaDeOutrosNoValor({ modelo: args.modeloCitado ?? null, variacao: v })
            : perguntaDeMaisOpcoes({ modeloCitado: args.modeloCitado ?? null, variacao: v })
        }`
      : '';
  corpo = corpo === '' ? `${pergunta}${mais}` : `${corpo}\n\n${pergunta}${mais}`;

  return { corpo, ajustado: true };
}
