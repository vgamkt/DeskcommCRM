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
    [MOTO_NENHUMA]: 'o cliente NÃO escolheu nenhuma (pergunta/objeção SEM escolha, ou sem alvo)',
  };
  for (const nome of nomes) {
    criteria[nome] = 'o cliente ESCOLHEU/gostou desta moto';
  }
  return {
    moto: {
      type: 'choice',
      instructions:
        'Dentre as motos abaixo, qual o cliente ESCOLHEU/gostou nesta mensagem? ' +
        // SEM REFERÊNCIA (substitui o gate determinístico `temReferenciaAMoto`): sem alvo, NÃO é escolha.
        'SEM REFERÊNCIA: se a mensagem NÃO fala de nenhuma moto da lista (é cidade, um dado do ' +
        'cadastro, saudação, "ok", agradecimento, ou afirmação vaga sem alvo) → responda "nenhuma". ' +
        // Medido 2026-10-21: a saída da LOJA citava a moto ("Anotei, Vander. A CG 160 Fan...")
        // e a Jev usou isso para "escolher" a moto numa mensagem que era só "Sao paulo".
        '⚠️ O campo `modelo` é o texto que a LOJA vai enviar: ele NÃO cria escolha sozinho. Ele só ' +
        'pode DESAMBIGUAR qual moto quando a MENSAGEM DO CLIENTE já é uma escolha/deíctica ("gostei ' +
        'dessa", "essa", "quero essa", "pode ser essa") — aí use o que o `modelo` está apresentando ' +
        'para saber QUAL delas. Se a mensagem do cliente NÃO tem sinal de escolha (cidade, nome, CNH, ' +
        'CPF, data, saudação, resposta de fluxo), responda "nenhuma", MESMO que `modelo` cite uma ' +
        'moto. ' +
        'Só marque uma moto se o cliente demonstrou a escolha por ELA ("gostei dessa", "quero essa", ' +
        '"essa mesmo"). Se foi SÓ pergunta ou SÓ objeção (sem citar/escolher uma moto), responda ' +
        '"nenhuma". ' +
        // Medido 2026-10-22: "Gostei da CB 300 R 2011, mas achei um pouco caro" caía em "nenhuma"
        // e o álbum da escolhida não saía. A objeção é tratada por OUTRO ponto; ela NÃO anula a escolha.
        'ESCOLHA + OBJEÇÃO JUNTAS = ESCOLHA: se o cliente cita/escolhe uma moto E reclama de ' +
        'preço/ano/km na MESMA frase ("gostei da CB 300 R 2011, mas achei caro", "quero essa, mas tá ' +
        'salgada"), marque a MOTO escolhida — a objeção NÃO anula a escolha. ' +
        'Pergunta com sinal positivo ("quero a X, quanto fica?") também é escolha. ' +
        // ÚNICA EM FOCO (NOVA, medida na sonda): 1 candidata + interesse, mesmo sem nomear.
        'ÚNICA EM FOCO: se a lista tem UMA SÓ moto e o cliente demonstra interesse/afirmação por ela — ' +
        'MESMO SEM NOMEAR ("gostei dela", "me interessei", "essa", "curti", "quero ver de perto") — ' +
        'marque ESSA (não há outra candidata). ' +
        'Use TODOS os dados de cada candidata (nome, ANO, COR, cilindrada…) para casar com o que o ' +
        'cliente disse — o atributo dinâmico pode ser QUALQUER um ("a 2015", "a preta", "a 300 F"). ' +
        'AMBIGUIDADE: se a mensagem aponta para MAIS DE UMA moto da lista — ex.: o cliente diz "gostei da ' +
        '300" e há DUAS 300 (CB 300 R e CB 300 R FLEX), ou "a preta" quando há várias pretas — responda ' +
        '"nenhuma". NÃO escolha uma no lugar dele: é ambíguo e o sistema vai PERGUNTAR qual ele quer. ' +
        'Só marque uma moto quando a mensagem apontar para UMA só (nome/versão/ano/cor específicos, ' +
        'citação única, ou única candidata com interesse).',
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
