import { describe, expect, it } from 'vitest';

import { perguntaDeMaisOpcoes } from './mais-opcoes';

describe('perguntaDeMaisOpcoes', () => {
  it('sem modelo: convite a mais opções, variando', () => {
    const a = perguntaDeMaisOpcoes({ variacao: 0 });
    const b = perguntaDeMaisOpcoes({ variacao: 1 });
    expect(a).toMatch(/\?/);
    expect(b).toMatch(/\?/);
    expect(a).not.toBe(b); // não é a mesma frase sempre
  });

  it('com modelo citado: distingue "esse modelo" de "outras parecidas"', () => {
    const p = perguntaDeMaisOpcoes({ modeloCitado: 'CB 250', variacao: 0 });
    expect(p).toContain('CB 250');
    expect(p.toLowerCase()).toMatch(/parecid|op[çc][õo]es|alternativ/);
  });

  it('gira as variantes e nunca fica vazio', () => {
    for (let i = 0; i < 8; i++) {
      expect(perguntaDeMaisOpcoes({ variacao: i })).not.toBe('');
      expect(perguntaDeMaisOpcoes({ modeloCitado: 'XRE 190', variacao: i })).toContain('XRE 190');
    }
  });
});
