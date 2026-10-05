/**
 * P2.2 — A SEQUÊNCIA DA NEGOCIAÇÃO 1→2→3→(confirma|nega), determinística.
 *
 * O plano pede prova ao vivo, mas o modelo do agente (`glm-5.3-flash`) estoura
 * 45–210s de forma intermitente (P4.4/P5.1), o que torna a prova ao vivo poluída
 * e não-reprodutível. Esta suíte prova a REGRA no nível dos módulos puros que o
 * turno encadeia — sem LLM, sem rede —, que é o que precisa ser verdadeiro:
 *
 *   Jev escolhe a ação (negociacao.ts) → fase do bloco (faseDaAcao) → diretriz
 *   (renderDiretrizDoTurno), e o encaminhamento da negativa reusa o aviso.
 *
 * A prova ao vivo fica registrada como pendente por dependência do modelo (P4.4).
 */
import { describe, expect, it } from 'vitest';

import {
  acaoDaNegociacaoJev,
  ofereceMotosPorAcao,
  type ContextoDeNegociacao,
} from '@/lib/ai/jev/pontos/negociacao';
import { faseDaAcao } from '@/lib/agent-engine/agent/negociacao-jev';
import { renderDiretrizDoTurno } from '@/lib/agent-engine/agent/brief-do-turno';
import type { RespostasDeJev } from '@/lib/ai/jev/tipos';

function resp(choice: string, extra: Partial<RespostasDeJev> = {}): RespostasDeJev {
  return {
    acao: { type: 'choice', choice, confidence: 1, probabilities: {} },
    ...extra,
  };
}

/** O turno: recebe o contexto e devolve ação/fase/diretriz — como o motor encadeia. */
function turno(ctx: ContextoDeNegociacao, respostas: RespostasDeJev) {
  const { acao, pedirValor } = acaoDaNegociacaoJev(respostas);
  return {
    acao,
    fase: faseDaAcao(acao),
    ofereceMotos: ofereceMotosPorAcao(acao),
    // A diretriz usa a mesma nomenclatura das respostas; aqui mapeamos direto.
    diretriz: renderDiretrizDoTurno({
      acao,
      motivo: ctx.motivo,
      attempts: ctx.attempts + 1,
      pedirValor,
    }),
  };
}

describe('sequência de negociação 1→2→3→confirma/nega', () => {
  it('1ª objeção → persuadir_1, NÃO oferece motos, diretriz manda não listar', () => {
    const t = turno(
      { motivo: 'preco', attempts: 0, confirmou: false, negou: false, desconto: false },
      resp('persuadir_1'),
    );
    expect(t.acao).toBe('persuadir_1');
    expect(t.fase).toBe('persuadir');
    expect(t.ofereceMotos).toBe(false);
    expect(t.diretriz).toContain('NÃO liste motos');
  });

  it('2ª objeção → persuadir_2 (ângulo diferente), NÃO oferece', () => {
    const t = turno(
      { motivo: 'preco', attempts: 1, confirmou: false, negou: false, desconto: false },
      resp('persuadir_2'),
    );
    expect(t.acao).toBe('persuadir_2');
    expect(t.fase).toBe('persuadir2');
    expect(t.ofereceMotos).toBe(false);
    expect(t.diretriz).toContain('ÂNGULO DIFERENTE');
  });

  it('3ª objeção → persuadir_3_e_perguntar: pergunta e pede valor (preço)', () => {
    const t = turno(
      { motivo: 'preco', attempts: 2, confirmou: false, negou: false, desconto: false },
      resp('persuadir_3_e_perguntar', {
        pedir_valor: { type: 'noul', noul: 0.9 },
      }),
    );
    expect(t.acao).toBe('persuadir_3_e_perguntar');
    expect(t.fase).toBe('oferecer');
    expect(t.ofereceMotos).toBe(false);
    expect(t.diretriz).toContain('qual valor ele tem em mente');
  });

  it('confirma → mostrar_opcoes: SÓ aqui oferece motos', () => {
    const t = turno(
      { motivo: 'preco', attempts: 3, confirmou: true, negou: false, desconto: false },
      resp('mostrar_opcoes'),
    );
    expect(t.acao).toBe('mostrar_opcoes');
    expect(t.fase).toBe('mostrar');
    expect(t.ofereceMotos).toBe(true);
    expect(t.diretriz).toContain('CONFIRMOU');
  });

  it('nega → encaminhar_e_encerrar: fase encaminhar, NÃO oferece e NÃO chama o handoff duro', () => {
    const t = turno(
      { motivo: 'preco', attempts: 3, confirmou: false, negou: true, desconto: false },
      resp('encaminhar_e_encerrar'),
    );
    expect(t.acao).toBe('encaminhar_e_encerrar');
    expect(t.fase).toBe('encaminhar');
    expect(t.ofereceMotos).toBe(false);
    // Encaminha ao responsável e SEGUE atendendo: NÃO chama o handoff duro
    // (que silencia o bot e deixaria o próximo turno mudo).
    expect(t.diretriz).toContain('NÃO chame `crm_request_human_handoff`');
  });

  it('desconto (regra proibida) → handoff, sem prometer', () => {
    const t = turno(
      { motivo: 'preco', attempts: 1, confirmou: false, negou: false, desconto: true },
      resp('handoff'),
    );
    expect(t.acao).toBe('handoff');
    expect(t.fase).toBe('handoff');
    expect(t.ofereceMotos).toBe(false);
    expect(t.diretriz).toContain('NÃO ofereça desconto');
  });

  it('mudou o tipo → reinicia (attempts do banco zera por tópico)', () => {
    // A contagem é POR tópico (`objecao:<motivo>`); mudar de preço → km é um novo
    // tópico, então o motor passa `attempts: 0` e a próxima ação é persuadir_1.
    const t = turno(
      { motivo: 'km', attempts: 0, confirmou: false, negou: false, desconto: false },
      resp('persuadir_1'),
    );
    expect(t.acao).toBe('persuadir_1');
    expect(t.fase).toBe('persuadir');
  });
});
