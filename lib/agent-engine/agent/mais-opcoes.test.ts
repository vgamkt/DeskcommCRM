import { describe, expect, it } from 'vitest';

import {
  introducaoFactualDaApresentacao,
  perguntaDeMaisOpcoes,
  perguntaDeOutrosNoValor,
} from './mais-opcoes';

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

describe('introducaoFactualDaApresentacao (ESCOPO 12)', () => {
  it('conta a quantidade REAL de opções que vão sair', () => {
    expect(introducaoFactualDaApresentacao(1)).toMatch(/essa opção/i);
    expect(introducaoFactualDaApresentacao(1)).not.toMatch(/\bopções\b/);
    expect(introducaoFactualDaApresentacao(2)).toContain('2 opções');
    expect(introducaoFactualDaApresentacao(5)).toContain('5 opções');
  });

  it('não afirma faixa/valores (só a contagem)', () => {
    const t = introducaoFactualDaApresentacao(3);
    expect(t).not.toMatch(/R\$|mil|faixa|valor/i);
  });
});

describe('perguntaDeOutrosNoValor (ESCOPO 9)', () => {
  it('fala de "outros modelos nesse valor" e termina em pergunta', () => {
    const p = perguntaDeOutrosNoValor({ variacao: 0 });
    expect(p).toMatch(/outros modelos/);
    expect(p).toMatch(/nesse (mesmo )?valor|nessa (mesma )?faixa/i);
    expect(p).toMatch(/\?/);
  });

  it('com modelo em foco, cita o modelo', () => {
    const p = perguntaDeOutrosNoValor({ modelo: 'CB 300', variacao: 0 });
    expect(p).toContain('CB 300');
  });

  it('varia e nunca fica vazio', () => {
    for (let i = 0; i < 8; i++) expect(perguntaDeOutrosNoValor({ variacao: i })).not.toBe('');
  });
});
