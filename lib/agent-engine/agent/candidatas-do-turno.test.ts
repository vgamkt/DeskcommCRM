import { describe, expect, it } from 'vitest';

import { renderCandidatasDoTurno } from './candidatas-do-turno';

describe('renderCandidatasDoTurno', () => {
  it('vazio sem candidatas (zero token)', () => {
    expect(renderCandidatasDoTurno([])).toBe('');
  });

  it('lista as motos reais com detalhes e a instrução de não inventar', () => {
    const bloco = renderCandidatasDoTurno([
      { nome: 'CB 300 F Twister', ano: '2025', cor: 'Vermelho', preco: 'R$ 25.000', fotos: [] },
      { nome: 'CG 160 Fan', fotos: [] },
    ]);
    expect(bloco).toContain('## Candidatas já buscadas');
    expect(bloco).toContain('- CB 300 F Twister (2025 | Vermelho | R$ 25.000)');
    expect(bloco).toContain('- CG 160 Fan');
    expect(bloco).toContain('NÃO invente motos');
  });
});
