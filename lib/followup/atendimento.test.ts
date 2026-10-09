import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";

import type { FlowEdge, FlowGraph, FlowNode } from "./graph-schema";
import { finalizarFluxoDeAtendimento, mapearChecklist, melhorFluxoPorGatilho, montarNotaDeConclusao, persistirDadosDoContato, lerFluxosPendentes, salvarFluxosPendentes, limparFluxosPendentes, enfileirarFluxo, fluxosPorGatilho, processarInboundDoFluxo, renderBlocoDeAtendimento, situacaoDoChecklist, valoresConhecidosDoContato, carregarEstadoDeAtendimento, escolherFluxoPeloGatilho, normalizarNomeDeFluxo, escolherFluxoPorNome, type ChecklistDeAtendimento, type EstadoDeAtendimento } from "./atendimento";

function no(node: Partial<FlowNode> & Pick<FlowNode, "id" | "type" | "config">): FlowNode {
  return { label: node.id, position: { x: 0, y: 0 }, ...node } as FlowNode;
}

function aresta(source: string, target: string): FlowEdge {
  return { id: `${source}-${target}`, source, target, priority: 0, condition: { type: "always" } };
}

function grafo(nodes: FlowNode[], edges: FlowEdge[]): FlowGraph {
  return { nodes, edges } as FlowGraph;
}

const collect = (id: string, key: string, required = true) =>
  no({ id, type: "collect", config: { key, label: key, type: "text", required, permite_correcao: true } });
const skill = (id: string, nome: string) => no({ id, type: "skill", config: { skill_name: nome } });
const trigger = (id: string) => no({ id, type: "trigger", config: {} });
const end = (id: string) => no({ id, type: "end", config: { outcome: "converted" } });

describe("mapearChecklist", () => {
  it("lê a sequência trigger → pergunta → skill → fim", () => {
    const r = mapearChecklist(
      grafo(
        [trigger("t"), collect("c1", "cidade"), skill("s1", "catalogo-apresentacao"), end("e")],
        [aresta("t", "c1"), aresta("c1", "s1"), aresta("s1", "e")],
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.checklist.passos.map((p) => p.kind)).toEqual(["collect", "skill"]);
      expect(r.checklist.fim.id).toBe("e");
    }
  });

  it("recusa ramificação (mais de uma saída)", () => {
    const r = mapearChecklist(
      grafo(
        [trigger("t"), collect("c1", "cidade"), collect("c2", "cnh"), end("e")],
        [aresta("t", "c1"), aresta("t", "c2"), aresta("c1", "e"), aresta("c2", "e")],
      ),
    );
    expect(r.ok).toBe(false);
  });

  it("recusa nó que não é do atendimento", () => {
    const wait = no({ id: "w", type: "wait", config: { mode: "fixed", duration_ms: 300_000 } });
    const r = mapearChecklist(grafo([trigger("t"), wait, end("e")], [aresta("t", "w"), aresta("w", "e")]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("wait");
  });

  it("recusa ciclo", () => {
    const r = mapearChecklist(
      grafo([trigger("t"), collect("c1", "cidade"), end("e")], [aresta("t", "c1"), aresta("c1", "t")]),
    );
    expect(r.ok).toBe(false);
  });

  it("recusa sem gatilho único", () => {
    const r = mapearChecklist(grafo([collect("c1", "cidade"), end("e")], [aresta("c1", "e")]));
    expect(r.ok).toBe(false);
  });

  it("recusa quando não chega ao Fim", () => {
    const r = mapearChecklist(grafo([trigger("t"), collect("c1", "cidade")], [aresta("t", "c1")]));
    expect(r.ok).toBe(false);
  });
});

describe("melhorFluxoPorGatilho (entrada pelo motor)", () => {
  const fluxos = [
    { id: "q", nome: "Qualificação", gatilhos: ["quero uma moto", "interesse", "comprar"] },
    { id: "f", nome: "Financiamento", gatilhos: ["financiar", "parcela", "cpf"] },
    { id: "t", nome: "Troca", gatilhos: ["troca", "dar minha moto na troca"] },
  ];

  it("escolhe pelo maior número de gatilhos presentes", () => {
    expect(melhorFluxoPorGatilho(fluxos, "quero financiar, qual a parcela?")?.id).toBe("f");
  });

  it("ignora acento e caixa", () => {
    expect(melhorFluxoPorGatilho(fluxos, "QUERO DAR MINHA MOTO NA TROCA")?.id).toBe("t");
  });

  it("sem match devolve null", () => {
    expect(melhorFluxoPorGatilho(fluxos, "bom dia, tudo bem?")).toBeNull();
  });

  it("mais gatilhos na mesma mensagem vencem", () => {
    expect(melhorFluxoPorGatilho(fluxos, "tenho interesse, quero comprar")?.id).toBe("q");
  });
});

describe("situacaoDoChecklist", () => {
  const checklist: ChecklistDeAtendimento = {
    passos: [
      { kind: "collect", node: collect("c1", "cidade") as Extract<FlowNode, { type: "collect" }> },
      { kind: "skill", node: skill("s1", "catalogo-apresentacao") as Extract<FlowNode, { type: "skill" }> },
      { kind: "collect", node: collect("c2", "cnh") as Extract<FlowNode, { type: "collect" }> },
      { kind: "collect", node: collect("c3", "obs", false) as Extract<FlowNode, { type: "collect" }> },
    ],
    fim: end("e") as Extract<FlowNode, { type: "end" }>,
  };

  it("sem valores: tudo pendente e incompleto", () => {
    const s = situacaoDoChecklist(checklist, new Set());
    expect(s.pendentes.map((n) => n.config.key)).toEqual(["cidade", "cnh", "obs"]);
    expect(s.obrigatoriosPendentes.map((n) => n.config.key)).toEqual(["cidade", "cnh"]);
    expect(s.skills).toEqual(["catalogo-apresentacao"]);
    expect(s.completo).toBe(false);
  });

  it("com os obrigatórios preenchidos: a OPCIONAL continua pendente (percorre o fluxo até o Fim)", () => {
    const s = situacaoDoChecklist(checklist, new Set(["cidade", "cnh"]));
    expect(s.pendentes.map((n) => n.config.key)).toEqual(["obs"]);
    // "Opcional" = pode ser esgotada sem travar, NÃO pode ser pulada. Antes
    // este caso esperava `completo: true` e o efeito medido (2026-09-18) foi que
    // estado/documentação nunca eram perguntados no fluxo Troca.
    expect(s.completo).toBe(false);
  });

  it("com tudo preenchido: sem pendentes", () => {
    const s = situacaoDoChecklist(checklist, new Set(["cidade", "cnh", "obs"]));
    expect(s.pendentes).toHaveLength(0);
    expect(s.completo).toBe(true);
  });

  it("pergunta sem resposta que atingiu o teto vira esgotada e não bloqueia", () => {
    const s = situacaoDoChecklist(checklist, new Set(), {
      tentativas: { cidade: 3, cnh: 3 },
      maxTentativas: 3,
    });
    // As esgotadas saem de `pendentes`; a opcional `obs` segue pendente (será
    // perguntada) — por isso `completo` ainda é false.
    expect(s.pendentes.map((n) => n.config.key)).toEqual(["obs"]);
    expect(s.esgotadas.map((n) => n.config.key)).toEqual(["cidade", "cnh"]);
    expect(s.completo).toBe(false);
  });

  it("com tudo preenchido OU esgotado: completo (esgotar a opcional não trava)", () => {
    const s = situacaoDoChecklist(checklist, new Set(["cidade", "cnh"]), {
      tentativas: { obs: 3 },
      maxTentativas: 3,
    });
    expect(s.pendentes).toHaveLength(0);
    expect(s.completo).toBe(true);
  });

  it("abaixo do teto continua pendente", () => {
    const s = situacaoDoChecklist(checklist, new Set(), {
      tentativas: { cidade: 2 },
      maxTentativas: 3,
    });
    expect(s.pendentes.map((n) => n.config.key)).toEqual(["cidade", "cnh", "obs"]);
    expect(s.esgotadas).toHaveLength(0);
    expect(s.completo).toBe(false);
  });
});

describe("montarNotaDeConclusao (síntese do fluxo concluído)", () => {
  const built = mapearChecklist(
    grafo(
      [trigger("t"), collect("c1", "cidade"), collect("c2", "cnh"), end("e")],
      [aresta("t", "c1"), aresta("c1", "c2"), aresta("c2", "e")],
    ),
  );
  if (!built.ok) throw new Error("grafo de teste inválido");
  const lista = built.checklist;

  const estado = (valores: Record<string, string>): EstadoDeAtendimento => ({
    enrollment: {
      id: "enr",
      pointer_id: "ptr",
      version_id: "ver",
      contact_id: "ct",
      current_node_id: "n",
      status: "active",
    },
    nomeDoFluxo: "Qualificação",
    checklist: lista,
    valores,
    tentativas: {},
    maxTentativas: 3,
    situacao: situacaoDoChecklist(lista, new Set(Object.keys(valores))),
  });

  it("traz o nome do fluxo e os valores normalizados, na ordem das perguntas", () => {
    const nota = montarNotaDeConclusao(estado({ cidade: "Campinas", cnh: "true" }));
    expect(nota).toContain('Fluxo "Qualificação"');
    expect(nota).toContain("cidade: Campinas");
    expect(nota).toContain("cnh: true");
    expect(nota.indexOf("cidade:")).toBeLessThan(nota.indexOf("cnh:"));
  });

  it("marca o que NÃO foi respondido em vez de omitir (o próximo passo sabe o que ficou aberto)", () => {
    const nota = montarNotaDeConclusao(estado({ cidade: "Campinas" }));
    expect(nota).toContain("cnh: (não respondido)");
  });

  it("injeta a síntese do fluxo anterior no bloco do turno (passa-bastão)", () => {
    const comNota = { ...estado({ cidade: "Campinas" }), notaAnterior: 'Fluxo "Qualificação" — cidade: Campinas' };
    expect(renderBlocoDeAtendimento(comNota)).toContain(
      'Contexto do atendimento anterior: Fluxo "Qualificação" — cidade: Campinas',
    );
    // Sem nota anterior, o cabeçalho falso não aparece.
    expect(renderBlocoDeAtendimento(estado({ cidade: "Campinas" }))).not.toContain(
      "Contexto do atendimento anterior",
    );
  });
});

describe("finalizarFluxoDeAtendimento (conclusão + encadeamento da venda)", () => {
  const endCom = (ao: unknown) =>
    no({
      id: "e",
      type: "end",
      config: { outcome: "converted", ao_finalizar: ao } as Extract<
        FlowNode,
        { type: "end" }
      >["config"],
    }) as Extract<FlowNode, { type: "end" }>;

  function estadoComFim(ao: unknown, pointerId: string): EstadoDeAtendimento {
    const built = mapearChecklist(
      grafo(
        [trigger("t"), collect("c1", "cidade"), endCom(ao)],
        [aresta("t", "c1"), aresta("c1", "e")],
      ),
    );
    if (!built.ok) throw new Error("grafo de teste inválido");
    return {
      enrollment: {
        id: "enr-A",
        pointer_id: pointerId,
        version_id: "ver-A",
        contact_id: "ct",
        current_node_id: "c1",
        status: "active",
      },
      nomeDoFluxo: "Qualificação",
      checklist: built.checklist,
      valores: { cidade: "Campinas" },
      tentativas: {},
      maxTentativas: 3,
      situacao: situacaoDoChecklist(built.checklist, new Set(["cidade"])),
    };
  }

  /** Dublê de `pg.Pool`: registra SQL/parâmetros e responde por assinatura. */
  function poolFake() {
    const sqls: string[] = [];
    const params: unknown[][] = [];
    const query = async (sql: string, values: unknown[] = []) => {
      sqls.push(sql);
      params.push(values);
      if (/select p\.active_version_id, v\.graph/.test(sql)) {
        return {
          rows: [
            {
              active_version_id: "ver-B",
              graph: grafo(
                [trigger("tB"), collect("cB", "outro"), end("eB")],
                [aresta("tB", "cB"), aresta("cB", "eB")],
              ),
            },
          ],
        };
      }
      if (/insert into followup_enrollments/.test(sql)) return { rows: [{ id: "enr-B" }] };
      return { rows: [] };
    };
    return { pool: { query } as unknown as pg.Pool, sqls, params };
  }

  it("grava a síntese em completion_note e emite concluido", async () => {
    const { pool, sqls, params } = poolFake();
    await finalizarFluxoDeAtendimento(pool, {
      organizationId: "org",
      estado: estadoComFim({ tipo: "nada" }, "A"),
    });
    const update = sqls.findIndex((s) => /update followup_enrollments/.test(s));
    expect(update).toBeGreaterThanOrEqual(0);
    expect(sqls[update]).toContain("completion_note");
    expect(params[update]).toContain('Fluxo "Qualificação" — cidade: Campinas');
    expect(sqls.some((s) => /insert into contact_flow_events/.test(s))).toBe(true);
  });

  it("encadeia o próximo fluxo e emite encadeou", async () => {
    const { pool, sqls } = poolFake();
    const r = await finalizarFluxoDeAtendimento(pool, {
      organizationId: "org",
      estado: estadoComFim({ tipo: "proximo_fluxo", fluxo: "B" }, "A"),
    });
    expect(r.proximoEnrollmentId).toBe("enr-B");
    expect(sqls.some((s) => /insert into followup_enrollments/.test(s))).toBe(true);
    expect(sqls.filter((s) => /insert into contact_flow_events/.test(s)).length).toBeGreaterThanOrEqual(2);
  });

  it("NÃO encadeia para si mesmo (evita laço sem fim)", async () => {
    const { pool, sqls } = poolFake();
    const r = await finalizarFluxoDeAtendimento(pool, {
      organizationId: "org",
      estado: estadoComFim({ tipo: "proximo_fluxo", fluxo: "A" }, "A"),
    });
    expect(r.proximoEnrollmentId).toBeNull();
    expect(sqls.some((s) => /insert into followup_enrollments/.test(s))).toBe(false);
  });
});

describe("processarInboundDoFluxo — estado já completo conclui e encadeia", () => {
  it("sem pendentes e completo: NÃO devolve cedo — fecha o fluxo (era o bug do teste ao vivo)", () => {
    const src = readFileSync(join(process.cwd(), "lib/followup/atendimento.ts"), "utf8");
    // O caminho `primeiro === undefined` precisa considerar `completo` e chamar
    // o finalizador; antes ele retornava direto e o enrollment ficava `active`.
    expect(src).toMatch(/if \(primeiro === undefined\) \{[\s\S]*estado\.situacao\.completo[\s\S]*finalizarFluxoDeAtendimento/);
  });
});

describe("idempotência do inbound do fluxo (retry de job não reprocessa)", () => {
  it("processarInboundDoFluxo corta por message_id já visto na trilha", () => {
    const src = readFileSync(join(process.cwd(), "lib/followup/atendimento.ts"), "utf8");
    // A checagem precisa existir ANTES de qualquer gravação e filtrar por
    // enrollment + message_id, contando eventos resposta/fora_do_fluxo.
    expect(src).toMatch(/from contact_flow_events[\s\S]*message_id = \$3[\s\S]*kind in \('resposta','fora_do_fluxo'\)/);
    expect(src).toMatch(/if \(\(ja\.rows\[0\]\?\.n \?\? 0\) > 0\) return \{ estado, concluiu: false \}/);
  });
});

describe("captura MULTI-campo (2026-09-21)", () => {
  it("aceita QUALQUER pendente, não só o primeiro (senão só o 1º campo é gravado)", () => {
    const src = readFileSync(join(process.cwd(), "lib/followup/atendimento.ts"), "utf8");
    // Medido ao vivo: o validador devolveu os 5 campos, mas a gravação só aceitou
    // `moto_troca` porque `ehPendente` comparava só com `pendentes[0]`.
    expect(src).toMatch(/const ehPendente = estado\.situacao\.pendentes\.some\(/);
  });
});

describe("auditoria 2026-09-19 — o nao_respondeu do validador cai no classificador puro", () => {
  it("distinguir aceno (conta tentativa) de desvio (não conta) preserva o teto", () => {
    const src = readFileSync(join(process.cwd(), "lib/followup/atendimento.ts"), "utf8");
    // O validador trata respostas/correções no bloco `validacoes`; o caminho SEM
    // validação decide pelo classificador puro (aceno conta tentativa; desvio não).
    // Antes era `: { resultado: "desviou" }`, e TODO nao_respondeu virava desvio —
    // "ok"/emoji nunca esgotavam a pergunta (max_tentativas_pergunta inerte).
    expect(src).toMatch(
      /if \(args\.validacoes !== undefined[\s\S]*classificarInbound\(comoCampoParaCaptura\(primeiro\), args\.texto\)/,
    );
    expect(src).not.toMatch(/:\s*\{ resultado: "desviou" as const \};/);
  });
});

describe("desvio (off-flow) conta a pergunta feita (decisão do dono 2026-10-08)", () => {
  it("o ramo `desviou` incrementa a tentativa — o teto de 3 passa a disparar", () => {
    const src = readFileSync(join(process.cwd(), "lib/followup/atendimento.ts"), "utf8");
    // Antes o desvio não contava: o cliente falava de outro assunto e o CNH era
    // reperguntado para sempre. Agora o ramo `fora_do_fluxo` também incrementa.
    expect(src).toMatch(/kind: "fora_do_fluxo"[\s\S]*registrarTentativaDoTurno/);
  });
});

describe("P4 — o caminho do VALIDADOR também conta tentativa (2026-10-09)", () => {
  it("validações aplicadas mas 1ª pendente não respondida → incrementa attempts", () => {
    const src = readFileSync(join(process.cwd(), "lib/followup/atendimento.ts"), "utf8");
    // Antes, o ramo `validacoes` retornava cedo SEM contar tentativa → a pergunta
    // (ex.: troca_km) reperguntava para sempre (medido ao vivo 2026-10-09).
    expect(src).toMatch(
      /primeiroKeyInicial !== undefined && !valoresNovos\[primeiroKeyInicial\][\s\S]*registrarTentativaDoTurno/,
    );
    // O ramo `!aplicou` (nada aplicado) também conta — a pergunta não foi respondida.
    expect(src).toMatch(/if \(!aplicou\) \{[\s\S]*registrarTentativaDoTurno/);
    // A chave da 1ª pendente é capturada no INÍCIO do turno.
    expect(src).toMatch(/const primeiroKeyInicial = estado\.situacao\.pendentes\[0\]\?\.config\.key/);
  });
});

describe("contexto da Jev no fluxo (decisão do dono 2026-10-08)", () => {
  it("a Jev recebe ~20 mensagens de contexto (não só as últimas 6, nem a conversa toda)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/agent-engine/agent/inbound-turn.ts"),
      "utf8",
    );
    expect(src).toMatch(/const historico = effectiveContext\.messages\.slice\(-20\)\.map/);
    expect(src).not.toMatch(/effectiveContext\.messages\.slice\(-6\)/);
    expect(src).not.toMatch(/const historico = effectiveContext\.messages\.map/);
  });

  it("quando a Jev diz `nao_respondeu`, o classificador determinístico (regex) AINDA roda como reserva", () => {
    // O desenho do dono: a Jev decide primeiro; se ela diz que NADA respondeu, o
    // regex é a REDE (captura sim/não, número, data, escolha que a Jev deixou passar).
    // Por isso NÃO existe um curto-circuito `validadoPelaJev` pulando o classificador.
    const src = readFileSync(join(process.cwd(), "lib/followup/atendimento.ts"), "utf8");
    expect(src).not.toMatch(/args\.validadoPelaJev/);
    expect(src).toMatch(/classificarInbound\(comoCampoParaCaptura\(primeiro\), args\.texto\)/);
  });
});

describe("valoresConhecidosDoContato (dado já gravado não se pergunta de novo)", () => {
  it("lê cada chave de custom_fields como texto", () => {
    expect(
      valoresConhecidosDoContato({
        name: null,
        custom_fields: { cidade: "Campinas", cnh: true, cpfs: 0, vazio: "  " },
      }),
    ).toEqual({ cidade: "Campinas", cnh: "sim", cpfs: "0" });
  });

  it("o nome do contato (WhatsApp) vence o custom_field `nome`", () => {
    expect(
      valoresConhecidosDoContato({ name: "Vander", custom_fields: { nome: "Outro" } }).nome,
    ).toBe("Vander");
    expect(valoresConhecidosDoContato({ name: null, custom_fields: { nome: "Ana" } }).nome).toBe(
      "Ana",
    );
  });

  it("sem `name`, o `display_name` do WhatsApp vale como nome conhecido", () => {
    // O nome que o WhatsApp entrega no primeiro contato mora em `display_name`,
    // não em `name`. Enquanto esta função lia só `name`, o fluxo reperguntava o
    // nome de quem chegou com perfil do WhatsApp (medido ao vivo: saudou
    // "Vander" e perguntou "Como você se chama?").
    expect(
      valoresConhecidosDoContato({ name: null, display_name: "Vander", custom_fields: {} }).nome,
    ).toBe("Vander");
  });

  it("`name` (dito pelo cliente) vence o `display_name` (perfil do WhatsApp)", () => {
    expect(
      valoresConhecidosDoContato({
        name: "Vanderlei Souza",
        display_name: "Vander",
        custom_fields: {},
      }).nome,
    ).toBe("Vanderlei Souza");
  });

  it("null/array/objeto vazio devolvem {}", () => {
    expect(valoresConhecidosDoContato(null)).toEqual({});
    expect(valoresConhecidosDoContato(undefined)).toEqual({});
    expect(valoresConhecidosDoContato({ custom_fields: [] })).toEqual({});
  });
});

describe("persistirDadosDoContato — dado coletado sobrevive ao fim do fluxo", () => {
  it("grava só campos de cadastro, normaliza cnh e descarta chaves do fluxo/vazias", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    await persistirDadosDoContato({ query } as unknown as pg.Pool, {
      organizationId: "org",
      contactId: "ct",
      valores: {
        cnh: "true",
        cidade: "São José dos Campos",
        nome: "",
        cpf: "123",
        moto_troca: "cg 125",
      },
    });
    expect(query).toHaveBeenCalledTimes(1);
    const params = query.mock.calls[0]![1] as unknown[];
    expect(JSON.parse(String(params[2]))).toEqual({
      cidade: "São José dos Campos",
      cnh: true,
      cpf: "123",
    });
  });

  it("sem campo de cadastro → não toca no banco", async () => {
    const query = vi.fn();
    await persistirDadosDoContato({ query } as unknown as pg.Pool, {
      organizationId: "org",
      contactId: "ct",
      valores: { moto_troca: "cg 125", troca_ano: "2015" },
    });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("fila de fluxos pendentes", () => {
  const pool = (query: ReturnType<typeof vi.fn>) => ({ query } as unknown as pg.Pool);

  it("enfileirar: preserva a ordem e não duplica", () => {
    let fila = enfileirarFluxo([], { pointer_id: "troca", nome: "Troca" });
    fila = enfileirarFluxo(fila, { pointer_id: "fin", nome: "Financiamento" });
    fila = enfileirarFluxo(fila, { pointer_id: "troca", nome: "Troca" });
    expect(fila.map((f) => f.pointer_id)).toEqual(["troca", "fin"]);
  });

  it("fluxosPorGatilho: devolve na ordem citada ('troca e financiar')", () => {
    const fluxos = [
      { id: "fin", nome: "Financiamento", gatilhos: ["financiar", "parcelar"] },
      { id: "troca", nome: "Troca", gatilhos: ["na troca", "dar minha moto"] },
    ];
    expect(fluxosPorGatilho(fluxos, "quero dar minha moto na troca e financiar o resto").map((f) => f.id)).toEqual([
      "troca",
      "fin",
    ]);
    expect(fluxosPorGatilho(fluxos, "bom dia")).toEqual([]);
  });

  it("ler: lista vazia quando não há fila ou o shape é inválido", async () => {
    const vazio = vi.fn(async () => ({ rows: [{ pendentes: null }] }));
    expect(
      await lerFluxosPendentes(pool(vazio), { organizationId: "org", conversationId: "cv" }),
    ).toEqual([]);
    const misto = vi.fn(async () => ({
      rows: [{ pendentes: [{ nome: "sem id" }, { pointer_id: "p3", nome: "Troca" }] }],
    }));
    expect(
      await lerFluxosPendentes(pool(misto), { organizationId: "org", conversationId: "cv" }),
    ).toEqual([{ pointer_id: "p3", nome: "Troca" }]);
  });

  it("salvar: grava o array jsonb da fila", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    await salvarFluxosPendentes(pool(query), {
      organizationId: "org",
      conversationId: "cv",
      pendentes: [{ pointer_id: "p3", nome: "Troca" }],
    });
    const params = query.mock.calls[0]![1] as unknown[];
    expect(JSON.parse(String(params[2]))).toEqual([{ pointer_id: "p3", nome: "Troca" }]);
  });

  it("limpar: remove a chave da fila", async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }));
    await limparFluxosPendentes(pool(query), { organizationId: "org", conversationId: "cv" });
    expect(String((query.mock.calls[0]![0] as string))).toContain("- 'fluxos_pendentes'");
  });
});

describe("escolherFluxoPorNome — nome do fluxo tolerante (não trava o modelo)", () => {
  const ativos = [
    { id: "f1", nome: "Qualificação" },
    { id: "f2", nome: "Financiamento" },
    { id: "f3", nome: "Troca" },
    { id: "f4", nome: "Venda ou Consignação" },
  ];

  it("casa exato ignorando caixa e acento", () => {
    expect(escolherFluxoPorNome(ativos, "qualificacao")?.id).toBe("f1");
    expect(escolherFluxoPorNome(ativos, "Financiamento")?.id).toBe("f2");
  });

  it("casa por nome parcial único ('troca de moto' → Troca)", () => {
    expect(escolherFluxoPorNome(ativos, "troca de moto")?.id).toBe("f3");
    expect(escolherFluxoPorNome(ativos, "venda")?.id).toBe("f4");
  });

  it("ambíguo ou inexistente → null (o chamador devolve a lista)", () => {
    expect(escolherFluxoPorNome(ativos, "xyz")).toBeNull();
    expect(escolherFluxoPorNome(ativos, "")).toBeNull();
  });

  it("normaliza espaços e acentos", () => {
    expect(normalizarNomeDeFluxo("  Venda   ou Consignação ")).toBe("venda ou consignacao");
  });
});

describe("carregarEstadoDeAtendimento — pendências consideram o contato, não só o fluxo", () => {
  function poolFake(opts: {
    contact: { name: string | null; display_name?: string | null; custom_fields: unknown };
    flowData?: Array<{ field_key: string; value: string | null; attempts: number }>;
  }) {
    const query = async (sql: string) => {
      if (/completion_note/.test(sql)) return { rows: [] };
      if (/from followup_enrollments e/.test(sql)) {
        return {
          rows: [
            {
              id: "enr-1",
              pointer_id: "p1",
              version_id: "v1",
              contact_id: "ct-1",
              current_node_id: "c1",
              status: "active",
              nome: "Qualificação",
              graph: grafo(
                [
                  trigger("t"),
                  collect("c1", "nome"),
                  collect("c2", "cidade"),
                  collect("c3", "cnh"),
                  end("e"),
                ],
                [
                  aresta("t", "c1"),
                  aresta("c1", "c2"),
                  aresta("c2", "c3"),
                  aresta("c3", "e"),
                ],
              ),
            },
          ],
        };
      }
      if (/from contact_flow_data/.test(sql)) return { rows: opts.flowData ?? [] };
      if (/select name, display_name, custom_fields from contacts/.test(sql)) {
        return { rows: [opts.contact] };
      }
      return { rows: [] };
    };
    return { query } as unknown as pg.Pool;
  }

  it("nome/cidade/CNH já no contato saem das pendentes; só o que falta é perguntado", async () => {
    const estado = await carregarEstadoDeAtendimento(
      poolFake({ contact: { name: "Vander", custom_fields: { cidade: "Campinas", cnh: true } } }),
      { organizationId: "org", contactId: "ct-1" },
    );
    expect(estado).not.toBeNull();
    expect(estado!.valores).toEqual({ nome: "Vander", cidade: "Campinas", cnh: "sim" });
    expect(estado!.situacao.pendentes).toHaveLength(0);
    expect(estado!.situacao.completo).toBe(true);
  });

  it("contato com só display_name (perfil do WhatsApp) não tem o nome reperguntado", async () => {
    const estado = await carregarEstadoDeAtendimento(
      poolFake({
        contact: {
          name: null,
          display_name: "Vander",
          custom_fields: { cidade: "sao paulo", cnh: true },
        },
      }),
      { organizationId: "org", contactId: "ct-1" },
    );
    expect(estado!.valores.nome).toBe("Vander");
    expect(estado!.situacao.pendentes).toHaveLength(0);
  });

  it("o valor do FLUXO vence o custom_field; chave estranha é ignorada", async () => {
    const estado = await carregarEstadoDeAtendimento(
      poolFake({
        contact: { name: "Vander", custom_fields: { cidade: "Campinas", extra: "não é do fluxo" } },
        flowData: [{ field_key: "cidade", value: "Santos", attempts: 1 }],
      }),
      { organizationId: "org", contactId: "ct-1" },
    );
    expect(estado!.valores.cidade).toBe("Santos");
    expect(estado!.valores.nome).toBe("Vander");
    expect(estado!.valores.extra).toBeUndefined();
    expect(estado!.situacao.pendentes.map((n) => n.config.key)).toEqual(["cnh"]);
  });
});

describe("resposta TARDIA a campo esgotado (não se perde)", () => {
  it("grava o valor de um campo encerrado por não resposta e conclui", async () => {
    const built = mapearChecklist(
      grafo([trigger("t"), collect("c1", "cpf"), end("e")], [aresta("t", "c1"), aresta("c1", "e")]),
    );
    if (!built.ok) throw new Error("grafo inválido");
    const tentativas = { cpf: 3 };
    const estado: EstadoDeAtendimento = {
      enrollment: {
        id: "enr-1",
        pointer_id: "p1",
        version_id: "v1",
        contact_id: "ct-1",
        current_node_id: "c1",
        status: "active",
      },
      nomeDoFluxo: "Financiamento",
      checklist: built.checklist,
      valores: {},
      tentativas,
      maxTentativas: 3,
      situacao: situacaoDoChecklist(built.checklist, new Set(), { tentativas, maxTentativas: 3 }),
    };
    // A pergunta esgotou (3 tentativas) e não está mais pendente.
    expect(estado.situacao.esgotadas.map((n) => n.config.key)).toEqual(["cpf"]);
    expect(estado.situacao.pendentes).toHaveLength(0);

    const sqls: string[] = [];
    const query = async (sql: string) => {
      sqls.push(sql);
      return { rows: [] };
    };
    const r = await processarInboundDoFluxo({ query } as never, {
      organizationId: "org",
      estado,
      texto: "meu cpf é 12345678900",
      validacoes: [{ campo: "cpf", valor: "12345678900" }],
    });
    expect(sqls.some((s) => /insert into contact_flow_data/.test(s))).toBe(true);
    expect(r.concluiu).toBe(true);
  });
});

describe("escolherFluxoPeloGatilho — fluxo concluído não reabre", () => {
  const grafoComGatilhos = (gatilhos: string[]): FlowGraph =>
    ({
      nodes: [trigger("t"), collect("c1", "x"), end("e")],
      edges: [aresta("t", "c1"), aresta("c1", "e")],
      settings: { gatilhos },
    }) as FlowGraph;

  function poolFake(): pg.Pool {
    const query = async (sql: string) => {
      if (/from followup_flow_pointers p/.test(sql)) {
        return {
          rows: [
            { id: "q", nome: "Qualificação", graph: grafoComGatilhos(["quero uma moto", "tenho interesse"]) },
            { id: "f", nome: "Financiamento", graph: grafoComGatilhos(["financiar", "financiamento"]) },
          ],
        };
      }
      if (/from followup_enrollments/.test(sql)) return { rows: [{ pointer_id: "q" }] };
      return { rows: [] };
    };
    return { query } as unknown as pg.Pool;
  }

  it("sem contactId escolhe o fluxo pelo gatilho (comportamento antigo)", async () => {
    const r = await escolherFluxoPeloGatilho(poolFake(), {
      organizationId: "o",
      texto: "quero uma moto",
    });
    expect(r?.id).toBe("q");
  });

  it("com contactId, fluxo já concluído não é reaberto", async () => {
    const r = await escolherFluxoPeloGatilho(poolFake(), {
      organizationId: "o",
      texto: "quero uma moto",
      contactId: "ct",
    });
    expect(r).toBeNull();
  });

  it("financiamento liga quando o assunto é financiar (fluxo ainda não concluído)", async () => {
    const r = await escolherFluxoPeloGatilho(poolFake(), {
      organizationId: "o",
      texto: "prefiro financiar",
      contactId: "ct",
    });
    expect(r?.id).toBe("f");
  });
});
