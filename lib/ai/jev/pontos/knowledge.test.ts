import { describe, expect, it } from 'vitest';

import {
  OPCOES_TOP_K,
  perguntasDeConhecimentoDeJev,
  rotaDeConhecimentoDaJev,
  type MaterialParaJev,
} from './knowledge';
import type { RespostasDeJev } from '../tipos';

const materiais: MaterialParaJev[] = [
  { id: 'm1', name: 'Tabela de preços', sourceType: 'pdf' },
  { id: 'm2', name: 'Perguntas frequentes', sourceType: 'texto' },
];

describe('knowledge_route Jev', () => {
  it('cria usar_<i> + topk e lê a rota', () => {
    const q = perguntasDeConhecimentoDeJev(materiais);
    expect(Object.keys(q)).toEqual(['usar_0', 'usar_1', 'topk']);
    const r: RespostasDeJev = {
      usar_0: { type: 'noul', noul: 0.9 },
      usar_1: { type: 'noul', noul: 0.2 },
      topk: { type: 'score', score: 1, confidence: 1 }, // índices 0..3 → OPCOES_TOP_K
    };
    const rota = rotaDeConhecimentoDaJev(r, materiais, 5);
    expect(rota.materialIds).toEqual(['m1']);
    expect(rota.topK).toBe(OPCOES_TOP_K[1]);
  });

  it('sem escolha de material e sem score → topK padrão', () => {
    const rota = rotaDeConhecimentoDaJev({}, materiais, 7);
    expect(rota.materialIds).toEqual([]);
    expect(rota.topK).toBe(7);
  });
});
