/**
 * Mapeamento do ponto `flow_validate` para a Jev.
 *
 * O QUE A JEV DECIDE AQUI: para CADA pergunta do fluxo (pendente, corrigível ou
 * encerrada por não resposta), se a mensagem do cliente a RESPONDEU com o dado
 * específico — e, quando o campo é DISCRETO (sim/não ou escolha), QUAL o valor.
 *
 * POR QUE ASSIM: o validador de chat tinha falso positivo (marcou `cidade`/`cnh`
 * como respondidas numa mensagem de financiamento e o fluxo reperguntava). A Jev
 * olha campo a campo e, quando ninguém foi respondido, o motor NÃO chama o chat
 * nem grava nada — sem repergunta errada. Para campos de TEXTO/NÚMERO/DATA a Jev
 * só FLAGRA "respondeu"; o valor é extraído pelo caminho de sempre (o validador
 * de chat restrito aos campos que a Jev marcou).
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

const LIMIAR_NOUL = 0.5;

/** Opção que representa "não respondeu" nas perguntas de valor. */
export const NAO_RESPOSTA = 'nao_respondeu';

/** O que a Jev precisa de cada campo do fluxo. */
export interface CampoDeFluxoParaJev {
  key: string;
  label: string;
  question?: string | undefined;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options?: string[] | undefined;
}

function alvo(c: CampoDeFluxoParaJev): string {
  return c.question?.trim() || c.label;
}

/** Monta as perguntas da Jev: `respondeu_<key>` + `valor_<key>` nos discretos. */
export function perguntasDeFluxoDeJev(
  campos: readonly CampoDeFluxoParaJev[],
): PerguntasDeJev {
  const perguntas: PerguntasDeJev = {};
  for (const c of campos) {
    perguntas[`respondeu_${c.key}`] = {
      type: 'noul',
      instructions:
        `A mensagem do cliente RESPONDEU à pergunta "${alvo(c)}" trazendo o DADO específico? ` +
        `Intenção genérica ("quero trocar", "tenho interesse") SEM o dado NÃO conta. ` +
        `Considere TODAS as mensagens do cliente, inclusive as enviadas em sequência.`,
    };
    if (c.type === 'boolean') {
      perguntas[`valor_${c.key}`] = {
        type: 'choice',
        instructions: `Qual a resposta do cliente para "${c.label}"?`,
        criteria: {
          [NAO_RESPOSTA]: 'o cliente não respondeu isso',
          sim: 'o cliente respondeu SIM / afirmativo',
          nao: 'o cliente respondeu NÃO / negativo',
        },
      };
    } else if (c.type === 'select' && (c.options?.length ?? 0) > 0) {
      const criteria: Record<string, string> = {
        [NAO_RESPOSTA]: 'o cliente não respondeu isso',
      };
      for (const o of c.options ?? []) criteria[o] = `o cliente escolheu "${o}"`;
      perguntas[`valor_${c.key}`] = {
        type: 'choice',
        instructions: `Qual opção o cliente escolheu para "${c.label}"?`,
        criteria,
      };
    }
  }
  return perguntas;
}

export interface LeituraDeFluxoDaJev {
  /** Chaves que a Jev marcou como respondidas (para restringir a extração de valor). */
  camposRespondidos: string[];
  /** Valores já prontos dos campos DISCRETOS (boolean/select). */
  valores: Record<string, string>;
}

/** Converte as respostas da Jev na leitura do fluxo. */
export function leituraDeFluxoDaJev(
  respostas: RespostasDeJev,
  campos: readonly CampoDeFluxoParaJev[],
): LeituraDeFluxoDaJev {
  const camposRespondidos = new Set<string>();
  const valores: Record<string, string> = {};
  for (const c of campos) {
    const respondeu = respostas[`respondeu_${c.key}`];
    if (respondeu?.type === 'noul' && respondeu.noul > LIMIAR_NOUL) camposRespondidos.add(c.key);
    const v = respostas[`valor_${c.key}`];
    if (v?.type === 'choice' && typeof v.choice === 'string' && v.choice !== NAO_RESPOSTA) {
      camposRespondidos.add(c.key);
      valores[c.key] = v.choice;
    }
  }
  return { camposRespondidos: [...camposRespondidos], valores };
}
