import { describe, expect, it } from "vitest";

import type { FlowNode } from "@/lib/followup/graph-schema";
import {
  renderBlocoDeAtendimento,
  situacaoDoChecklist,
  type EstadoDeAtendimento,
} from "@/lib/followup/atendimento";
import { renderBriefDoTurno } from "@/lib/agent-engine/agent/brief-do-turno";

/**
 * UMA PERGUNTA POR VEZ (medido ao vivo, 2026-10-06).
 *
 * Com o fluxo de Qualificação ativo, o modelo somou à pergunta do sistema
 * ("De qual cidade você fala?") uma pergunta PRÓPRIA de fechamento ("Pra eu te
 * ajudar a fechar, você prefere vir conhecer ela na loja ou quer que eu te mande
 * mais detalhes dela?"). O cliente só responde uma por vez; a do modelo ficou
 * pendente e voltou quase idêntica no turno seguinte ("...quer vir conhecer ela
 * na loja aqui em São José dos Campos ou prefere que eu já te passe mais
 * detalhes dela?").
 *
 * O conserto é de CONTEXTO (a Jev decide): enquanto houver campo pendente, a vez
 * é do SISTEMA e o modelo não abre pergunta própria. Aqui fixamos a instrução nos
 * DOIS renderizadores — o bloco cru e o brief compacto da Jev.
 */

function collectNode(key: string): Extract<FlowNode, { type: "collect" }> {
  return {
    id: key,
    type: "collect",
    label: key,
    position: { x: 0, y: 0 },
    config: { key, label: key, type: "text", required: true, permite_correcao: true },
  } as Extract<FlowNode, { type: "collect" }>;
}

function estado(): EstadoDeAtendimento {
  const node = collectNode("cidade");
  const checklist = {
    passos: [{ kind: "collect" as const, node }],
    fim: {
      id: "e",
      type: "end",
      label: "fim",
      position: { x: 0, y: 0 },
      config: { outcome: "converted" },
    } as Extract<FlowNode, { type: "end" }>,
  };
  return {
    enrollment: {
      id: "enr-1",
      pointer_id: "p-1",
      version_id: "v-1",
      contact_id: "ct-1",
      current_node_id: "cidade",
      status: "active",
    },
    nomeDoFluxo: "Qualificação",
    checklist,
    valores: {},
    tentativas: {},
    maxTentativas: 3,
    situacao: situacaoDoChecklist(checklist, new Set()),
  };
}

describe("com fluxo pendente, o modelo não abre pergunta própria", () => {
  it("o bloco cru do fluxo manda deixar a pergunta com o SISTEMA", () => {
    const bloco = renderBlocoDeAtendimento(estado());
    expect(bloco).toMatch(/NÃO faça NENHUMA pergunta por sua iniciativa/);
    expect(bloco).toMatch(/uma por vez|UMA pergunta por vez/i);
  });

  it("o brief compacto da Jev carrega a mesma regra (senão a Jev ignora)", () => {
    const brief = renderBriefDoTurno({
      estagioHint: "",
      objecaoBloco: "",
      contact: { name: "Vander", custom_fields: {} },
      escolhida: null,
      fluxo: estado(),
    });
    expect(brief).toMatch(/não abra OUTRA pergunta/i);
    expect(brief).toMatch(/a vez é do sistema/i);
  });

  it("sem pendentes (fluxo concluído) a regra de 'uma pergunta por vez' sai do bloco", () => {
    const e = estado();
    e.situacao = situacaoDoChecklist(e.checklist, new Set(["cidade"]));
    const bloco = renderBlocoDeAtendimento(e);
    expect(bloco).not.toMatch(/NÃO faça NENHUMA pergunta por sua iniciativa/);
  });
});
