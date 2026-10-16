import { describe, expect, it } from 'vitest';

import {
  comQuantidadeNoTexto,
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

  it('perguntaDeOutrosNoModelo (1 moto) cita o modelo, é singular e termina em pergunta', () => {
    const p = perguntaDeOutrosNoModelo({ modelo: 'Biz 125', categoria: 'Scooter', variacao: 0 });
    expect(p).toContain('Biz 125');
    expect(p).toMatch(/\?/);
    // 1 moto NUNCA usa "qual delas/alguma delas".
    expect(p).not.toMatch(/qual delas|alguma delas/i);
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

describe('comQuantidadeNoTexto (quantificação na apresentação)', () => {
  it('troca o termo genérico pelo NÚMERO real, sem apagar a saudação', () => {
    const t = comQuantidadeNoTexto(
      'Bom dia! Sou a Marcela. Separei as opções de trail que tenho, dá uma olhada:',
      5,
    );
    expect(t).toContain('5 opções');
    expect(t).not.toContain('as opções');
    expect(t).toContain('Bom dia! Sou a Marcela'); // saudação preservada
  });

  it('troca "essas motos"/"algumas alternativas" pelo número', () => {
    expect(comQuantidadeNoTexto('Olha essas motos que separei:', 3)).toContain('3 motos');
    expect(comQuantidadeNoTexto('Veja algumas alternativas:', 4)).toContain('4 alternativas');
  });

  it('troca número por extenso ("duas opções") pelo número real', () => {
    const t = comQuantidadeNoTexto('Separei duas opções do nosso estoque que caem bem:', 5);
    expect(t).toContain('5 opções');
    expect(t).not.toContain('duas');
  });

  it('troca "várias opções" (quantificador) pelo número real', () => {
    const t = comQuantidadeNoTexto('Tenho várias opções dentro do seu valor até 30 mil.', 5);
    expect(t).toContain('5 opções');
    expect(t).not.toContain('várias opções');
  });

  it('NÃO mexe no "Motos" do nome da loja (Valle Motos)', () => {
    const t = comQuantidadeNoTexto(
      'Bom dia! Sou a Marcela, da Valle Motos São José. Tenho várias opções até 30 mil.',
      5,
    );
    expect(t).toContain('Valle Motos São José');
    expect(t).not.toMatch(/Valle \d+ Motos/);
    expect(t).toContain('5 opções');
  });

  it('NÃO mexe quando já há contagem no texto', () => {
    const t = 'Separei 5 opções pra você:';
    expect(comQuantidadeNoTexto(t, 5)).toBe(t);
  });

  it('quantidade < 2 não altera', () => {
    const t = 'As opções que separei:';
    expect(comQuantidadeNoTexto(t, 1)).toBe(t);
  });

  it('sem termo natural: prepende a abertura factual', () => {
    const t = comQuantidadeNoTexto('Dá uma olhada no que separei:', 3);
    expect(t).toContain('3 opções');
  });

  it('sem termo e COM saudação: não empilha abertura factual', () => {
    const t = comQuantidadeNoTexto('Bom dia! Dá uma olhada no que separei:', 3);
    expect(t).toBe('Bom dia! Dá uma olhada no que separei:');
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
