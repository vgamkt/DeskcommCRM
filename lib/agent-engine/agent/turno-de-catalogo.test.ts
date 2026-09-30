import { describe, expect, it } from 'vitest';

import { turnoEhDeCatalogo, type SinaisDoTurnoDeCatalogo } from './turno-de-catalogo';

function sinais(over: Partial<SinaisDoTurnoDeCatalogo> = {}): SinaisDoTurnoDeCatalogo {
  return {
    catalogoConsultadoNoTurno: false,
    ofereceuSimilaresPelaFerramenta: false,
    pediuOutraMoto: false,
    temMotoAtual: false,
    mensagem: '',
    ...over,
  };
}

describe('turnoEhDeCatalogo — não despeja motos sem intenção', () => {
  it('o DEFEITO medido: moto atual + "onde fica a loja?" NÃO é turno de catálogo', () => {
    // O cliente já escolheu uma moto (memória) e perguntou o endereço. A versão
    // antiga (`motoAtual !== null`) mandava 5 fotos antes da resposta.
    expect(
      turnoEhDeCatalogo(sinais({ temMotoAtual: true, mensagem: 'Onde fica a loja?' })),
    ).toBe(false);
  });

  it('moto atual + acenos/assuntos alheios continuam NÃO sendo catálogo', () => {
    for (const m of ['obrigado', 'bom dia', 'vocês abrem sábado?', 'tudo bem?', '', 'ok']) {
      expect(turnoEhDeCatalogo(sinais({ temMotoAtual: true, mensagem: m }))).toBe(false);
    }
  });

  it('o MODELO consultou o catálogo agora → é turno de catálogo', () => {
    expect(turnoEhDeCatalogo(sinais({ catalogoConsultadoNoTurno: true, mensagem: 'oi' }))).toBe(
      true,
    );
  });

  it('a ferramenta de semelhantes foi usada → é turno de catálogo', () => {
    expect(turnoEhDeCatalogo(sinais({ ofereceuSimilaresPelaFerramenta: true }))).toBe(true);
  });

  it('cliente pediu moto/mais opções → é turno de catálogo', () => {
    expect(turnoEhDeCatalogo(sinais({ mensagem: 'quero uma moto' }))).toBe(true);
    expect(turnoEhDeCatalogo(sinais({ mensagem: 'tem uma CB 300?' }))).toBe(true);
    expect(turnoEhDeCatalogo(sinais({ mensagem: 'quero ver mais opções' }))).toBe(true);
    expect(turnoEhDeCatalogo(sinais({ pediuOutraMoto: true }))).toBe(true);
  });

  it('moto atual + pedido de algo diferente → é turno de catálogo', () => {
    expect(turnoEhDeCatalogo(sinais({ temMotoAtual: true, mensagem: 'quero outra' }))).toBe(true);
    expect(turnoEhDeCatalogo(sinais({ temMotoAtual: true, mensagem: 'mudei de ideia' }))).toBe(
      true,
    );
  });

  it('pedido de PROCESSO NÃO é turno de catálogo, mesmo citando "moto" ou com verbo de pedido', () => {
    // "Quero financiar" disparava 5 fotos de motos (medido ao vivo 2026-09-29).
    for (const m of [
      'Quero financiar',
      'quero parcelar em 12x',
      'quero dar minha moto na troca',
      'quero consignar minha moto',
      'quero vender minha moto',
      'quero financiar o restante',
    ]) {
      expect(turnoEhDeCatalogo(sinais({ mensagem: m }))).toBe(false);
    }
  });

  it('objeção de valor ("achei caro") NÃO é turno de catálogo — persuade primeiro (C-071)', () => {
    expect(turnoEhDeCatalogo(sinais({ temMotoAtual: true, mensagem: 'achei caro' }))).toBe(false);
    expect(turnoEhDeCatalogo(sinais({ temMotoAtual: true, mensagem: 'ta caro demais' }))).toBe(
      false,
    );
    // O DEFEITO medido ao vivo: a objeção CITA "moto" e disparava o despejo.
    expect(
      turnoEhDeCatalogo(
        sinais({ temMotoAtual: true, mensagem: 'Achei caro, essa moto esta muito rodada?' }),
      ),
    ).toBe(false);
    // Mas "achei caro E quero ver mais opções" é pedido explícito → abre.
    expect(
      turnoEhDeCatalogo(
        sinais({ temMotoAtual: true, mensagem: 'achei caro, quero ver mais opções' }),
      ),
    ).toBe(true);
  });
});
