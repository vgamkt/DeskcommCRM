import { describe, expect, it } from 'vitest';

import { TEXTO_ATENDIMENTO_HUMANO } from './inbound-turn';

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
