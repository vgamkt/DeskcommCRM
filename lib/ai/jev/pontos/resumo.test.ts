import { describe, expect, it } from 'vitest';

import {
  camposEssenciaisDaJev,
  perguntasDeResumoDeJev,
  type CampoParaResumo,
} from './resumo';
import type { RespostasDeJev } from '../tipos';

const campos: CampoParaResumo[] = [
  { key: 'moto', label: 'Moto', valor: 'CB 300' },
  { key: 'entrada', label: 'Entrada', valor: '3000' },
  { key: 'cor', label: 'Cor', valor: 'azul' },
];

describe('flow_summary Jev', () => {
  it('cria essencial_<i> e lê os campos essenciais', () => {
    const q = perguntasDeResumoDeJev(campos);
    expect(Object.keys(q)).toEqual(['essencial_0', 'essencial_1', 'essencial_2']);
    const r: RespostasDeJev = {
      essencial_0: { type: 'noul', noul: 0.9 },
      essencial_1: { type: 'noul', noul: 0.85 },
      essencial_2: { type: 'noul', noul: 0.1 },
    };
    expect(camposEssenciaisDaJev(r, campos)).toEqual(['moto', 'entrada']);
  });
});
