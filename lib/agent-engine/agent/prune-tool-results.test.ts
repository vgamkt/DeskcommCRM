import { describe, expect, it } from 'vitest';

import { pruneToolResults } from './prune-tool-results';
import type { ModelMessage } from '../edge/llm/run-model-call';

/** Fita sintética: abertura + N rodadas (assistant tool-call + tool result). */
function fita(rodadas: number, tamanhoResultado = 4000): ModelMessage[] {
  const msgs: ModelMessage[] = [{ role: 'user', content: 'abertura do turno' }];
  for (let i = 1; i <= rodadas; i += 1) {
    msgs.push({
      role: 'assistant',
      content: [
        { type: 'tool-call', toolCallId: `c${i}`, toolName: 'crm_query_external_data', input: { i } },
      ],
    });
    msgs.push({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: `c${i}`,
          toolName: 'crm_query_external_data',
          output: { type: 'json', value: { motos: 'x'.repeat(tamanhoResultado) } },
        },
      ],
    });
  }
  return msgs;
}

function resultadoDe(m: ModelMessage): string {
  if (m.role !== 'tool') return '';
  const part = m.content[0];
  if (part === undefined || part.type !== 'tool-result') return '';
  return part.output.type === 'text' ? part.output.value : JSON.stringify(part.output);
}

describe('pruneToolResults', () => {
  it('troca por stub os results FORA da janela e mantém os últimos íntegros', () => {
    const out = pruneToolResults(fita(4), { windowTurns: 1, minResultTokens: 0 });
    const tools = out.filter((m) => m.role === 'tool');
    expect(tools).toHaveLength(4);
    // as 3 primeiras viraram stub; a última (rodada corrente) fica íntegra
    expect(resultadoDe(tools[0]!)).toContain('resultado podado');
    expect(resultadoDe(tools[1]!)).toContain('resultado podado');
    expect(resultadoDe(tools[2]!)).toContain('resultado podado');
    expect(resultadoDe(tools[3]!)).not.toContain('resultado podado');
  });

  it('preserva o pareamento tool-call/result (nenhum result é removido)', () => {
    const original = fita(5);
    const out = pruneToolResults(original, { windowTurns: 1, minResultTokens: 0 });
    // mesma contagem de mensagens e de tool-calls
    expect(out).toHaveLength(original.length);
    const calls = out.filter((m) => m.role === 'assistant').length;
    const tools = out.filter((m) => m.role === 'tool').length;
    expect(calls).toBe(5);
    expect(tools).toBe(5);
  });

  it('encolhe a fita (o ponto do enxugamento entre steps)', () => {
    const original = fita(6);
    const out = pruneToolResults(original, { windowTurns: 1, minResultTokens: 0 });
    expect(JSON.stringify(out).length).toBeLessThan(JSON.stringify(original).length / 2);
  });

  it('minResultTokens alto preserva results pequenos', () => {
    const out = pruneToolResults(fita(4, 50), { windowTurns: 1, minResultTokens: 200 });
    const tools = out.filter((m) => m.role === 'tool');
    expect(resultadoDe(tools[0]!)).not.toContain('resultado podado');
  });
});
