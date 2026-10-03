import { describe, expect, it } from 'vitest';

import {
  acaoDaNegociacaoJev,
  ofereceMotosPorAcao,
  perguntaDeNegociacaoJev,
  type ContextoDeNegociacao,
} from './negociacao';
import type { RespostasDeJev } from '../tipos';

const base: ContextoDeNegociacao = {
  motivo: 'preco', attempts: 0, confirmou: false, negou: false, desconto: false,
};

describe('negociacao Jev', () => {
  it('cria acao (choice) e pedir_valor só em preço', () => {
    expect(perguntaDeNegociacaoJev(base).acao?.type).toBe('choice');
    expect(perguntaDeNegociacaoJev(base).pedir_valor?.type).toBe('noul');
    expect(perguntaDeNegociacaoJev({ ...base, motivo: 'km' }).pedir_valor).toBeUndefined();
  });

  it('lê a ação e o pedirValor', () => {
    const r: RespostasDeJev = {
      acao: { type: 'choice', choice: 'persuadir_3_e_perguntar', confidence: 1, probabilities: {} },
      pedir_valor: { type: 'noul', noul: 0.9 },
    };
    expect(acaoDaNegociacaoJev(r)).toEqual({ acao: 'persuadir_3_e_perguntar', pedirValor: true });
  });

  it('só mostrar_opcoes oferece motos', () => {
    expect(ofereceMotosPorAcao('mostrar_opcoes')).toBe(true);
    expect(ofereceMotosPorAcao('persuadir_1')).toBe(false);
    expect(ofereceMotosPorAcao('encaminhar_e_encerrar')).toBe(false);
    expect(ofereceMotosPorAcao('handoff')).toBe(false);
  });

  it('resposta inválida cai em persuadir_1', () => {
    expect(acaoDaNegociacaoJev({}).acao).toBe('persuadir_1');
  });
});
