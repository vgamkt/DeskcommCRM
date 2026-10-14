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
    expect(r.corpo).toContain('Como você pretende levar?');
    expect(r.corpo).not.toContain('chamou');
    expect(r.corpo).not.toContain('cidade');
    expect(r.corpo).toContain('Boa escolha!');
  });

  it('sem escolha, continua a pergunta de ESCOLHA', () => {
    const r = ajustarFechoDoTurnoDeCatalogo({ corpo: 'Separei umas opções.', perguntaDoFluxo: null, variacao: 0 });
    expect(r.corpo).toContain('chamou');
    expect(r.corpo).not.toContain('Como você pretende levar?');
  });
});
