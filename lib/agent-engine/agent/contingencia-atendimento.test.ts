import { describe, expect, it } from 'vitest';

import { LlmBudgetExceededError } from '../edge/llm/run-model-call';

import { JobSettledError, TEXTO_ATENDIMENTO_HUMANO, deveContingenciaDoTurno } from './inbound-turn';

describe('contingência de atendimento humano (fala ao cliente)', () => {
  it('NÃO revela automação/sistema (proibido)', () => {
    const proibidos = [
      'instabilidade',
      'instável',
      'sistema',
      ' ia ',
      'robô',
      'rob',
      'bot',
      'automátic',
      'automatiz',
      'erro',
      'falha',
      'servidor',
      'provedor',
      'api',
    ];
    const t = TEXTO_ATENDIMENTO_HUMANO.toLowerCase();
    for (const p of proibidos) {
      expect(t, `não pode conter "${p}"`).not.toContain(p);
    }
  });

  it('passa para uma pessoa da equipe e diz que o atendimento continua por aqui', () => {
    const t = TEXTO_ATENDIMENTO_HUMANO.toLowerCase();
    expect(t).toContain('pessoa');
    expect(t).toContain('equipe');
    expect(t).toMatch(/volto|continuo|continuar|sigo/);
  });
});

describe('deveContingenciaDoTurno', () => {
  const base = {
    kind: 'inbound_turn' as const,
    erro: new Error('falha qualquer'),
    tentativa: 1,
    maxTentativas: 5,
    jaTentouEnviar: false,
  };

  it('NÃO converte a 1ª falha em handoff: o job ainda vai ser re-tentado', () => {
    expect(deveContingenciaDoTurno(base)).toBe(false);
  });

  it('converte no ÚLTIMO attempt, quando o job vai morrer', () => {
    expect(deveContingenciaDoTurno({ ...base, tentativa: 5 })).toBe(true);
  });

  it('não dispara se o turno já tentou enviar (evita 2ª mensagem)', () => {
    expect(deveContingenciaDoTurno({ ...base, tentativa: 5, jaTentouEnviar: true })).toBe(false);
  });

  it('não dispara em desfecho intencional nem no teto de orçamento', () => {
    expect(
      deveContingenciaDoTurno({ ...base, tentativa: 5, erro: new JobSettledError('cap') }),
    ).toBe(false);
    expect(
      deveContingenciaDoTurno({
        ...base,
        tentativa: 5,
        erro: new LlmBudgetExceededError('sem saldo'),
      }),
    ).toBe(false);
  });

  it('só vale para inbound_turn', () => {
    expect(deveContingenciaDoTurno({ ...base, kind: 'followup_turn', tentativa: 5 })).toBe(false);
  });
});
