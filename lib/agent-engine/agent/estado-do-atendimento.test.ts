import { describe, expect, it } from 'vitest';

import { renderBlocoDeEstado } from './estado-do-atendimento';

const TWISTER = {
  nome: 'CB 300 F Twister',
  ano: '2025',
  cor: 'Vermelho',
  fotos: ['https://x/tw-1.jpg'],
};

describe('renderBlocoDeEstado', () => {
  it('sem escolha e sem dados ⇒ vazio (zero token)', () => {
    expect(renderBlocoDeEstado({ contact: { name: null, custom_fields: {} }, escolhida: null })).toBe(
      '',
    );
  });

  it('declara a moto escolhida (o fato; a regra fica no bloco TRAVADA)', () => {
    const bloco = renderBlocoDeEstado({
      contact: { name: null, custom_fields: {} },
      escolhida: TWISTER,
    });
    expect(bloco).toContain('Moto escolhida pelo cliente: CB 300 F Twister (2025, Vermelho)');
    // Sem duplicar a regra que já vive no bloco "Moto já escolhida — TRAVADA".
    expect(bloco).not.toContain('conduza ao fechamento');
  });

  it('lê de volta os dados do contato (CPF/nascimento inclusos) — não reperguntar', () => {
    const bloco = renderBlocoDeEstado({
      contact: {
        name: 'Vander',
        custom_fields: {
          cidade: 'São José dos Campos',
          cnh: true,
          cpf: '097.908.906-99',
          data_nascimento: '1989-02-26',
        },
      },
      escolhida: null,
    });
    expect(bloco).toContain('Nome: Vander');
    expect(bloco).toContain('CNH: sim');
    expect(bloco).toContain('CPF: 097.908.906-99');
    expect(bloco).toContain('Nascimento: 1989-02-26');
    expect(bloco).toContain('NÃO pergunte de novo');
  });

  it('injeta a moto EM FOCO quando ainda não há escolha travada; a escolhida vence', () => {
    const semEscolha = renderBlocoDeEstado({
      contact: { name: null, custom_fields: {} },
      escolhida: null,
      motoEmFoco: TWISTER,
    });
    expect(semEscolha).toContain('Moto em foco nesta conversa: CB 300 F Twister');

    const comEscolha = renderBlocoDeEstado({
      contact: { name: null, custom_fields: {} },
      escolhida: TWISTER,
      motoEmFoco: TWISTER,
    });
    expect(comEscolha).toContain('Moto escolhida pelo cliente');
    expect(comEscolha).not.toContain('Moto em foco nesta conversa');
  });

  it('declara a descrição da moto em foco (apresentação/objeção) — e some sem ela', () => {
    const comDescricao = renderBlocoDeEstado({
      contact: { name: 'Vander', custom_fields: {} },
      escolhida: TWISTER,
      descricaoDaMoto: {
        nome: 'CB 300 F Twister',
        texto: 'Única dona, revisões em dia, pneus novos.',
      },
    });
    expect(comDescricao).toContain('Descrição da moto EM FOCO');
    expect(comDescricao).toContain('Única dona, revisões em dia, pneus novos.');

    const semDescricao = renderBlocoDeEstado({
      contact: { name: null, custom_fields: {} },
      escolhida: TWISTER,
    });
    expect(semDescricao).not.toContain('Descrição da moto EM FOCO');
  });

  it('inclui o já respondido no fluxo', () => {
    const bloco = renderBlocoDeEstado({
      contact: { name: null, custom_fields: {} },
      escolhida: null,
      valoresDoFluxo: { moto_troca: 'cg 125', troca_ano: '2015', vazio: '  ' },
    });
    expect(bloco).toContain('Já respondido no fluxo');
    expect(bloco).toContain('moto_troca: cg 125');
    expect(bloco).not.toContain('vazio:');
  });

  it('CNH false vira "não"', () => {
    const bloco = renderBlocoDeEstado({
      contact: { name: null, custom_fields: { cnh: false } },
      escolhida: null,
    });
    expect(bloco).toContain('CNH: não');
  });
});
