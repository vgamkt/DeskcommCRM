import { describe, expect, it } from 'vitest';

import { ajustarFechoDoTurnoDeCatalogo } from './fecho-do-turno';

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

  it('com UMA moto só: fecho de SABER MAIS (não "qual delas")', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({
      corpo: 'Temos sim a Honda Biz! Separei essa unidade. Qual delas te interessou mais?',
      perguntaDoFluxo: null,
      variacao: 0,
      umaMoto: true,
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
