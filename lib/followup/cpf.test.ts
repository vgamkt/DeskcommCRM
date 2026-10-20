import { describe, expect, it } from 'vitest';

import { avaliarCpf, cpfValido, extrairCpfDoTexto, formatarCpfParcial } from './cpf';

describe('CPF do fluxo', () => {
  it('normaliza pontuação de um CPF válido sem perguntar nada', () => {
    // 529.982.247-25 é um CPF de teste com dígitos verificadores corretos.
    const av = avaliarCpf('52998224725');
    expect(av.valido).toBe(true);
    expect(av.motivo).toBe('ok');
    expect(av.formatado).toBe('529.982.247-25');
    expect(cpfValido('529.982.247-25')).toBe(true);
  });

  it('faltando dígito: inválido e formatado parcialmente', () => {
    const av = avaliarCpf('454.444.567-2');
    expect(av.valido).toBe(false);
    expect(av.motivo).toBe('faltam_digitos');
    expect(av.formatado).toBe('454.444.567-2');
  });

  it('sobando dígito: inválido', () => {
    const av = avaliarCpf('454444567220');
    expect(av.valido).toBe(false);
    expect(av.motivo).toBe('sobram_digitos');
  });

  it('11 dígitos com verificadores errados: inválido (vai para confirmação)', () => {
    const av = avaliarCpf('454.444.567-22');
    expect(av.valido).toBe(false);
    expect(av.motivo).toBe('digitos_verificadores');
  });

  it('repetição não passa', () => {
    expect(avaliarCpf('111.111.111-11').motivo).toBe('repetido');
  });

  it('formata parcial sem inventar dígitos', () => {
    expect(formatarCpfParcial('454')).toBe('454');
    expect(formatarCpfParcial('454444')).toBe('454.444');
    expect(formatarCpfParcial('454444567')).toBe('454.444.567');
  });
});


describe('extrairCpfDoTexto', () => {
  it('recorta o CPF quando a mensagem também traz a data de nascimento', () => {
    expect(extrairCpfDoTexto('Meu CPF é 529.982.247-25 e nasci em 29/09/1997')).toBe(
      '529.982.247-25',
    );
  });

  it('recorta o CPF de uma sequência colada com outros números', () => {
    expect(extrairCpfDoTexto('5299822472529091997')).toBe('52998224725');
  });

  it('sem CPF devolve null', () => {
    expect(extrairCpfDoTexto('nasci em 29/09/1997')).toBeNull();
  });
});
