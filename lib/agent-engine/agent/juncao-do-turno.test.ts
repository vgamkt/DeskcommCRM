import { describe, expect, it } from 'vitest';

import { limparTextoUnificado, montarPedidoDaJuncao, SYSTEM_DA_JUNCAO } from './juncao-do-turno';

describe('montarPedidoDaJuncao', () => {
  it('lista as peças na ordem + a pergunta pendente', () => {
    const p = montarPedidoDaJuncao(['Oi, tudo bem?', 'Temos a CB 300.'], 'De qual cidade você fala?');
    expect(p).toContain('1. Oi, tudo bem?');
    expect(p).toContain('2. Temos a CB 300.');
    expect(p).toContain('De qual cidade você fala?');
  });
  it('sem pendente → não cita pergunta pendente', () => {
    expect(montarPedidoDaJuncao(['só uma'], null)).not.toContain('PENDENTE');
  });
  it('ignora peças vazias', () => {
    const p = montarPedidoDaJuncao(['a', '   ', ''], null);
    expect(p).toContain('1. a');
    expect(p).not.toContain('2. ');
  });
});

describe('limparTextoUnificado', () => {
  it('trim', () => expect(limparTextoUnificado('  oi  ')).toBe('oi'));
  it('vazio → null', () => expect(limparTextoUnificado('   ')).toBeNull());
});

describe('SYSTEM_DA_JUNCAO', () => {
  it('proíbe dizer que é IA e prometer', () => {
    expect(SYSTEM_DA_JUNCAO).toContain('IA');
    expect(SYSTEM_DA_JUNCAO.toLowerCase()).toContain('prometa');
  });
});
