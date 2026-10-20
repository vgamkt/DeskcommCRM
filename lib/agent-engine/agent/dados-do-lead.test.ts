import { describe, expect, it } from 'vitest';
import type pg from 'pg';

import {
  extrairDadosDoTexto,
  gravarDadosDeterministicos,
} from './dados-do-lead';

describe('extrairDadosDoTexto — nome', () => {
  it.each([
    ['Meu nome é Douglas', 'Douglas'],
    ['Meu nome é Douglas, tudo bem?', 'Douglas'],
    ['Meu nome é Ana Paula', 'Ana Paula'],
    ['Meu nome é João da Silva', 'João da Silva'],
    ['Meu primeiro nome é Ana', 'Ana'],
    ['Meu nome é o Douglas', 'Douglas'],
    ['Meu nome é a Ana', 'Ana'],
    ['Pode me chamar de Duda', 'Duda'],
    ['Me chama de Duda', 'Duda'],
    ['Aqui é a Maria', 'Maria'],
    ['Aqui fala João', 'João'],
    ['Sou o João', 'João'],
    ['Sou a Maria', 'Maria'],
    ['Sou Maria', 'Maria'],
    ["Meu nome é D'Ávila", "D'Ávila"],
    ['Meu nome é Ana-Paula', 'Ana-Paula'],
  ])('%s → %s', (texto, esperado) => {
    expect(extrairDadosDoTexto(texto).nome).toBe(esperado);
  });

  it.each([
    'Meu nome é',
    'Meu nome é 123',
    'Meu nome é E',
    'Sou de São Paulo',
    'Sou feliz',
    'Sou o vendedor',
    'Sou habilitado',
    'Tenho CNH sim, sou habilitado.',
    'Não sou o João',
    'Nem me chamo João',
    'Meu nome não é João',
    'Bom dia, tudo bem?',
  ])('não inventa nome em: %s', (texto) => {
    expect(extrairDadosDoTexto(texto).nome).toBeUndefined();
  });
});

describe('gravarDadosDeterministicos — nome', () => {
  it('grava o nome também na coluna name do contato', async () => {
    const chamadas: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        chamadas.push({ sql, params });
        return { rows: [] };
      },
    } as unknown as pg.Pool;

    await gravarDadosDeterministicos(pool, {
      tenantId: 'org',
      contatoId: 'ct',
      texto: 'Meu nome é Ana Paula',
    });

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.sql).toContain('name = $4');
    expect(chamadas[0]!.params).toEqual([
      'org',
      'ct',
      JSON.stringify({ nome: 'Ana Paula' }),
      'Ana Paula',
    ]);
  });

  it('não grava nada quando o cliente não declarou nome', async () => {
    const chamadas: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params: unknown[]) => {
        chamadas.push({ sql, params });
        return { rows: [] };
      },
    } as unknown as pg.Pool;

    await gravarDadosDeterministicos(pool, {
      tenantId: 'org',
      contatoId: 'ct',
      texto: 'Bom dia, tudo bem?',
    });

    expect(chamadas).toHaveLength(0);
  });
});
