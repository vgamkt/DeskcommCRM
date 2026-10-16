import { describe, expect, it } from 'vitest';

import {
  introducaoFactualDaApresentacao,
  nomeCurtoDoModelo,
  perguntaDeMaisOpcoes,
  perguntaDeOutrosNoModelo,
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

describe('fechamento por MODELO ESPECÍFICO (dono, 2026-10-16)', () => {
  it('nomeCurtoDoModelo tira marca, versão e ano', () => {
    expect(nomeCurtoDoModelo('HONDA Biz 125 FLEX 2021')).toBe('Biz 125');
    expect(nomeCurtoDoModelo('YAMAHA Factor 150 ED')).toBe('Factor 150');
  });

  it('perguntaDeOutrosNoModelo cita o modelo, a categoria e termina em pergunta', () => {
    const p = perguntaDeOutrosNoModelo({ modelo: 'Biz 125', categoria: 'Scooter', variacao: 0 });
    expect(p).toContain('Biz 125');
    expect(p).toMatch(/Scooter/);
    expect(p).toMatch(/\?/);
  });

  it('varia e nunca fica vazio', () => {
    for (let i = 0; i < 5; i++) {
      expect(perguntaDeOutrosNoModelo({ modelo: 'Biz 125', categoria: 'Scooter', variacao: i })).not.toBe('');
    }
  });
});

describe('introducaoFactualDaApresentacao (ESCOPO 12)', () => {
  it('conta a quantidade REAL de opções que vão sair', () => {
    expect(introducaoFactualDaApresentacao(1, { variacao: 0 })).toMatch(/essa/i);
    expect(introducaoFactualDaApresentacao(2, { variacao: 0 })).toContain('2 opções');
    expect(introducaoFactualDaApresentacao(3, { variacao: 0 })).toContain('3 opções');
  });

  it('personaliza com o nome do cliente', () => {
    expect(introducaoFactualDaApresentacao(2, { nome: 'Vander', variacao: 0 })).toContain('Vander');
    expect(introducaoFactualDaApresentacao(1, { nome: 'Vander', variacao: 0 })).toContain('Vander');
  });

  it('VARIA (não repete a mesma abertura)', () => {
    const a = introducaoFactualDaApresentacao(3, { variacao: 0 });
    const b = introducaoFactualDaApresentacao(3, { variacao: 1 });
    const c = introducaoFactualDaApresentacao(3, { variacao: 2 });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('não afirma faixa/valores (só a contagem)', () => {
    for (let i = 0; i < 5; i++) {
      expect(introducaoFactualDaApresentacao(3, { variacao: i })).not.toMatch(/R\$|mil|faixa|valor/i);
    }
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
