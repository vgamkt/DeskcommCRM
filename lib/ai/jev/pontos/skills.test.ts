import { describe, expect, it } from 'vitest';

import { perguntasDeSkillsDeJev, skillsEscolhidasDaJev, type SkillParaJev } from './skills';
import type { RespostasDeJev } from '../tipos';

const skills: SkillParaJev[] = [
  { name: 'objecao-preco', description: 'contorna objeção de preço', keywords: ['caro', 'preço'] },
  { name: 'financiamento', description: 'simula financiamento', keywords: ['financiar', 'parcela'] },
  { name: 'troca', description: 'avalia troca', keywords: ['troca', 'dar a moto'] },
];

describe('skills Jev', () => {
  it('cria usar_<i> por skill e lê os nomes escolhidos', () => {
    const q = perguntasDeSkillsDeJev(skills);
    expect(Object.keys(q)).toEqual(['usar_0', 'usar_1', 'usar_2']);
    const r: RespostasDeJev = {
      usar_0: { type: 'noul', noul: 0.9 },
      usar_1: { type: 'noul', noul: 0.2 },
      usar_2: { type: 'noul', noul: 0.8 },
    };
    expect(skillsEscolhidasDaJev(r, skills)).toEqual(['objecao-preco', 'troca']);
  });

  it('sem skills → sem perguntas', () => {
    expect(Object.keys(perguntasDeSkillsDeJev([]))).toEqual([]);
    expect(skillsEscolhidasDaJev({}, [])).toEqual([]);
  });
});
