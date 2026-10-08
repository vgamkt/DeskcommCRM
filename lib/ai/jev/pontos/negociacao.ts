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
  | 'handoff'
  /** O cliente NÃO respondeu à pergunta pendente (falou de outro assunto): nada a fazer. */
  | 'nenhuma';

const ACOES: readonly AcaoNegociacao[] = [
  'persuadir_1',
  'persuadir_2',
  'persuadir_3_e_perguntar',
  'mostrar_opcoes',
  'encaminhar_e_encerrar',
  'handoff',
  'nenhuma',
];

export interface ContextoDeNegociacao {
  /** Tipo da objeção corrente. */
  motivo: 'preco' | 'km' | 'ano' | 'outro';
  /** Quantas tentativas de convencer JÁ foram feitas (do banco). */
  attempts: number;
  /**
   * A pergunta da 3ª ("é só essa ou posso mostrar outras?") está PENDENTE — o
   * bot já a fez e ainda não recebeu resposta.
   */
  aguardandoConfirmacao: boolean;
  /**
   * A MENSAGEM do cliente. A Jev decide a partir dela se o cliente RESPONDEU à
   * pergunta pendente (sim/não) ou falou de OUTRO assunto — sem regex adivinhando
   * "sim" no meio de outra frase (decisão do dono, 2026-10-08).
   */
  mensagem: string;
  /** Insistiu em DESCONTO (regra proibida)? */
  desconto: boolean;
}

/** Bloco de instrução comum às duas variantes (individual e auto-contida). */
function instrucoesDaAcao(ctx: {
  attempts: number;
  aguardandoConfirmacao: boolean;
  desconto: boolean;
}): string {
  if (ctx.aguardandoConfirmacao) {
    return (
      'Havia uma PERGUNTA PENDENTE feita ao cliente: "é só essa moto ou posso mostrar outras ' +
      'parecidas?". Analise a MENSAGEM DO CLIENTE (no state) e escolha: ' +
      '(a) ele RESPONDEU que QUER ver outras opções → "mostrar_opcoes"; ' +
      '(b) ele RESPONDEU que é SÓ essa / não quer outras → "encaminhar_e_encerrar"; ' +
      '(c) ele falou de OUTRO assunto (não respondeu à pergunta) → "nenhuma". ' +
      'ATENÇÃO: um "sim"/"ok" que pertence a OUTRA frase (ex.: "tenho CNH sim", "moro em X, sim") ' +
      'NÃO é resposta à pergunta — nesse caso escolha "nenhuma".'
    );
  }
  if (ctx.desconto) {
    return 'O cliente pediu DESCONTO (regra proibida) — escolha "handoff".';
  }
  return 'Escolha a ação certa para ESTA tentativa.';
}

/** Monta as perguntas da Jev: `acao` (choice) + `pedir_valor` (noul, se preço). */
export function perguntaDeNegociacaoJev(ctx: ContextoDeNegociacao): PerguntasDeJev {
  const perguntas: PerguntasDeJev = {
    acao: {
      type: 'choice',
      instructions:
        `Objeção de ${ctx.motivo}. Esta é a tentativa Nº ${ctx.attempts + 1} de CONVENCER ` +
        `(já foram feitas ${ctx.attempts}). ` +
        instrucoesDaAcao(ctx) +
        ' Regras (só quando NÃO há pergunta pendente): tentativa 1 → persuadir_1; tentativa 2 → ' +
        'persuadir_2; tentativa 3 → persuadir_3_e_perguntar (convencer E perguntar). NUNCA pule etapas.',
      criteria: {
        persuadir_1: '1ª tentativa de convencer: justificar com dados reais; NÃO oferecer motos',
        persuadir_2: '2ª tentativa de convencer: ângulo diferente; NÃO oferecer motos',
        persuadir_3_e_perguntar:
          '3ª tentativa: convencer E, na MESMA mensagem, avisar o responsável + perguntar se pode mostrar opções',
        mostrar_opcoes: 'o cliente confirmou: mostrar opções que atacam o motivo',
        encaminhar_e_encerrar:
          'o cliente negou: enviar mensagem de encaminhamento e encerrar a objeção (seguir atendendo)',
        handoff: 'insistiu em desconto/regra proibida: encaminhar sem prometer',
        nenhuma:
          'o cliente NÃO respondeu à pergunta pendente (falou de outro assunto): não fazer nada agora',
      },
    },
  };
  if (ctx.motivo === 'preco' && !ctx.aguardandoConfirmacao) {
    perguntas.pedir_valor = {
      type: 'noul',
      instructions: 'Este turno deve PEDIR ao cliente o valor que ele tem em mente?',
    };
  }
  return perguntas;
}

/**
 * Versão AUTO-CONTIDA (Fase 4 — Árbitro): a pergunta NÃO embute o `motivo`; o TIPO é
 * o que a própria Jev decidiu na pergunta `motivo` do ponto `objecao`, NA MESMA
 * chamada. A contagem de tentativas vem da PERSISTÊNCIA (`tentativasAnterior`) e a
 * REGRA DE REINÍCIO por troca de tipo vai nas instruções — medido ao vivo
 * (2026-10-07): com o motivo persistido embutido, a Jev degradava a ação
 * (`persuadir_1` no lugar de `persuadir_2`); sem embutir, reproduz o individual.
 */
export interface ContextoDeNegociacaoAutoContida {
  /** Tentativas já feitas para a objeção do tipo `motivoAnterior`. */
  tentativasAnterior: number;
  /** Tipo da objeção ANTERIOR (persistida) — base da regra de reinício. */
  motivoAnterior: 'preco' | 'km' | 'ano' | 'outro' | null;
  /** A pergunta da 3ª ("é só essa ou posso mostrar outras?") está PENDENTE? */
  aguardandoConfirmacao: boolean;
  /** A MENSAGEM do cliente — a Jev decide a partir dela (sem regex). */
  mensagem: string;
  /** Insistiu em DESCONTO (regra proibida)? */
  desconto: boolean;
}

export function perguntaDeNegociacaoAutoContida(
  ctx: ContextoDeNegociacaoAutoContida,
): PerguntasDeJev {
  const anterior = ctx.motivoAnterior ?? 'nenhum';
  return {
    acao: {
      type: 'choice',
      instructions:
        `Decida a AÇÃO da negociação para a objeção DESTA mensagem — o TIPO dela é o que você ` +
        `decidiu na pergunta "motivo" do ponto "objecao" (mesma chamada). Já foram feitas ` +
        `${ctx.tentativasAnterior} tentativa(s) para a objeção do tipo "${anterior}". Se o tipo ` +
        `desta objeção for IGUAL a "${anterior}", esta é a tentativa Nº ${ctx.tentativasAnterior + 1}; ` +
        `se for um tipo NOVO, RECOMECE na tentativa Nº 1. ` +
        instrucoesDaAcao({
          attempts: ctx.tentativasAnterior,
          aguardandoConfirmacao: ctx.aguardandoConfirmacao,
          desconto: ctx.desconto,
        }) +
        ' Regras (só quando NÃO há pergunta pendente): tentativa 1 → persuadir_1; tentativa 2 → ' +
        'persuadir_2; tentativa 3 → persuadir_3_e_perguntar (convencer E perguntar). NUNCA pule etapas.',
      criteria: {
        persuadir_1: '1ª tentativa de convencer: justificar com dados reais; NÃO oferecer motos',
        persuadir_2: '2ª tentativa de convencer: ângulo diferente; NÃO oferecer motos',
        persuadir_3_e_perguntar:
          '3ª tentativa: convencer E, na MESMA mensagem, avisar o responsável + perguntar se pode mostrar opções',
        mostrar_opcoes: 'o cliente confirmou: mostrar opções que atacam o motivo',
        encaminhar_e_encerrar:
          'o cliente negou: enviar mensagem de encaminhamento e encerrar a objeção (seguir atendendo)',
        handoff: 'insistiu em desconto/regra proibida: encaminhar sem prometer',
        nenhuma:
          'o cliente NÃO respondeu à pergunta pendente (falou de outro assunto): não fazer nada agora',
      },
    },
    pedir_valor: {
      type: 'noul',
      instructions:
        'SOMENTE se a objeção identificada (o tipo decidido em "objecao") for de PREÇO E não houver ' +
        'pergunta pendente: este turno deve PEDIR ao cliente o valor que ele tem em mente? Fora disso, ' +
        'responda 0.',
    },
  };
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
