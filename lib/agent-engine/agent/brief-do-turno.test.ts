import { describe, expect, it } from 'vitest';

import type { EstadoDeAtendimento } from '@/lib/followup/atendimento';
import type { FlowNode } from '@/lib/followup/graph-schema';

import { renderBriefDoTurno, renderDiretrizDoTurno } from './brief-do-turno';
import { renderBlocoDeEstado } from './estado-do-atendimento';
import { renderBlocoDeAtendimento } from '@/lib/followup/atendimento';
import { renderBlocoObjecao } from './objecao-de-valor';
import { renderStageHint } from './stage-classifier';

type Collect = Extract<FlowNode, { type: 'collect' }>;

const TWISTER = {
  nome: 'CB 300 F Twister',
  ano: '2025',
  cor: 'Vermelho',
  fotos: ['https://x/tw-1.jpg'],
};

function pendente(config: Collect['config']): Collect {
  return { id: config.key, type: 'collect', label: config.label, position: { x: 0, y: 0 }, config };
}

function estado(over: Partial<EstadoDeAtendimento> = {}): EstadoDeAtendimento {
  return {
    enrollment: {
      id: 'e1',
      pointer_id: 'p1',
      version_id: 'v1',
      contact_id: 'c1',
      current_node_id: 'n1',
      status: 'active',
    },
    nomeDoFluxo: 'Financiamento',
    checklist: { passos: [], fim: { id: 'fim', type: 'end', label: 'Fim', position: { x: 0, y: 0 }, config: { outcome: 'converted' } } },
    valores: {},
    tentativas: {},
    maxTentativas: 3,
    situacao: {
      pendentes: [],
      obrigatoriosPendentes: [],
      esgotadas: [],
      skills: [],
      completo: false,
    },
    ...over,
  };
}

describe('renderBriefDoTurno', () => {
  it('sem nada a declarar ⇒ vazio (zero token)', () => {
    expect(
      renderBriefDoTurno({
        estagioHint: '',
        objecaoBloco: '',
        contact: { name: null, custom_fields: {} },
        escolhida: null,
        fluxo: null,
      }),
    ).toBe('');
  });

  it('carrega o hint do estágio e o bloco de objeção VERBATIM', () => {
    const hint = renderStageHint('negotiating', 'qualified');
    const objecao = renderBlocoObjecao('persuadir');
    const brief = renderBriefDoTurno({
      estagioHint: hint,
      objecaoBloco: objecao,
      contact: { name: null, custom_fields: {} },
      escolhida: null,
      fluxo: null,
    });
    expect(brief).toContain('## Brief do turno');
    expect(brief).toContain(hint);
    expect(brief).toContain(objecao);
  });

  it('mantém TODOS os fatos do bloco de estado', () => {
    const input = {
      estagioHint: '',
      objecaoBloco: '',
      contact: {
        name: 'Vander',
        custom_fields: {
          cidade: 'São José dos Campos',
          cnh: true,
          cpf: '097.908.906-99',
          data_nascimento: '1989-02-26',
        },
      },
      escolhida: TWISTER,
      valoresDoFluxo: { moto_troca: 'cg 125' },
      descricaoDaMoto: { nome: TWISTER.nome, texto: 'Única dona, revisões em dia.' },
      fluxo: null,
    } as const;

    const original = renderBlocoDeEstado({
      contact: input.contact,
      escolhida: input.escolhida,
      valoresDoFluxo: input.valoresDoFluxo,
      descricaoDaMoto: input.descricaoDaMoto,
    });
    const brief = renderBriefDoTurno(input);

    // Todo o CORPO do bloco original (sem o cabeçalho `## ...`) está no brief.
    const corpo = original.split('\n').slice(1).join('\n');
    for (const linha of corpo.split('\n').filter((l) => l.trim() !== '')) {
      expect(brief).toContain(linha);
    }
    expect(brief).not.toContain('## Estado do atendimento');
    expect(brief).toContain('Moto escolhida pelo cliente: CB 300 F Twister (2025, Vermelho)');
    expect(brief).toContain('CPF: 097.908.906-99');
  });

  it('mantém os fatos das perguntas pendentes do fluxo', () => {
    const f = estado({
      situacao: {
        pendentes: [
          pendente({ key: 'cnh', label: 'Tem CNH?', type: 'boolean', required: true, permite_correcao: true, question: 'Você tem CNH?' }),
          pendente({ key: 'entrada', label: 'Entrada', type: 'number', required: false, permite_correcao: false }),
          pendente({ key: 'cor', label: 'Cor', type: 'select', required: true, permite_correcao: true, options: ['azul', 'vermelha'] }),
        ],
        obrigatoriosPendentes: [],
        esgotadas: [],
        skills: [],
        completo: false,
      },
    });
    const brief = renderBriefDoTurno({
      estagioHint: '',
      objecaoBloco: '',
      contact: { name: null, custom_fields: {} },
      escolhida: null,
      fluxo: f,
    });

    expect(brief).toContain('Fluxo de atendimento "Financiamento" ativo');
    expect(brief).toContain('no máximo 3x');
    expect(brief).toContain('- Tem CNH? (key cnh, tipo boolean, obrigatória).');
    expect(brief).toContain('perguntar: "Você tem CNH?".');
    expect(brief).toContain('- Entrada (key entrada, tipo number, opcional).');
    expect(brief).toContain('não aceita correção.');
    expect(brief).toContain('- Cor (key cor, tipo select, obrigatória).');
    expect(brief).toContain('opções: azul, vermelha.');
  });

  it('fluxo concluído informa a skill final', () => {
    const f = estado({ situacao: { pendentes: [], obrigatoriosPendentes: [], esgotadas: [], skills: [], completo: true } });
    const brief = renderBriefDoTurno({
      estagioHint: '',
      objecaoBloco: '',
      contact: { name: null, custom_fields: {} },
      escolhida: null,
      fluxo: f,
      finalizacao: { tipo: 'skill', skill_name: 'fechamento' },
    });
    expect(brief).toContain('Fluxo de atendimento "Financiamento": concluído — puxe a skill fechamento.');
  });

  it('é mais enxuto que a soma dos quatro blocos crus', () => {
    const f = estado({
      situacao: {
        pendentes: [
          pendente({ key: 'cnh', label: 'Tem CNH?', type: 'boolean', required: true, permite_correcao: true, question: 'Você tem CNH?' }),
          pendente({ key: 'entrada', label: 'Entrada', type: 'number', required: false, permite_correcao: true }),
        ],
        obrigatoriosPendentes: [],
        esgotadas: [],
        skills: [],
        completo: false,
      },
    });
    const estadoInput = {
      contact: { name: 'Vander', custom_fields: { cidade: 'SJC', cnh: true } },
      escolhida: TWISTER,
      valoresDoFluxo: { moto_troca: 'cg 125' },
      descricaoDaMoto: { nome: TWISTER.nome, texto: 'Única dona.' },
    };
    const crus = [
      renderBlocoDeEstado(estadoInput),
      renderBlocoDeAtendimento(f),
      renderBlocoObjecao('persuadir'),
      renderStageHint('negotiating', 'qualified'),
    ].join('\n\n');
    const brief = renderBriefDoTurno({
      estagioHint: renderStageHint('negotiating', 'qualified'),
      objecaoBloco: renderBlocoObjecao('persuadir'),
      fluxo: f,
      ...estadoInput,
    });
    expect(brief.length).toBeLessThan(crus.length);
  });
});

describe('renderDiretrizDoTurno', () => {
  it('1ª/2ª: convencer, NÃO oferecer motos', () => {
    const d = renderDiretrizDoTurno({ acao: 'persuadir_1', motivo: 'preco', attempts: 1, pedirValor: true });
    expect(d).toContain('objeção de PREÇO');
    expect(d).toContain('NÃO liste motos');
  });

  it('3ª: convencer E perguntar (com valor se preço)', () => {
    const d = renderDiretrizDoTurno({ acao: 'persuadir_3_e_perguntar', motivo: 'preco', attempts: 3, pedirValor: true });
    expect(d).toContain('NA MESMA mensagem');
    expect(d).toContain('qual valor');
    expect(d).toContain('NÃO chame handoff');
  });

  it('mostrar_opcoes: anunciar, não listar nomes', () => {
    expect(renderDiretrizDoTurno({ acao: 'mostrar_opcoes', motivo: 'km', attempts: 3, pedirValor: false })).toContain('CONFIRMOU');
  });

  it('encaminhar: handoff sem prometer', () => {
    const d = renderDiretrizDoTurno({ acao: 'encaminhar_e_encerrar', motivo: 'preco', attempts: 3, pedirValor: false });
    expect(d).toContain('encaminhar ao responsável');
    expect(d).toContain('NÃO ofereça desconto');
  });
});
