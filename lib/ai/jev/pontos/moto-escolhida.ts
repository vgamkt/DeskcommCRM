/**
 * Mapeamento do ponto de ESCOLHA da moto para a Jev (Fase 7).
 *
 * O matcher determinístico (`motoEscolhidaPeloCliente`) só devolve a moto quando
 * há UMA clara; em ambiguidade, fica `undefined` (nunca chuta). Aqui a Jev é o
 * DESEMPATE: entre as candidatas, qual o cliente escolheu? A opção "nenhuma"
 * existe de propósito — pergunta/objeção/sem escolha NÃO é escolha.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export const MOTO_NENHUMA = 'nenhuma';

/** Pergunta `choice` da Jev: qual candidata o cliente escolheu (ou nenhuma). */
export function perguntaDeMotoEscolhidaJev(nomes: readonly string[]): PerguntasDeJev {
  const criteria: Record<string, string> = {
    [MOTO_NENHUMA]: 'o cliente NÃO escolheu nenhuma (pergunta, objeção ou sem escolha)',
  };
  for (const nome of nomes) {
    criteria[nome] = 'o cliente ESCOLHEU/gostou desta moto';
  }
  return {
    moto: {
      type: 'choice',
      instructions:
        'Dentre as motos abaixo, qual o cliente ESCOLHEU/gostou nesta mensagem? Só marque uma moto se ' +
        'o cliente demonstrou a escolha ("gostei dessa", "quero essa", "essa mesmo"). Se foi pergunta, ' +
        'objeção ou não houve escolha, responda "nenhuma". ' +
        'AMBIGUIDADE: se a mensagem aponta para MAIS DE UMA moto da lista — ex.: o cliente diz "gostei da ' +
        '300" e há DUAS 300 (CB 300 R e CB 300 R FLEX), ou "a preta" quando há várias pretas — responda ' +
        '"nenhuma". NÃO escolha uma no lugar dele: é ambíguo e o sistema vai PERGUNTAR qual ele quer. ' +
        'Só marque uma moto quando a mensagem apontar para UMA só (nome/versão específicos ou citação única).',
      criteria,
    },
  };
}

/** Nome da moto escolhida pela Jev; `null` = "nenhuma"/ausente. */
export function motoEscolhidaDaRespostaDeJev(respostas: RespostasDeJev): string | null {
  const a = respostas.moto;
  if (!a || a.type !== 'choice' || typeof a.choice !== 'string') return null;
  const escolhido = a.choice.trim();
  if (escolhido === '' || escolhido.toLowerCase() === MOTO_NENHUMA) return null;
  return escolhido;
}
