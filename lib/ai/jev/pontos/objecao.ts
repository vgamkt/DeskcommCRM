/**
 * Mapeamento do ponto `objecao` para a Jev — a EXISTÊNCIA e o TIPO da objeção.
 *
 * Doutrina "a Jev decide sempre": a Jev é a autora da decisão de *é objeção?* e
 * *qual o tipo?*. O regex `ehObjecaoValor`/`motivoDaObjecao` (em
 * `lib/agent-engine/agent/objecao-de-valor.ts`) é apenas FALLBACK, acionado quando
 * este ponto está desligado/indisponível (`null`). Nunca o antecede nem o corrige.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

/** O TIPO da objeção — espelha `MotivoObjecao` do motor (a contagem é por tipo). */
export type MotivoDeObjecao = 'preco' | 'km' | 'ano' | 'outro';

const MOTIVOS: readonly MotivoDeObjecao[] = ['preco', 'km', 'ano', 'outro'];

export interface ContextoDeObjecao {
  /** Mensagem do cliente neste turno. */
  mensagem: string;
  /** Tipo da objeção ANTERIOR (do banco) — ajuda a reconhecer a insistência. */
  motivoAnterior: MotivoDeObjecao | null;
  /** Já há moto apresentada/em foco? A objeção é sobre a moto mostrada. */
  temMotoEmFoco: boolean;
}

export interface VereditoDeObjecao {
  ehObjecao: boolean;
  /** Só faz sentido quando `ehObjecao`; `null` caso contrário. */
  motivo: MotivoDeObjecao | null;
}

/** Monta as perguntas da Jev: `eh_objecao` (noul) + `motivo` (choice). */
export function perguntaDeObjecaoJev(ctx: ContextoDeObjecao): PerguntasDeJev {
  return {
    eh_objecao: {
      type: 'noul',
      instructions:
        `Mensagem do cliente: "${ctx.mensagem}". ` +
        (ctx.motivoAnterior !== null
          ? `Ele já fez uma objeção do tipo "${ctx.motivoAnterior}" antes. `
          : '') +
        (ctx.temMotoEmFoco ? 'Há uma moto apresentada na conversa. ' : '') +
        'A mensagem é uma OBJEÇÃO sobre o VALOR/qualidade/condição da moto — ' +
        'reclamação de preço ("achei caro", "acima do que posso pagar", "muito rodada") ' +
        'ou insistência nela? Responda sim SÓ quando houver questionamento do que já foi ' +
        'mostrado/negociado. ' +
        'NÃO é objeção: pedir algo DIFERENTE ("quero outra cor", "tem outra moto?"), ' +
        'pergunta neutra, cumprimento, ou resposta a um dado.',
    },
    motivo: {
      type: 'choice',
      instructions:
        'Se for objeção, qual o TIPO dela? preco = valor/preço/parcela/desconto/condição/orçamento; ' +
        'km = rodagem/quilometragem; ano = moto antiga/velha/modelo; outro = qualquer outra. ' +
        'Se NÃO for objeção, escolha "outro" (será ignorado).',
      criteria: {
        preco: 'valor, preço, parcela, desconto, condição de pagamento, orçamento',
        km: 'rodagem alta, quilometragem',
        ano: 'moto antiga/velha, ano do modelo',
        outro: 'não é objeção, ou é uma objeção que não é preço/km/ano',
      },
    },
  };
}

/** Lê o veredito: `ehObjecao` (noul > 0.5) e o `motivo` (choice válido). */
export function vereditoDeObjecaoDaJev(respostas: RespostasDeJev): VereditoDeObjecao {
  const eo = respostas.eh_objecao;
  const ehObjecao = eo?.type === 'noul' && typeof eo.noul === 'number' && eo.noul > 0.5;
  if (!ehObjecao) return { ehObjecao: false, motivo: null };
  const m = respostas.motivo;
  const motivo =
    m?.type === 'choice' && (MOTIVOS as readonly string[]).includes(m.choice)
      ? (m.choice as MotivoDeObjecao)
      : 'outro';
  return { ehObjecao: true, motivo };
}
