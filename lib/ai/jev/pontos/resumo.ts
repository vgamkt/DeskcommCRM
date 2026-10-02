/**
 * Mapeamento do ponto `flow_summary` para a Jev.
 *
 * O QUE A JEV DECIDE: QUAIS campos respondidos do fluxo são os ESSENCIAIS e devem
 * entrar na síntese (o próximo passo da venda não pode perdê-los). Ela não escreve
 * o texto — isso é do chat. Ela só escolhe o que NÃO pode faltar, para a síntese
 * ficar certeira.
 *
 * Módulo PURO (sem env, sem rede) para ser testável isolado.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

const LIMIAR_NOUL = 0.5;

/** Um campo respondido do fluxo, candidato a entrar na síntese. */
export interface CampoParaResumo {
  key: string;
  label: string;
  valor: string;
}

/** Monta as perguntas da Jev: `essencial_<i>` (noul) por campo. */
export function perguntasDeResumoDeJev(campos: readonly CampoParaResumo[]): PerguntasDeJev {
  const perguntas: PerguntasDeJev = {};
  campos.slice(0, 30).forEach((c, i) => {
    perguntas[`essencial_${i}`] = {
      type: 'noul',
      instructions:
        `O dado "${c.label} = ${c.valor}" é ESSENCIAL para o próximo passo da venda? ` +
        `Marque SIM para o que o atendimento seguinte NÃO pode perder (o que o cliente ` +
        `quer, condição, dado do veículo). Marque NÃO para detalhes acessórios.`,
    };
  });
  return perguntas;
}

/** Converte as respostas da Jev nas KEYS dos campos essenciais. */
export function camposEssenciaisDaJev(
  respostas: RespostasDeJev,
  campos: readonly CampoParaResumo[],
): string[] {
  const out: string[] = [];
  campos.slice(0, 30).forEach((c, i) => {
    const a = respostas[`essencial_${i}`];
    if (a?.type === 'noul' && typeof a.noul === 'number' && a.noul > LIMIAR_NOUL) {
      out.push(c.key);
    }
  });
  return out;
}
