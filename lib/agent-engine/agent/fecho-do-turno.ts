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
import { perguntaDeAquisicao, perguntaDeEscolha } from './mais-opcoes';

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
  const pergunta = args.temEscolha === true
    ? perguntaDeAquisicao({ variacao: args.variacao ?? 0 })
    : perguntaDeEscolha({ variacao: args.variacao ?? 0 });
  corpo = corpo === '' ? pergunta : `${corpo}\n\n${pergunta}`;

  return { corpo, ajustado: true };
}
