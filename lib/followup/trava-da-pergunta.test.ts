import { describe, expect, it } from 'vitest';

import { motorReenviaPerguntaDoFluxo, type EntradaDaTrava } from './trava-da-pergunta';

/**
 * ANTES (G3.7) — caracterização do comportamento ATUAL: o MOTOR decide reenviar.
 * Estes casos são o retrato do que existe hoje; o item G3.7 troca o decisor pela Jev
 * e a comparação ANTES×DEPOIS se faz contra esta tabela.
 */
const base: EntradaDaTrava = {
  preview: false,
  kind: 'inbound_turn',
  temAtendimento: true,
  temValores: true,
  emNegociacao: false,
  seq: 1,
  maxSends: 12,
  temPendenteNaoRespondido: true,
  perguntaSaiu: false,
};

describe('motorReenviaPerguntaDoFluxo — ANTES (o motor decide)', () => {
  it('caso típico: fluxo ativo, pendente não respondido, pergunta não saiu → REENVIA', () => {
    expect(motorReenviaPerguntaDoFluxo(base)).toBe(true);
  });
  it('a pergunta já saiu no turno → NÃO reenvia', () => {
    expect(motorReenviaPerguntaDoFluxo({ ...base, perguntaSaiu: true })).toBe(false);
  });
  it('em negociação → NÃO reenvia (a objeção tem prioridade)', () => {
    expect(motorReenviaPerguntaDoFluxo({ ...base, emNegociacao: true })).toBe(false);
  });
  it('pendente já respondido → NÃO reenvia', () => {
    expect(motorReenviaPerguntaDoFluxo({ ...base, temPendenteNaoRespondido: false })).toBe(false);
  });
  it('sem fluxo ativo / sem valores → NÃO reenvia', () => {
    expect(motorReenviaPerguntaDoFluxo({ ...base, temAtendimento: false })).toBe(false);
    expect(motorReenviaPerguntaDoFluxo({ ...base, temValores: false })).toBe(false);
  });
  it('estourou o teto de envios → NÃO reenvia', () => {
    expect(motorReenviaPerguntaDoFluxo({ ...base, seq: 12 })).toBe(false);
  });
  it('preview ou job de outro kind → NÃO reenvia', () => {
    expect(motorReenviaPerguntaDoFluxo({ ...base, preview: true })).toBe(false);
    expect(motorReenviaPerguntaDoFluxo({ ...base, kind: 'followup_turn' })).toBe(false);
  });
});
