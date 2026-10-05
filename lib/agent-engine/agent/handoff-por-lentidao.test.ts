import { describe, expect, it } from 'vitest';

import { explicarCausa } from './handoff-por-lentidao';

describe('explicarCausa (aviso de falha)', () => {
  it('sem causa → provedor de IA não respondeu', () => {
    expect(explicarCausa(null)).toMatch(/não respondeu a tempo/i);
    expect(explicarCausa('')).toMatch(/não respondeu a tempo/i);
  });

  it('contato removido no meio do turno (FK do llm_calls)', () => {
    const erro =
      'insert or update on table "llm_calls" violates foreign key constraint "llm_calls_contact_id_fkey"';
    expect(explicarCausa(erro)).toMatch(/contato foi removido durante o atendimento/i);
  });

  it('timeout, credencial e limite de uso', () => {
    expect(explicarCausa('The operation was aborted due to timeout')).toMatch(/tempo esgotado/i);
    expect(explicarCausa('401 Unauthorized: invalid token')).toMatch(/credencial\/chave/i);
    expect(explicarCausa('429 rate limit exceeded')).toMatch(/limite de uso/i);
    expect(explicarCausa('503 Service Unavailable')).toMatch(/instabilidade/i);
  });

  it('erro desconhecido → devolve o texto (resumido)', () => {
    expect(explicarCausa('deu ruim no parse')).toMatch(/falha no turno: deu ruim no parse/i);
  });
});
