import { describe, expect, it } from 'vitest';

import type { ContextoDaConversa } from '@/lib/agent-engine/agent/contexto-da-conversa';
import type { MotoDoCatalogo } from '@/lib/agent-engine/agent/fotos-do-catalogo';
import type { RespostasDeJev } from '../tipos';
import { idDaMoto, perguntaDoPlanoDeTurno, planoDoTurnoDaJev } from './plano-de-turno';

const moto = (id: string, nome: string, preco: string, categoria: string): MotoDoCatalogo => ({
  nome,
  ano: '2020',
  cor: 'Preto',
  quilometragem: '10000',
  preco,
  fotos: ['x'],
  valores: { id, categoria, cambio: 'Automático' },
});

const catalogo = [
  moto('1', 'A', '10000', 'Street'),
  moto('2', 'B', '12000', 'Street'),
  moto('3', 'C', '14000', 'Trail'),
  moto('4', 'D', '15000', 'Scooter'),
  moto('5', 'E', '17000', 'Street'),
  moto('6', 'F', '9000', 'Scooter'),
];

const ctx: ContextoDaConversa = {
  mensagens: [
    { de: 'cliente', texto: 'oi', respondida: true },
    { de: 'loja', texto: 'olá', respondida: true },
    { de: 'cliente', texto: 'quero moto até 15 mil', respondida: false },
  ],
  rajada: ['quero moto até 15 mil'],
  estado: {
    orcamento: 15000,
    escolhida: null,
    referencia: null,
    motosMostradas: [],
    fila: [],
    objecao: null,
    formaDePagamentoPerguntada: false,
    usoCategoria: 'cidade',
    cambioPedido: null,
  },
  catalogo,
};

describe('perguntaDoPlanoDeTurno', () => {
  it('monta ação/critério/escolhida/fecho/handoff + nota por moto (IDs)', () => {
    const p = perguntaDoPlanoDeTurno(ctx, catalogo);
    expect(Object.keys(p)).toEqual(
      expect.arrayContaining(['acao', 'criterio', 'escolhida', 'fecho', 'handoff', 'parecida_0']),
    );
    expect(p).toHaveProperty('parecida_5');
    const escolhida = p.escolhida;
    expect(escolhida?.type).toBe('choice');
    if (escolhida?.type === 'choice') {
      expect(Object.keys(escolhida.criteria)).toEqual(expect.arrayContaining(['1', '6', 'nenhuma']));
    }
  });
});

describe('planoDoTurnoDaJev — motor executa sem reinterpretar', () => {
  const respostas = (extra: Partial<RespostasDeJev> = {}): RespostasDeJev => ({
    acao: { type: 'choice', choice: 'oferecer', confidence: 0.9, probabilities: {} },
    criterio: { type: 'choice', choice: 'preco', confidence: 0.8, probabilities: {} },
    escolhida: { type: 'choice', choice: '1', confidence: 0.7, probabilities: {} },
    fecho: { type: 'choice', choice: 'escolha', confidence: 0.7, probabilities: {} },
    handoff: { type: 'noul', noul: 0.2 },
    parecida_0: { type: 'noul', noul: 0.9 },
    parecida_1: { type: 'noul', noul: 0.6 },
    parecida_2: { type: 'noul', noul: 0.75 },
    parecida_3: { type: 'noul', noul: 0.71 },
    parecida_4: { type: 'noul', noul: 0.4 },
    parecida_5: { type: 'noul', noul: 0.8 },
    ...extra,
  });

  it('extrai seleção por ID (nota >= 0.7, ordenada, até 5) e os campos', () => {
    const plano = planoDoTurnoDaJev(respostas(), catalogo);
    expect(plano.acao).toBe('oferecer');
    expect(plano.criterio).toBe('preco');
    expect(plano.escolhida).toBe('1');
    expect(plano.fecho).toBe('escolha');
    expect(plano.selecao?.ids).toEqual(['1', '6', '3', '4']);
    expect(plano.selecao?.limite).toBe(5);
  });

  it('ação perguntar → sem seleção (não mostra motos)', () => {
    const plano = planoDoTurnoDaJev(
      respostas({ acao: { type: 'choice', choice: 'perguntar', confidence: 0.9, probabilities: {} } }),
      catalogo,
    );
    expect(plano.acao).toBe('perguntar');
    expect(plano.selecao).toBeNull();
  });

  it('escolhida fora do catálogo/nenhuma → null; handoff acima do limiar', () => {
    const plano = planoDoTurnoDaJev(
      respostas({
        escolhida: { type: 'choice', choice: 'nenhuma', confidence: 0.9, probabilities: {} },
        handoff: { type: 'noul', noul: 0.6 },
      }),
      catalogo,
    );
    expect(plano.escolhida).toBeNull();
    expect(plano.handoff).toEqual({ sim: true, probabilidade: 0.6 });
  });

  it('valor de ação inválido cai em nenhuma (sem inventar)', () => {
    const plano = planoDoTurnoDaJev(
      respostas({ acao: { type: 'choice', choice: 'xpto', confidence: 0.9, probabilities: {} } }),
      catalogo,
    );
    expect(plano.acao).toBe('nenhuma');
    expect(plano.selecao).toBeNull();
  });

  it('idDaMoto: usa o id do estoque; sem id, o nome', () => {
    expect(idDaMoto(catalogo[0]!)).toBe('1');
    expect(idDaMoto({ nome: 'Sem ID', fotos: ['x'] })).toBe('Sem ID');
  });
});
