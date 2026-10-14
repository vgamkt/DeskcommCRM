# Mapa do sistema × modelo pretendido + Plano

- **Data:** 2026-10-10
- **Base:** `/root/DeskcommCRM` @ `dcaf95ff`
- **Pergunta do dono:** "o motor tem que ser só um servidor, não carregador de regras; as IA devem ter poder de decisão" e "se chega mensagem nova antes de enviar, cancela e roda as próximas".
- **Status:** MAPA + PLANO (nenhuma mudança estrutural feita além da Camada 1).

---

## PARTE 1 — Como o sistema funciona hoje (mapa)

### 1.1 Caminho de uma mensagem (pipeline)
```
webhook WAHA/Datafy
  → messages (trigger fn_emit_message_event)
  → event_log: message.received
  → pos-entrada → event_log: ai_agent.dispatch_requested       (lib/channels/pos-entrada.ts:290)
  → drain.ts  (coalesce da rajada + anti-backlog)              (lib/agent-engine/edge/crm/drain.ts:62)
  → job_queue kind=inbound_turn                                (lib/agent-engine/queue/queue.ts:80)
  → workerLoop/claimJobs → runJob                              (workers/agent-worker/main.ts:388)
  → createInboundTurnHandler → runAgentTurn                    (inbound-turn.ts:7783 / :1990)
```
- **Rajada (burst):** mensagens do mesmo contato dentro de `INBOUND_DEBOUNCE_MS` (8s, teto 60s) viram **UM** job (`drain.ts:396-470`).
- **Cancelamento por mensagem nova: JÁ EXISTE**, em 3 pontos (por id, nunca por tempo):
  1. drain anti-backlog (`drain.ts:283-297`);
  2. gate `inbound_superada` no before_send (`before-send.ts:318`);
  3. fim do turno antes de enviar (`inbound-turn.ts:6979-6995`).

### 1.2 Onde as decisões/regras moram — e o tamanho do "motor carregador de regras"
- **Arquivo central:** `lib/agent-engine/agent/inbound-turn.ts` (~7.886 linhas) **orquestra e aplica centenas de regras**.
- **1 régua central** — `decidirOfertaDoTurno` (`inbound-turn.ts:3410`) encadeia **fluxo → negociação → Jev → regex**.
- **13 gates** de `before_send` (11 vetam) — `before-send.ts:780-794`.
- **~5 gates locais** no `send_message`.
- **3 breakers de tool** + breaker infra da Jev.
- **~30 funções puras de regex/heurística** (`selecao-por-intencao.ts`, `objecao-de-valor.ts`, `pode-oferecer-motos.ts`, `similaridade.ts`, `guardrails/`).
- **~15 OVERRIDES** onde o motor decide POR CIMA da Jev (o ponto crítico):
  - fluxo tem prioridade sobre oferta (`inbound-turn.ts:3420`);
  - negociação tem prioridade sobre oferta (`:3428`);
  - C-107: texto do modelo é trocado por `PERGUNTA_DE_ORCAMENTO` (`:3465,5347`);
  - Jev `perguntar` → `PERGUNTA_DE_NECESSIDADE` (`:3482`);
  - skill de catálogo removida quando a Jev nega (`:3641`) ou por objeção (`:3618`);
  - `motos` some do schema (Camada 1, `:4334`);
  - escolha da moto decidida ANTES do modelo e travada (`:6382,6719`);
  - pergunta do fluxo reenviada pelo motor se o modelo não a incluiu (`:7151-7257`).
- **~10 fail-safes** com contadores/degraus de veto (`:5466-5598`).

### 1.3 Jev (decisão) — o que ela decide hoje
- Decisão estruturada via `systemone` (`lib/ai/jev/`), provedor real: **typesafe/jev-latest** (bindings `__jev`).
- Pontos: `objecao, negociacao, offer_motos, skill_select, knowledge_route, catalog_criteria, moto_escolhida, flow_intent, stage_classifier, flow_validate, promise_semantic, …`.
- **Telemetria só em log** (`telemetria.ts:22`) — não entra em `llm_calls`.

### 1.4 Redação (LLM) — o que roda no turno
- `agent_turn` (a resposta), `operator_turn` (funil), `reescrita_avulso` (reescreve/junta), `checkpoint` (resumo), `jailbreak_detect` (guarda).
- Loop agêntico `stopWhen: stepCountIs(maxSteps=8)`, timeout `turn_model_timeout_ms=90000`.

---

## PARTE 2 — Modelo pretendido (dono) × realidade

| # | Modelo pretendido | Hoje | Situação |
|---|---|---|---|
| 1 | Identifica intenção pelo **histórico**, não só pela msg atual | rajada é lida, mas decisões chaveiam na msg pinada | **Parcial** |
| 2 | Depois sabe o que incluir no processamento | Jev decide skills/RAG, mas o motor injeta muitos blocos | **Parcial** |
| 3 | Rajada: desconsidera e reprocessa | coalesce 8s (junta); não "reprocessa do zero" | **Parcial** |
| 4 | No momento anterior decide skills e RAG | Jev (`skill_select`, `knowledge_route`) | **OK** |
| 5 | Motor junta tudo e entrega à LLM | junta, mas **carrega regras** | **Diverge** |
| 6 | LLM responde; se casou fluxo, nova chamada **só p/ unificar** (sem skills/jev), na base do histórico | existe `reescrita_avulso`, mas gera **2ª bolha** | **Diverge** |
| 7 | Regex só fallback quando nenhuma IA resolve | motor **sobrepõe** a Jev em ~15 pontos | **Diverge** |
| 8 | Abrir chamada + avisar controlador quando não resolve | handoff por lentidão / `request_human_handoff` | **OK** |
| 9 | Motor = **servidor**, não carregador de regras | ~centenas de regras no motor | **Diverge (raiz)** |
| 10 | IAs decidem, desde que não firam as regras | Jev decide alguns pontos; motor limita | **Parcial** |
| 11 | Se chega msg antes de enviar, cancela e roda as próximas | `inbound_superada` (3 pontos) | **OK** |

**Causa estrutural comum:** existem **dois decisores** (Jev e o motor/régua) e o motor **vence** em vários pontos. Isso cria contradição ("pode oferecer" vs "não pode"), loop, duplicação e a sensação de "regras por cima".

---

## PARTE 3 — Plano (por fases, cada uma testável)

### Fase 1 — Camada 1 (FEITA): oferta não insiste
`send_message` só expõe `motos` se a **mesma** decisão liberar. Matou o loop/timeout.
Evidência: `same_tool_failure` 0, timeout 0, 1ª resposta 41–53s.

### Fase 2 — "Um decisor só": enxugar os overrides do motor
**Objetivo:** o que o motor decide por cima hoje vira **decisão da Jev**; o motor só executa.
Itens (cada um com teste antes/depois):
- `decidirOfertaDoTurno` deixa de ter prioridades fixas: a Jev recebe fluxo/negociação no `state` e devolve **um** veredito (`pode_ofertar + pendencia + proxima_acao`).
- C-107 e `PERGUNTA_DE_NECESSIDADE`: a Jev decide "perguntar isto"; o motor só envia.
- Remoção de skill/trava de pergunta: viram instrução do veredito da Jev.
**Aceite:** nenhum `override` que contrarie a Jev; 407 testes verdes; roteiro real sem contradição.

### Fase 3 — Turno de sistema separado + fim da duplicação (Camada 2)
**Objetivo:** mensagem de sistema (fluxo/regra) sai em turno próprio, **sem cache**, **só regras inegociáveis**, foco no **pendente**, **unificando numa resposta**; e **1 resposta por turno** (fim da 2ª bolha do `reescrita_avulso`).
**Aceite:** 1 bolha por turno (catálogo ainda pode ter as fotos); turno de sistema sem catálogo/skills de venda.

### Fase 4 — Rajada como pacote rotulado (Camada 0)
**Objetivo:** a rajada vira **um pacote numerado** (cada item etiquetado: pergunta/resposta-a-fluxo/escolha/dado) e a Jev devolve, por item, `resolvido`/`pendente` ("o que falta responder").
**Aceite:** decisão nunca mais sobre uma msg isolada.

### Fase 5 — Motor como servidor
**Objetivo:** mover as regras atômicas para **trás de um contrato único** (a Jev decide; o motor monta/envia). Sem regex decidindo por cima.
**Aceite:** `inbound-turn.ts` deixa de aplicar prioridades fixas; regras viram dados de decisão da Jev.

---

## PARTE 4 — O que NÃO precisa ser feito (já existe)
- Cancelamento por mensagem nova (`inbound_superada`, 3 pontos).
- Coalescência de rajada (debounce 8s).
- Jev com failover/retry/breaker e telemetria por log.
- Handoff/aviso ao controlador.
- Ponto de "unificação" (`reescrita_avulso`) — existe, só precisa virar 1 resposta sem duplicar.
