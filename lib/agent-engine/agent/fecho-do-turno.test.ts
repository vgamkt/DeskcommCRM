import { describe, expect, it } from 'vitest';

import {
  ajustarFechoDoTurnoDeCatalogo,
  fechoEfetivoDaApresentacao,
  garantirFechoNoFinal,
  removerPedidoDoCampoDaChamada,
  removerPerguntaDaChamada,
  textoDeContingenciaSemModelo,
} from './fecho-do-turno';

describe('garantirFechoNoFinal', () => {
  it('SUBSTITUI a pergunta do modelo que não é fecho pela pergunta da JEV', () => {
    const r = garantirFechoNoFinal(
      'Boa escolha! A NMax é econômica. Você já tem alguma experiência com scooter?',
      'Como você pretende adquirir essa moto? À vista, financiado, no cartão, ou na troca?',
    );
    expect(r).not.toContain('experiência com scooter');
    expect(r).toContain('Como você pretende adquirir');
    expect(r.indexOf('Boa escolha')).toBeLessThan(r.indexOf('Como você pretende'));
  });

  it('ACRESCENTA o fecho quando o modelo não perguntou nada', () => {
    const r = garantirFechoNoFinal('Separei 2 opções pra você.', 'Alguma dessas te agradou?');
    expect(r).toContain('Separei 2 opções');
    expect(r).toContain('Alguma dessas te agradou?');
  });

  it('sem texto do modelo, o fecho é a mensagem inteira', () => {
    expect(garantirFechoNoFinal('', 'Qual delas te interessou?')).toBe('Qual delas te interessou?');
  });

  it('pergunta de fecho vazia não mexe no texto', () => {
    expect(garantirFechoNoFinal('Separei 2 opções.', '  ')).toBe('Separei 2 opções.');
  });
});

describe('fechoEfetivoDaApresentacao', () => {
  it('JEV "nenhum" com motos na tela vira fecho estrutural', () => {
    expect(
      fechoEfetivoDaApresentacao({
        fechoJev: 'nenhum',
        motosDistintas: 2,
        temMaisOpcoes: false,
        outrosNoValor: false,
      }),
    ).toBe('escolha');
    expect(
      fechoEfetivoDaApresentacao({
        fechoJev: 'nenhum',
        motosDistintas: 1,
        temMaisOpcoes: false,
        outrosNoValor: false,
      }),
    ).toBe('saber_mais');
  });

  it('JEV indisponível (null) também fecha quando há moto', () => {
    expect(
      fechoEfetivoDaApresentacao({
        fechoJev: null,
        motosDistintas: 3,
        temMaisOpcoes: false,
        outrosNoValor: false,
      }),
    ).toBe('escolha');
  });

  it('uma moto com JEV "escolha" vira "saber_mais" (sem plural)', () => {
    expect(
      fechoEfetivoDaApresentacao({
        fechoJev: 'escolha',
        motosDistintas: 1,
        temMaisOpcoes: false,
        outrosNoValor: false,
      }),
    ).toBe('saber_mais');
  });

  it('respeita um fecho positivo da JEV', () => {
    expect(
      fechoEfetivoDaApresentacao({
        fechoJev: 'outra_opcao',
        motosDistintas: 2,
        temMaisOpcoes: false,
        outrosNoValor: false,
      }),
    ).toBe('outra_opcao');
  });
});

describe('removerPedidoDoCampoDaChamada', () => {
  it('tira o pedido do campo (imperativo sem "?") da CHAMADA', () => {
    const intro =
      'Separei 4 opções pra você dar uma olhada: Ah, e me diz seu nome pra eu já deixar seu contato aqui.';
    const r = removerPedidoDoCampoDaChamada(intro, 'Nome');
    expect(r).toContain('Separei 4 opções');
    expect(r).not.toContain('seu nome');
  });

  it('sem campo pendente, não mexe', () => {
    const intro = 'Separei 4 opções trail.';
    expect(removerPedidoDoCampoDaChamada(intro, null)).toBe(intro);
  });

  it('se a remoção esvaziaria a chamada, mantém a original', () => {
    expect(removerPedidoDoCampoDaChamada('Me diz seu nome?', 'Nome')).toBe('Me diz seu nome?');
  });
});

describe('removerPerguntaDaChamada', () => {
  it('tira a pergunta do fluxo da CHAMADA e preserva a chamada que vem antes', () => {
    const intro =
      'A Lander 250 não temos no momento, mas separei 5 opções trail: Ah, e me diz de qual cidade você é? Assim já vejo o que faz mais sentido.';
    const r = removerPerguntaDaChamada(intro);
    expect(r).toContain('separei 5 opções');
    expect(r).not.toContain('de qual cidade');
    expect(r).not.toContain('?');
  });

  it('sem pergunta, não mexe', () => {
    expect(removerPerguntaDaChamada('Separei 5 opções trail.')).toBe('Separei 5 opções trail.');
  });

  it('pergunta logo no começo (saudação): não come a chamada inteira', () => {
    const intro = 'Tudo bem? Separei 5 opções trail pra você.';
    expect(removerPerguntaDaChamada(intro)).toBe(intro.trim());
  });
});

describe('ajustarFechoDoTurnoDeCatalogo', () => {
  it('tira a pergunta do FLUXO (parafraseada) e garante a de ESCOLHA', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Lander não tenho, separei umas trail, dá uma olhada. De qual cidade você fala?',
      perguntaDoFluxo: 'De qual cidade você fala?',
      variacao: 0,
    });
    expect(r.corpo).not.toContain('cidade');
    expect(r.corpo).toContain('chamou'); // escolha (variante 0)
    expect(r.corpo).toContain('Lander não tenho');
  });

  it('com UMA moto só: fecho de PROGRESSÃO (aquisição), não "qual delas"', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Temos sim a Honda Biz! Separei essa unidade. Qual delas te interessou mais?',
      perguntaDoFluxo: null,
      variacao: 0,
      umaMoto: true,
    });
    expect(r.corpo).not.toContain('delas');
    // Puxa a forma de pagamento (progressão da venda).
    expect(r.corpo.toLowerCase()).toMatch(/adquirir|pagamento|à vista|financiad/);
  });

  it('1 moto mas forma de pagamento JÁ perguntada: fecho de SABER MAIS (sem repetir)', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Temos sim a Honda Biz! Separei essa unidade. Qual delas te interessou mais?',
      perguntaDoFluxo: null,
      variacao: 0,
      umaMoto: true,
      formaJaPerguntada: true,
    });
    expect(r.corpo).not.toContain('delas');
    expect(r.corpo.toLowerCase()).toMatch(/saber mais|mais sobre|detalhes/);
  });

  it('não DUPLICA a pergunta quando o modelo já perguntou com cauda sem "?"', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Separei essa Biz. Ela é econômica. Te conto mais sobre ela? Se quiser, posso te chamar pra ver de perto.',
      perguntaDoFluxo: null,
      variacao: 0,
      umaMoto: true,
    });
    const ocorrencias = (r.corpo.match(/te conto mais/gi) ?? []).length;
    expect(ocorrencias).toBeLessThanOrEqual(1);
  });

  it('mesmo PARAFRASEADA, tira a cauda interrogativa (o fecho é do motor)', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Separei umas opções trail. Me conta de onde você é?',
      perguntaDoFluxo: 'Qual a sua cidade?',
      variacao: 0,
    });
    expect(r.corpo).not.toContain('de onde você é');
    expect(r.corpo).toContain('chamou');
  });

  it('tira também a pergunta de venda do modelo e põe a do motor (determinístico)', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Separei umas opções. Qual delas chamou sua atenção?',
      perguntaDoFluxo: null,
    });
    expect(r.corpo).not.toContain('chamou sua atenção');
    expect(r.corpo).toContain('chamou');
  });

  it('preserva o corpo sem pergunta', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({ corpo: 'Separei umas opções trail pra você.', perguntaDoFluxo: null });
    expect(r.corpo).toContain('Separei umas opções trail pra você.');
    expect(r.corpo).toContain('chamou');
  });

  it('corpo só com pergunta → vira só a pergunta de escolha (nunca vazio)', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({ corpo: 'De qual cidade você fala?', perguntaDoFluxo: 'De qual cidade você fala?' });
    expect(r.corpo).not.toContain('cidade');
    expect(r.corpo.trim().length).toBeGreaterThan(0);
  });

  it('moto JÁ ESCOLHIDA → fecho é a pergunta de AQUISIÇÃO (não "qual delas?")', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Boa escolha! A Factor 150 é econômica e ótima pro dia a dia.',
      perguntaDoFluxo: 'De qual cidade você fala?',
      variacao: 0,
      temEscolha: true,
    });
    expect(r.corpo).toContain('adquirir essa moto');
    expect(r.corpo).not.toContain('chamou');
    expect(r.corpo).not.toContain('cidade');
    expect(r.corpo).toContain('Boa escolha!');
  });

  it('a pergunta de AQUISIÇÃO chama o cliente pelo nome', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Boa escolha!',
      perguntaDoFluxo: null,
      variacao: 0,
      temEscolha: true,
      nomeCliente: 'Vander',
    });
    expect(r.corpo).toContain('Vander, ');
  });

  it('sem escolha, continua a pergunta de ESCOLHA', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({ corpo: 'Separei umas opções.', perguntaDoFluxo: null, variacao: 0 });
    expect(r.corpo).toContain('chamou');
    expect(r.corpo).not.toContain('adquirir essa moto');
  });

  it('sem escolha + MAIS opções → re-adiciona o "quer ver mais?" (o passo 2 apagou)', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Separei umas opções parecidas que podem te agradar.',
      perguntaDoFluxo: null,
      variacao: 0,
      temMaisOpcoes: true,
    });
    expect(r.corpo).toContain('chamou'); // escolha
    expect(r.corpo).toMatch(/mais op|mais algumas|outras|alternativas/); // mais opções
  });

  it('ESCOPO 9: outrosNoValor → convite a "outros modelos nesse valor" (não o genérico)', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Separei umas CB até 17 mil pra você.',
      perguntaDoFluxo: null,
      variacao: 0,
      temMaisOpcoes: true,
      outrosNoValor: true,
      modeloCitado: 'CB 300',
    });
    expect(r.corpo).toMatch(/outros modelos/);
    expect(r.corpo).toMatch(/nesse (mesmo )?valor|nessa (mesma )?faixa/i);
    expect(r.corpo).toContain('chamou'); // escolha continua
  });

  it('com ESCOLHA + mais opções → NÃO pergunta mais opções (fecho de aquisição)', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Boa escolha! A Factor é econômica.',
      perguntaDoFluxo: null,
      variacao: 0,
      temEscolha: true,
      temMaisOpcoes: true,
    });
    expect(r.corpo).toContain('adquirir essa moto');
    expect(r.corpo).not.toMatch(/mais op|mais algumas|alternativas/);
  });
});


describe('textoDeContingenciaSemModelo', () => {
  it('com fluxo pendente: contingência é a pergunta do campo (não o handoff)', () => {
    expect(textoDeContingenciaSemModelo('De qual cidade você fala?', 'Vou passar para o responsável.')).toBe(
      'De qual cidade você fala?',
    );
  });

  it('sem fluxo pendente: mantém o handoff', () => {
    expect(textoDeContingenciaSemModelo(null, 'Vou passar para o responsável.')).toBe(
      'Vou passar para o responsável.',
    );
    expect(textoDeContingenciaSemModelo('  ', 'Vou passar.')).toBe('Vou passar.');
  });
});
