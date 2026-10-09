import { describe, expect, it } from "vitest";

import type { FlowNode } from "@/lib/followup/graph-schema";
import {
  renderBlocoDeAtendimento,
  situacaoDoChecklist,
  type EstadoDeAtendimento,
} from "@/lib/followup/atendimento";
import { renderBriefDoTurno } from "@/lib/agent-engine/agent/brief-do-turno";

/**
 * A PERGUNTA DO FLUXO SAI NA MESMA MENSAGEM (revisão 2026-10-09).
 *
 * Antes: com o fluxo ativo, o modelo era proibido de fazer a pergunta do fluxo
 * ("a vez é do sistema") — e, obedecendo, deixava de RESPONDER as dúvidas do
 * cliente (ex.: "qual a garantia?" ficou sem resposta; medido ao vivo 2026-10-09).
 *
 * Agora: o modelo responde TUDO o que o cliente disse E inclui a pergunta
 * pendente do fluxo (copiada exatamente) na MESMA mensagem; o motor só a reenvia
 * sozinho se ela não sair. A única proibição que permanece é abrir OUTRA pergunta
 * (visita, detalhes, fechamento) enquanto há campo pendente. Vale nos DOIS
 * renderizadores — o bloco cru e o brief compacto da Jev.
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

describe("com fluxo pendente, o modelo responde tudo E inclui a pergunta do fluxo", () => {
  it("o bloco cru manda incluir a pergunta (copiada exatamente) e NÃO abrir OUTRA pergunta", () => {
    const bloco = renderBlocoDeAtendimento(estado());
    expect(bloco).toMatch(/inclua a pergunta pendente do fluxo COPIADA EXATAMENTE/i);
    expect(bloco).toMatch(/NÃO abra OUTRA pergunta/i);
    expect(bloco).toContain('Pergunta do fluxo a incluir (copie exatamente este texto): "cidade?"');
    // Não proíbe mais o modelo de fazer a pergunta do fluxo.
    expect(bloco).not.toMatch(/NÃO faça a pergunta do fluxo/);
  });

  it("o brief compacto da Jev carrega a mesma regra", () => {
    const brief = renderBriefDoTurno({
      estagioHint: "",
      objecaoBloco: "",
      contact: { name: "Vander", custom_fields: {} },
      escolhida: null,
      fluxo: estado(),
    });
    expect(brief).toMatch(/inclua a pergunta pendente do fluxo COPIADA EXATAMENTE/i);
    expect(brief).toMatch(/NÃO abra OUTRA pergunta/i);
    expect(brief).toContain('"cidade?"');
  });

  it("sem pendentes (fluxo concluído) a regra sai do bloco", () => {
    const e = estado();
    e.situacao = situacaoDoChecklist(e.checklist, new Set(["cidade"]));
    const bloco = renderBlocoDeAtendimento(e);
    expect(bloco).not.toMatch(/NÃO abra OUTRA pergunta/);
  });
});
