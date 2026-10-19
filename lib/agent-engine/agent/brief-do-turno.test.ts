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
    expect(brief).not.toContain('no máximo 3x');
    expect(brief).toContain('- Tem CNH? (key cnh, tipo boolean, obrigatória).');
    expect(brief).not.toContain('perguntar:');
    // Agora o modelo INCLUI a pergunta (copiada exatamente) na própria mensagem;
    // o sistema só a reenvia se ela não sair.
    expect(brief).toContain('inclua a pergunta pendente do fluxo COPIADA EXATAMENTE');
    expect(brief).toContain('Pergunta do fluxo a incluir (copie exatamente este texto): "Você tem CNH?"');
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
    // O brief DEDUPLICA/compacta os 4 blocos crus, mas também acrescenta REGRAS
    // FIXAS (tom/robô, não repetir, não fazer pitch, um fluxo por vez…) que não
    // existem nos blocos crus. Comparamos com uma folga pequena para essas regras.
    expect(brief.length).toBeLessThan(crus.length + 900);
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

  it('encaminhar_e_encerrar: avisa o responsável, SEGUE atendendo e NÃO chama o handoff duro', () => {
    const d = renderDiretrizDoTurno({ acao: 'encaminhar_e_encerrar', motivo: 'preco', attempts: 3, pedirValor: false });
    expect(d).toContain('SEGUE por aqui');
    expect(d).toContain('NÃO chame `request_human_handoff`');
    expect(d).toContain('NÃO ofereça desconto');
  });

  it('handoff (legado): avisa o responsável e SEGUE — NÃO chama o handoff duro', () => {
    const d = renderDiretrizDoTurno({ acao: 'handoff', motivo: 'preco', attempts: 2, pedirValor: false });
    expect(d).toContain('NÃO chame `request_human_handoff`');
    expect(d).not.toContain('Chame `request_human_handoff`');
    expect(d).toContain('NÃO ofereça desconto');
  });
});

describe('turno de CATÁLOGO — a venda fecha (mostrouMotos)', () => {
  const comPendente = estado({
    situacao: {
      pendentes: [
        pendente({ key: 'cidade', label: 'Cidade', type: 'text', required: false, permite_correcao: true, question: 'De qual cidade você fala?' }),
      ],
      obrigatoriosPendentes: [],
      esgotadas: [],
      skills: [],
      completo: false,
    },
  });
  const base = {
    estagioHint: '',
    objecaoBloco: '',
    contact: { name: null, custom_fields: {} },
    escolhida: null,
  };

  it('mostrouMotos=true → manda fechar a VENDA e NÃO faz a pergunta do fluxo', () => {
    const t = renderBriefDoTurno({ ...base, fluxo: comPendente, mostrouMotos: true });
    expect(t).toContain('VENDA');
    expect(t).not.toContain('COPIADA EXATAMENTE');
  });

  it('mostrouMotos ausente/false → inclui a pergunta do fluxo (comportamento atual)', () => {
    expect(renderBriefDoTurno({ ...base, fluxo: comPendente })).toContain('COPIADA EXATAMENTE');
    expect(renderBriefDoTurno({ ...base, fluxo: comPendente, mostrouMotos: false })).toContain('COPIADA EXATAMENTE');
  });

  it('com moto JÁ ESCOLHIDA → manda AQUISIÇÃO e NÃO "qual delas chamou mais atenção" (2026-10-15)', () => {
    const t = renderBriefDoTurno({
      ...base,
      escolhida: { nome: 'HONDA XRE 190', fotos: ['https://x/1.jpg'] } as never,
      fluxo: comPendente,
      mostrouMotos: true,
    });
    expect(t).toContain('JÁ ESCOLHEU');
    expect(t).toContain('ADQUIRIR');
    expect(t).not.toContain('convide a ESCOLHA');
  });
});

describe('catálogo liberado/bloqueado no brief', () => {
  const base2 = { estagioHint: '', objecaoBloco: '', contact: { name: null, custom_fields: {} }, escolhida: null, fluxo: null };
  it('podeOferecer=true → manda ANUNCIAR a exibição', () => {
    expect(renderBriefDoTurno({ ...base2, podeOferecer: true })).toContain('Motos LIBERADAS');
  });
  it('podeOferecer=false → manda NÃO prometer', () => {
    expect(renderBriefDoTurno({ ...base2, podeOferecer: false })).toContain('Catálogo BLOQUEADO');
  });
});

describe('F/B3 — o brief manda NÃO se repetir entre turnos (2026-10-13)', () => {
  const base3 = { estagioHint: '', objecaoBloco: '', contact: { name: null, custom_fields: {} }, escolhida: null, fluxo: null };
  it('contém a regra de não repetir a promessa já feita (quando há brief)', () => {
    const brief = renderBriefDoTurno({ ...base3, podeOferecer: true });
    expect(brief).toContain('Não se repita');
    expect(brief).toMatch(/NÃO repita a mesma frase/);
  });
  it('contém a regra de NÃO fazer pitch de specs não solicitado', () => {
    const brief = renderBriefDoTurno({ ...base3, podeOferecer: true });
    expect(brief).toContain('Não faça "pitch" não solicitado');
    expect(brief).toMatch(/SÓ quando o cliente PERGUNTAR/);
  });
  it('mantém o contrato "vazio ⇒ \'\'" (sem brief, nada a declarar)', () => {
    expect(renderBriefDoTurno(base3)).toBe('');
  });
});
