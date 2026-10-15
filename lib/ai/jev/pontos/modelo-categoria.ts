/**
 * Ponto `modelo_categoria` da Jev — DEGRAU 2 do "modelo citado".
 *
 * Quando o cliente cita um modelo que NÃO está no estoque e a REFERÊNCIA
 * (`modelos`) não tem a categoria dele, a Jev responde a qual categoria do
 * catálogo o modelo pertence — uma ESCOLHA FECHADA sobre as categorias reais
 * (Scooter, Street, Trail…), nunca texto livre. Módulo PURO.
 */
import type { PerguntasDeJev, RespostasDeJev } from '../tipos';

export const NENHUMA = 'nenhuma';

/** Pergunta `choice` da Jev: a qual categoria o modelo pertence? */
export function perguntaDeCategoriaDeModeloJev(
  categorias: readonly string[],
  modelo: string,
): PerguntasDeJev {
  const criteria: Record<string, string> = {};
  for (const c of categorias) {
    const k = c.trim();
    if (k !== '' && k !== NENHUMA) criteria[k] = k;
  }
  criteria[NENHUMA] = 'não sei / nenhuma das opções';
  return {
    categoria: {
      type: 'choice',
      instructions:
        `A qual CATEGORIA do catálogo o modelo "${modelo}" pertence? Escolha entre as categorias ` +
        `abaixo (só uma). Use seu CONHECIMENTO de modelos de moto — ex.: Honda XRE/NXR/Tornado e ` +
        `Yamaha Lander/Ténéré/XTZ são Trail/On-Off; Honda PCX/Biz e Yamaha Nmax/Burgman são Scooter; ` +
        `Honda CG/Titan/Fan e Yamaha Factor/Fazer são Street; Honda CB e Yamaha MT são Naked/Esportiva. ` +
        `Só escolha "${NENHUMA}" se você REALMENTE não souber a categoria do modelo.`,
      criteria,
    },
  };
}

/** Converte as respostas da Jev na categoria. Ausente/'nenhuma' = null. */
export function categoriaDoModeloDaJev(respostas: RespostasDeJev): { categoria: string | null } {
  const a = respostas.categoria;
  const c = a?.type === 'choice' ? a.choice : null;
  return { categoria: c !== null && c !== NENHUMA && c.trim() !== '' ? c : null };
}
