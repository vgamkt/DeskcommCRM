import { describe, expect, it } from 'vitest';

import {
  comQuantidadeNoTexto,
  introducaoFactualDaApresentacao,
  nomeCurtoDoModelo,
  perguntaDeMaisOpcoes,
  perguntaDeOutrosNoModelo,
  perguntaDeOutrosNoValor,
  removerPerguntaDeEscolha,
  semAnuncioDeFotos,
} from './mais-opcoes';

describe('perguntaDeMaisOpcoes', () => {
  it('sem modelo: convite a mais opções, variando', () => {
    const a = perguntaDeMaisOpcoes({ variacao: 0 });
    const b = perguntaDeMaisOpcoes({ variacao: 1 });
    expect(a).toMatch(/\?/);
    expect(b).toMatch(/\?/);
    expect(a).not.toBe(b); // não é a mesma frase sempre
  });

  it('sem modelo: NUNCA fala de outras marcas/fabricantes', () => {
    for (let i = 0; i < 4; i++) {
      expect(perguntaDeMaisOpcoes({ variacao: i })).not.toMatch(
        /outras? marcas?|outras? fabricantes?|outro fabricante|outra marca/i,
      );
    }
  });

  it('com modelo citado: pode oferecer outras fabricantes (pedido específico)', () => {
    for (let i = 0; i < 4; i++) {
      expect(perguntaDeMaisOpcoes({ modeloCitado: 'CB 300', variacao: i })).toMatch(
        /outras? marcas?|outras? fabricantes?|outro fabricante|outra marca/i,
      );
    }
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

  it('SEM modelo citado não duplica "essa" ("é a única essa que tenho")', () => {
    for (let i = 0; i < 4; i++) {
      const p = perguntaDeOutrosNoModelo({ modelo: null, categoria: 'Street', variacao: i });
      expect(p).not.toMatch(/única essa|essa essa|essa\s+essa/i);
      expect(p).toMatch(/\?/);
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
  it('injeta a contagem na ABERTURA que fala em "outras opções" (turno 5)', () => {
    // Medido em 2026-10-21: 5 motos saíram e o texto dizia "Separei umas…". O
    // early-return do "ver mais" (fila) engolia a contagem também na abertura.
    const t = comQuantidadeNoTexto(
      'Temos outras opções no estoque, sim. Separei umas que ficam abaixo do valor da CB 300 R:',
      5,
      { daApresentacao: true },
    );
    expect(t).toContain('5 opções');
  });

  it('no FECHO, "mais opções" continua sendo FILA e não recebe a contagem', () => {
    const t = 'Alguma delas chamou atenção, ou prefere ver mais opções?';
    expect(comQuantidadeNoTexto(t, 5)).toBe(t);
  });

  it('corrige "Separei mais 3" para a contagem real das motos enviadas', () => {
    expect(
      comQuantidadeNoTexto('Separei mais 3 opções que ficam bem nessa linha:', 5),
    ).toContain('Separei mais 5 opções');
  });

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

  it('corrige "separei duas parecidas" quando saíram 5 motos', () => {
    const t = comQuantidadeNoTexto(
      'Lander 250 eu não tenho, mas separei duas parecidas pra você, ótimas pra cidade:',
      5,
      { daApresentacao: true },
    );
    expect(t).toContain('separei 5 parecidas');
    expect(t).not.toContain('separei duas');
  });

  it('troca "várias opções" (quantificador) pelo número real', () => {
    const t = comQuantidadeNoTexto('Tenho várias opções dentro do seu valor até 30 mil.', 5);
    expect(t).toContain('5 opções');
    expect(t).not.toContain('várias opções');
  });

  it('injeta o número NA PRÓPRIA frase do modelo ("Separei as CB 300") sem prepend', () => {
    const t = comQuantidadeNoTexto('Temos sim, Vander! Separei as CB 300 que estão no estoque.', 3);
    expect(t).toContain('Separei as 3 CB 300');
    expect(t).not.toMatch(/opções.*Temos sim/i); // não empilhou abertura antes da fala
    expect(t).toContain('Temos sim, Vander!');
  });

  it('não injeta de novo quando o artigo já vem com número', () => {
    const t = 'Separei as 3 CB 300 pra você.';
    expect(comQuantidadeNoTexto(t, 3)).toBe(t);
  });

  it('não gera "5 duas" quando o modelo escreveu número por extenso', () => {
    const t = comQuantidadeNoTexto('Separei essas duas aqui pra você dar uma olhada:', 5);
    expect(t).toContain('Separei essas 5 aqui');
    expect(t).not.toMatch(/5 duas/);
  });

  it('corrige a CONTAGEM no fecho ("Qual dessas duas" → "Qual dessas 5")', () => {
    const t = comQuantidadeNoTexto('Qual dessas duas chamou mais a sua atenção?', 5);
    expect(t).toContain('Qual dessas 5');
    expect(t).not.toMatch(/duas/);
  });

  it('NÃO prepende abertura quando o modelo já abriu com frase', () => {
    const t = comQuantidadeNoTexto('Trilha, boa escolha!', 5);
    expect(t).toBe('Trilha, boa escolha!');
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

describe('semAnuncioDeFotos (nenhuma foto sai neste turno)', () => {
  it('corta a frase que anuncia fotos/opções', () => {
    const t = semAnuncioDeFotos(
      'Vander, nessa faixa de 6 mil não tenho nenhuma moto. Separei as mais acessíveis pra você ter ideia. De qual cidade você fala?',
    );
    expect(t).not.toMatch(/Separei/i);
    expect(t).toContain('De qual cidade');
    expect(t).toContain('não tenho nenhuma moto');
  });

  it('corta anúncio com objeto de moto/opção', () => {
    for (const f of [
      'Deixa eu te mostrar as motos que separei:',
      'Dá uma olhada nas opções:',
      'Olha essas unidades disponíveis.',
      'Vou te mandar as fotos agora.',
    ]) {
      expect(semAnuncioDeFotos(`Tudo bem! ${f} Me diz o que procura.`)).not.toMatch(
        /mostrar as motos|olhada nas opções|essas unidades|fotos agora/i,
      );
    }
  });

  it('NÃO corta frase sem objeto de moto/opção (evita falso-positivo)', () => {
    const t = 'Vou te mostrar como funciona o financiamento. Me diz sua renda.';
    expect(semAnuncioDeFotos(t)).toBe(t);
  });

  it('nunca esvazia o texto inteiro', () => {
    const t = 'Separei as opções.';
    expect(semAnuncioDeFotos(t)).toBe(t);
  });
});

describe('removerPerguntaDeEscolha (não duplicar o fecho)', () => {
  it('tira a pergunta de escolha que caiu na introdução', () => {
    const t = removerPerguntaDeEscolha(
      'Boa tarde! Temos sim 5 opções de 250. Deixa eu te mostrar o que separei. Qual delas chamou mais a sua atenção?',
    );
    expect(t).not.toMatch(/Qual delas/i);
    expect(t).toContain('Deixa eu te mostrar o que separei');
  });

  it('não mexe quando não há pergunta de escolha', () => {
    const t = 'Boa tarde! Temos sim 5 opções de 250. Deixa eu te mostrar o que separei.';
    expect(removerPerguntaDeEscolha(t)).toBe(t);
  });

  it('não remove uma pergunta que NÃO é de escolha', () => {
    const t = 'Você prefere cidade ou estrada? Me diz o que procura.';
    expect(removerPerguntaDeEscolha(t)).toContain('cidade ou estrada');
  });
});
