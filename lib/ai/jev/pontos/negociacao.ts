/**
 * Mapeamento do ponto `negociacao` para a Jev — a AÇÃO do turno na objeção.
 *
 * A REGRA (dono, 2026-10-03): TRÊS tentativas de convencer; a pergunta ("posso
 * mostrar outras opções?") sai JUNTO da 3ª. Confirmou → mostra; negou → encaminha
 * e encerra a objeção (mas o bot SEGUE atendendo). Mudou o tipo → reinicia.
 * Nunca ferir regra (desconto/promessa) → handoff.
 *
 * A Jev conta/analisa (recebe `attempts` do banco); o GLM só redige.
 * Módulo PURO (sem env, sem rede).
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export type AcaoNegociacao =
  | 'persuadir_1'
  | 'persuadir_2'
  | 'persuadir_3_e_perguntar'
  | 'mostrar_opcoes'
  | 'encaminhar_e_encerrar'
  | 'handoff';

const ACOES: readonly AcaoNegociacao[] = [
  'persuadir_1',
  'persuadir_2',
  'persuadir_3_e_perguntar',
  'mostrar_opcoes',
  'encaminhar_e_encerrar',
  'handoff',
];

export interface ContextoDeNegociacao {
  /** Tipo da objeção corrente. */
  motivo: 'preco' | 'km' | 'ano' | 'outro';
  /** Quantas tentativas de convencer JÁ foram feitas (do banco). */
  attempts: number;
  /** Estávamos aguardando a resposta à pergunta da 3ª e o cliente CONFIRMOU? */
  confirmou: boolean;
  /** Estávamos aguardando e o cliente NEGOU? */
  negou: boolean;
  /** Insistiu em DESCONTO (regra proibida)? */
  desconto: boolean;
}

/** Monta as perguntas da Jev: `acao` (choice) + `pedir_valor` (noul, se preço). */
export function perguntaDeNegociacaoJev(ctx: ContextoDeNegociacao): PerguntasDeJev {
  const perguntas: PerguntasDeJev = {
    acao: {
      type: 'choice',
      instructions:
        `Objeção de ${ctx.motivo}. Esta é a tentativa Nº ${ctx.attempts + 1} de CONVENCER ` +
        `(já foram feitas ${ctx.attempts}). ` +
        (ctx.negou
          ? 'O cliente NEGOU a oferta de ver outras opções — escolha "encaminhar_e_encerrar".'
          : ctx.confirmou
            ? 'O cliente CONFIRMOU que quer ver outras opções — escolha "mostrar_opcoes".'
            : ctx.desconto
              ? 'O cliente pediu DESCONTO (regra proibida) — escolha "handoff".'
              : 'Escolha a ação certa para ESTA tentativa:') +
        ' Regras: tentativa 1 → persuadir_1; tentativa 2 → persuadir_2; tentativa 3 → ' +
        'persuadir_3_e_perguntar (convencer E perguntar). NUNCA pule etapas.',
      criteria: {
        persuadir_1: '1ª tentativa de convencer: justificar com dados reais; NÃO oferecer motos',
        persuadir_2: '2ª tentativa de convencer: ângulo diferente; NÃO oferecer motos',
        persuadir_3_e_perguntar:
          '3ª tentativa: convencer E, na MESMA mensagem, avisar o responsável + perguntar se pode mostrar opções',
        mostrar_opcoes: 'o cliente confirmou: mostrar opções que atacam o motivo',
        encaminhar_e_encerrar:
          'o cliente negou: enviar mensagem de encaminhamento e encerrar a objeção (seguir atendendo)',
        handoff: 'insistiu em desconto/regra proibida: encaminhar sem prometer',
      },
    },
  };
  if (ctx.motivo === 'preco' && !ctx.confirmou && !ctx.negou) {
    perguntas.pedir_valor = {
      type: 'noul',
      instructions: 'Este turno deve PEDIR ao cliente o valor que ele tem em mente?',
    };
  }
  return perguntas;
}

export function acaoDaNegociacaoJev(
  respostas: RespostasDeJev,
): { acao: AcaoNegociacao; pedirValor: boolean } {
  const a = respostas.acao;
  const acao =
    a?.type === 'choice' && (ACOES as readonly string[]).includes(a.choice)
      ? (a.choice as AcaoNegociacao)
      : 'persuadir_1';
  const pv = respostas.pedir_valor;
  const pedirValor = pv?.type === 'noul' && typeof pv.noul === 'number' && pv.noul > 0.5;
  return { acao, pedirValor };
}

/** Só a ação `mostrar_opcoes` autoriza enviar motos. */
export function ofereceMotosPorAcao(acao: AcaoNegociacao): boolean {
  return acao === 'mostrar_opcoes';
}
