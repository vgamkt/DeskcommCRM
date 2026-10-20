/**
 * Ponto `cpf` da JEV — decide o que o cliente fez no turno de CONFIRMAÇÃO
 * do CPF. O motor reformatou o CPF entendido e perguntou “é esse mesmo?”.
 *
 * A JEV lê a mensagem + o candidato e escolhe:
 *   - confirmou: sim, é esse, isso, correto, pode, exato…
 *   - corrigiu: o cliente mandou OUTRO CPF / outros dígitos;
 *   - negou: não, errado, não é esse;
 *   - outro: falou de outra coisa / não deu para saber.
 *
 * O motor só executa: grava o candidato confirmado, atualiza o candidato ou
 * limpa a confirmação. Nada de regex decidindo o CPF.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export type DecisaoCpfJev = 'confirmou' | 'corrigiu' | 'negou' | 'outro';

export interface ContextoDeCpf {
  mensagem: string;
  candidato: string;
  formatado: string;
  motivo: string;
}

export function perguntaDeDecisaoCpf(ctx: ContextoDeCpf): PerguntasDeJev {
  return {
    cpf: {
      type: 'choice',
      instructions:
        'O cliente está respondendo à confirmação do CPF que o sistema reformatou. ' +
        `Candidato: "${ctx.formatado}" (motivo de ter pedido confirmação: ${ctx.motivo}). ` +
        `Mensagem do cliente: "${ctx.mensagem}". ` +
        'Decida: "confirmou" quando ele diz que sim/é esse/isso/correto/pode/exato (mesmo com o CPF citado igual); ' +
        '"corrigiu" quando ele manda OUTRO CPF ou outros dígitos/diz que o certo é outro número; ' +
        '"negou" quando ele diz que não/errado/não é esse e NÃO manda um número novo; ' +
        '"outro" quando fala de outra coisa ou não dá para saber. ' +
        'Entenda a intenção, não a palavra exata.',
      criteria: {
        confirmou: 'sim, é esse mesmo / correto / pode / exato',
        corrigiu: 'o cliente mandou outro CPF ou outros dígitos / o certo é outro número',
        negou: 'não / errado / não é esse, sem mandar outro número',
        outro: 'falou de outra coisa / não deu para saber',
      },
    },
  };
}

export function decisaoCpfDaJev(respostas: RespostasDeJev): DecisaoCpfJev {
  const r = respostas.cpf;
  const c = r?.type === 'choice' ? r.choice : null;
  return c === 'confirmou' || c === 'corrigiu' || c === 'negou' ? c : 'outro';
}
