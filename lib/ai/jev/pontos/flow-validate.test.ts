import { describe, expect, it } from 'vitest';

import {
  NAO_RESPOSTA,
  candidatasPorTipo,
  candidatasDeTexto,
  candidatasNumericas,
  candidatasDeData,
  leituraDeFluxoDaJev,
  perguntasDeFluxoDeJev,
  type CampoDeFluxoParaJev,
} from './flow-validate';
import type { RespostasDeJev } from '../tipos';

const campos: CampoDeFluxoParaJev[] = [
  { key: 'cidade', label: 'Cidade', question: 'De qual cidade você fala?', type: 'text' },
  { key: 'cnh', label: 'Tem CNH?', type: 'boolean' },
  { key: 'cor', label: 'Cor', type: 'select', options: ['azul', 'vermelha'] },
];

describe('perguntasDeFluxoDeJev', () => {
  it('cria respondeu_ para todos e valor_ só nos discretos', () => {
    const q = perguntasDeFluxoDeJev(campos);
    expect(q['respondeu_cidade']?.type).toBe('noul');
    expect(q['respondeu_cnh']?.type).toBe('noul');
    expect(q['valor_cnh']?.type).toBe('choice');
    expect(q['valor_cor']?.type).toBe('choice');
    expect(q['valor_cidade']).toBeUndefined(); // texto não tem valor pronto
    // A escolha tem as opções + "não respondeu".
    const crit = (q['valor_cor'] as { criteria: Record<string, string> }).criteria;
    expect(crit[NAO_RESPOSTA]).toBeDefined();
    expect(crit['azul']).toBeDefined();
    expect(crit['vermelha']).toBeDefined();
  });
});

describe('leituraDeFluxoDaJev', () => {
  it('marca respondidos por noul e traz valores dos discretos', () => {
    const r: RespostasDeJev = {
      respondeu_cidade: { type: 'noul', noul: 0.9 },
      respondeu_cnh: { type: 'noul', noul: 0.8 },
      valor_cnh: { type: 'choice', choice: 'sim', confidence: 1, probabilities: {} },
      respondeu_cor: { type: 'noul', noul: 0.1 },
      valor_cor: { type: 'choice', choice: NAO_RESPOSTA, confidence: 1, probabilities: {} },
    };
    const l = leituraDeFluxoDaJev(r, campos);
    expect(l.camposRespondidos.sort()).toEqual(['cidade', 'cnh']);
    expect(l.valores).toEqual({ cnh: 'sim' });
  });

  it('nada respondido → listas vazias (o chamador evita o chat)', () => {
    const r: RespostasDeJev = {
      respondeu_cidade: { type: 'noul', noul: 0.2 },
      respondeu_cnh: { type: 'noul', noul: 0.1 },
      valor_cnh: { type: 'choice', choice: NAO_RESPOSTA, confidence: 1, probabilities: {} },
    };
    const l = leituraDeFluxoDaJev(r, campos);
    expect(l.camposRespondidos).toEqual([]);
    expect(l.valores).toEqual({});
  });
});

describe('candidatasDeTexto', () => {
  it('extrai um trecho capitalizado iniciado por "sou de"', () => {
    const c = candidatasDeTexto('Sou de São José dos Campos e tenho CNH', 'Cidade');
    expect(c.length).toBeGreaterThan(0);
    expect(c.join(' ')).toMatch(/José/);
  });

  it('não devolve o rótulo nem vazio', () => {
    expect(candidatasDeTexto('', 'Cidade')).toEqual([]);
    expect(candidatasDeTexto('tudo bem?', 'Cidade')).toEqual([]);
  });

  it('resposta SECA vira candidata (o cliente só diz o valor)', () => {
    expect(candidatasDeTexto('Sao paulo', 'Cidade')).toContain('Sao paulo');
    expect(candidatasDeTexto('Taubaté', 'Cidade')).toContain('Taubaté');
    expect(candidatasDeTexto('Vander', 'Nome')).toContain('Vander');
  });

  it('intenção genérica não vira candidata', () => {
    expect(candidatasDeTexto('quero uma moto', 'Cidade')).toEqual([]);
    expect(candidatasDeTexto('tenho interesse', 'Nome')).toEqual([]);
  });
});

describe('candidatas por tipo (número/data)', () => {
  it('números soltos viram candidatas', () => {
    expect(candidatasNumericas('tenho 3 mil de entrada e 120 mil km').length).toBeGreaterThan(0);
    expect(candidatasNumericas('tenho 3 mil de entrada e 120 mil km')).toContain('3');
  });

  it('datas em formatos comuns viram candidatas', () => {
    expect(candidatasDeData('nasci em 26/02/1989')).toContain('26/02/1989');
    expect(candidatasDeData('nascimento 1989-02-26')).toContain('1989-02-26');
  });

  it('candidatasPorTipo roteia por tipo', () => {
    expect(candidatasPorTipo('são 3 mil', 'number', 'Entrada')).toContain('3');
    expect(candidatasPorTipo('sou de Salvador', 'text', 'Cidade').join(' ')).toMatch(/Salvador/);
    expect(candidatasPorTipo('em 01/01/2000', 'date', 'Data')).toContain('01/01/2000');
  });
});
