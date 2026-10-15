# PLANO — Escopos dedicados da Jev (conformidade `jev-decide-sempre`)

- **Data:** 2026-10-15 · **Repo:** `/root/DeskcommCRM` · **Branch:** `feat/fluxos-de-atendimento`
- **Doutrina:** `docs/doctrine/jev-decide-sempre.md`
- **Origem:** auditoria completa dos 19 pontos da Jev (ver §2) + sonda ao vivo (§4).
- **Natureza:** plano de execução. Nada implementado ainda. Cada item só fecha com **ANTES → DURANTE → DEPOIS**.
- **Regra de ouro deste plano:** um **escopo por ponto**, completo e auto-contido — estado, pergunta,
  critérios, formato de resposta e o que fazer quando a Jev **não conseguiu**. Regex é **fallback**;
  nunca decide antes da Jev.

---

## §1 — Como se comportar (contrato operacional)

### 1.1 O contrato da decisão

Todo ponto de decisão segue a MESMA hierarquia (doutrina, invariante 1):

1. **A Jev é consultada SEMPRE** (salvo `preview`/Jev desligada por binding). Nenhum `if (regex(...))`
   pode retornar decisão antes dela.
2. **Regex/determinístico é FALLBACK**, acionado **só** quando o veredito é `null`.
3. **Um veredito NEGATIVO é decisão** — o fallback NÃO roda por cima dele.
4. **Veredito ruim se conserta no PROMPT/contexto**, nunca com bypass de regex no motor.

### 1.2 O que é "não conseguiu" (null coerente)

`null` **não** é ambíguo: significa **exatamente** uma destas três coisas, e nada mais:

| Origem do `null` | Quando | O motor faz | Registro |
|---|---|---|---|
| **Desligada** | `alvosDeJevDaOrg(ponto)` = `[]` (binding ausente/off) | cai no determinístico | `log.info('<ponto>: Jev desligada')` |
| **Esgotou** | o motor tentou `JEV_MAX_TENTATIVAS`/teto e não veio resposta preenchida | cai no determinístico | `log.warn('<ponto>: Jev esgotou')` + `enfileirarDecisaoJev` (outbox) |
| **Erro fatal** | auth/schema (não retentável) | cai no determinístico | `log.error('<ponto>: Jev erro fatal')` |

**Nunca** é `null` por causa de uma regra de negócio. "O cliente não escolheu" é `choice: "nenhuma"`
(um veredito **positivo** de negativa), não `null`.

### 1.3 Timeout / insistência (Fase 0) — DECIDIDO 2026-10-15

- **Teto = 200s** para "não resposta" ou "resposta lenta" da Jev: `JEV_CAP_TOTAL_MS=200000`.
- **Por tentativa = 30s** (`JEV_TIMEOUT_MS=30000`): a sonda mostrou que o provedor (`typesafe`)
  pode levar >8s; com o default de 8s a resposta lenta seria cortada a cada tentativa.
- `JEV_MAX_TENTATIVAS=12` (mínimo já imposto em `motor.ts:75`).
- **Breaker mantido em 30s** (`JEV_COOLDOWN_MS=30000`, decisão do dono): o teto alto cobre a
  instabilidade de um ponto; o breaker evita somar 200s × N pontos no mesmo turno.
- O teto do turno (`QUEUE_VISIBILITY_TIMEOUT_MS`=600s) cobre 200s. Trade-off aceito: numa
  indisponibilidade o cliente pode esperar até ~200s.

### 1.4 Protocolo de execução (obrigatório por item)

- **ANTES:** medição ao vivo do comportamento atual (sonda §4) + teste que reproduz o defeito (vermelho).
- **DURANTE:** a mudança (prompt/estado/gate) + teste de caracterização do NOVO comportamento.
- **DEPOIS:** validação ao vivo (WAHA 0101 → datafy 2501, quando o datafy estiver pago) + registro
  neste arquivo (linha do item) + `tsc` 0, `lint` 0, `vitest run lib/agent-engine lib/followup lib/ai`.

---

## §2 — Análise completa: os 19 pontos

Classificação: **[A]** violação (regex decide antes/vence a Jev) · **[F]** conforme (Jev-primeiro) ·
**[I]** infra/parsing.

| # | Ponto | Classe | Onde está a violação / observação |
|---|---|---|---|
| 1 | `moto_escolhida` | **[A]** | `catalogo-da-conversa.ts:580` (`bloqueiaEscolha`), `:598` (`temReferenciaAMoto`) retornam `null` antes da Jev; `inbound-turn.ts:4501,4511` (`ehPedidoDiferente`/`pediuOutraMoto`) |
| 2 | `catalog_criteria` | **[A]** | `inbound-turn.ts:4769-4775` (`precisaClassificar`), `:6658` (`prefetchRelevante`), `:4524-4560` (`pedidoCritDoTurno`) barram a Jev |
| 3 | `modelo_categoria` | **[A]** | `inbound-turn.ts:4901` (`categoriaDoModeloNaReferencia`, "DEGRAU 1") decide antes da Jev (`:4910-4926`) |
| 4 | `flow_intent` (tool `flow_start`) | **[A]** | `inbound-turn.ts:4029-4032` + `flow-intent.ts:116-124`: regex vence `ok:true`+`[]` (veredito negativo) |
| 5 | `flow_intent` (gate interno) | **[A]** | `flow-intent.ts:192` (`model` vazio) retorna antes de `alvosDeJevDaOrg` (`:200`) |
| 6 | `pergunta_do_fluxo` | **[A]** | `inbound-turn.ts:7398` (`motivoNegociacao === null`) barra a Jev e decide `esperar` |
| 7 | `offer_motos` (continuação) | **[A]** | `inbound-turn.ts:4725-4730`: OR deixa regex vencer `continuacao:false` |
| 8 | `offer_motos` (principal) | [F] | Jev-primeiro (`oferta-jev.ts`, `decidirOfertaComAutoridadeDaJev:255`) |
| 9 | `skill_select` | [F] | `skill-select-jev.ts` |
| 10 | `flow_intent` (entrada) | [F] | Jev → chat → regex (`inbound-turn.ts:2584,2599`) |
| 11 | `flow_validate` | [F] | `flow-validate.ts:201` |
| 12 | `flow_summary` | [F] | `flow-summary.ts:138` |
| 13 | `followup_classify` | [F] | `followup-flow-classify.ts:74` |
| 14 | `followup_decide_timing` | [F] | `followup-flow-classify.ts:243` |
| 15 | `intent_router` | [F] | `intent-classifier.ts:118` |
| 16 | `stage_classifier` | [F] | `stage-classifier.ts:198` |
| 17 | `objecao` | [F]* | `inbound-turn.ts:3326-3329` (edge: input diferente em `:4535/:4762`) |
| 18 | `negociacao` | [F]* | `inbound-turn.ts:3348-3363` (coupling: sem binding `objecao`, não roda) |
| 19 | `narracao` / `knowledge_route` / `promise_semantic` / `flywheel_judge` | [F] | Jev-primeiro |

**Fora do guarda-chuva (sem ponto Jev), manter:** handoff por palavra (`human-handoff.ts:55`,
`inbound-turn.ts:2808`) e opt-out ambíguo (`inbound-turn.ts:2842`) — determinísticos de segurança/Meta.

---

## §3 — Escopos dedicados (um por ponto que muda)

Formato de cada escopo: **Estado enviado** · **Pergunta/critérios** · **Formato de resposta** ·
**"Não conseguiu"** · **Comportamento do motor** · **Prova**.

### ESCOPO 1 — `moto_escolhida` (a âncora)

- **Decide:** o cliente ESCOLHEU/gostou de UMA moto já apresentada? Qual?
- **Estado enviado:** `{ cliente, citado, modelo, candidatas[], sinais:{ parece_pergunta_objecao, tem_referencia_nominal, unica_em_foco } }`.
  - `citado` = legenda da foto respondida; `modelo` = texto que o agente escreveu; `candidatas` = rótulos com atributos (nome, ano, cor, cc, km).
  - **`sinais` são SINAIS, não decisão** (substituem os gates `bloqueiaEscolha`/`temReferenciaAMoto`).
- **Pergunta/critérios:** `choice` com `nenhuma` + uma opção por candidata. Instruções:
  1. "Marque uma moto SÓ se o cliente demonstrou a escolha por ela."
  2. **"Sem referência a NENHUMA moto da lista (cidade, dado, saudação, 'ok') → `nenhuma`."** (substitui a trava no prompt)
  3. **"Se há UMA única candidata em foco e o cliente demonstra interesse/afirmação por ELA (mesmo sem nomear — 'gostei dela', 'me interessei', 'essa') → marque essa."** (NOVA regra; sonda mostrou que falta)
  4. "Pergunta/objeção (`parece_pergunta_objecao=true`) NÃO é escolha → `nenhuma`" (mas sinal positivo explícito vence).
  5. "Ambiguidade (mais de uma moto casa) → `nenhuma`."
- **Formato de resposta (medido na sonda):** `{"moto":{"type":"choice","choice":"<rótulo|nenhuma>","confidence":0..1,"probabilities":{...}}}`.
- **"Não conseguiu":** `null` só por Jev desligada/esgotou. Fallback = `motoEscolhidaPeloCliente` (determinístico, hoje já é o caminho).
- **Comportamento do motor:** escolha → grava `escolhida` (trava) + `detalhada` + manda **todas as fotos** (`inbound-turn.ts:4687-4694`) + espelha `moto_interesse`. `nenhuma` → não trava; o turno segue (pergunta/objeção/oferta conforme os outros pontos).
- **Prova (sonda 2026-10-15):** "gostei dela" (1 cand) → escolheu (0.7); "me interessei" (1 cand) → `nenhuma` (0.69) ⚠️ *a regra 3 conserta*; "me interessei por essa" (citando) → certo (0.96); pergunta/objeção → `nenhuma`; cidade → `nenhuma`; ambíguo → `nenhuma`; clara → certo (0.99).

### ESCOPO 2 — `offer_motos` (principal + continuação)

- **Decide:** mostrar motos NESTE turno? (e, havendo fila, se o cliente quer CONTINUAR).
- **Estado enviado:** `{ mensagem, temEscolhaTravada, temMotoEmFoco, nomeMotoEmFoco, pedidoSemCorrespondencia, pediuMaisOpcoes, clienteConfirmouOpcoes, motivoObjecaoAnterior, temOpcoesPendentes }`.
  - **NOVO:** `nomeMotoEmFoco` (para a Jev distinguir "fala DELA" de "pede OUTRA").
- **Pergunta/critérios:** `oferta` (oferecer/nao_oferecer/perguntar) + `criterio` + `continuacao` (só com fila).
  - **Correção do prompt:** trocar *"se o cliente PERGUNTA… uma moto específica → SEMPRE mostrar"* por
    **"se há moto em foco E o cliente está falando DELA (elogio, dúvida, negociação, 'ver de perto') → `nao_oferecer`; só `oferecer` se ele pedir EXPLICITAMENTE outra/menos/nova"**.
- **Formato:** `{"oferta":{...},"criterio":{...},"continuacao":{...}}`.
- **"Não conseguiu":** `null` → fallback determinístico (`pedidoDeCatalogoInequivoco` → `podeOferecerMotos`).
- **Comportamento do motor:** `oferecer` → oferece (fila primeiro); `continuacao=mostrar_mais` → consome a fila; `continuacao=novo_pedido`/`false` → **NÃO** consome (corrigir o OR de `inbound-turn.ts:4725`).
- **Prova (sonda):** falando dela → `nao_oferecer` (0.92); pede nova → `oferecer`; confirma "ver mais" → `oferecer`+`mostrar_mais`; "ver de perto" → `nao_oferecer` (0.55). A Jev já acerta; o OR é que atropela.

### ESCOPO 3 — `catalog_criteria`

- **Decide:** que critérios de busca o pedido impõe (marca/categoria/cc/preço/ano/cor…).
- **Estado:** `{ mensagem, colunas[], estoque[], bloquearAno }`.
- **Pergunta/critérios:** `choice`/`score` por coluna; `nenhum` quando o pedido é vago.
- **"Não conseguiu":** `null` → chat model → determinístico.
- **Comportamento do motor:** hoje a Jev só é chamada se `precisaClassificar` (regex). **Corrigir:** consultar sempre que houver turno de catálogo e deixar a Jev dizer "nenhum critério".

### ESCOPO 4 — `modelo_categoria`

- **Decide:** a que CATEGORIA pertence o modelo citado (para ofertar equivalentes).
- **Ordem corrigida:** **Jev PRIMEIRO**; a referência determinística (`categoriaDoModeloNaReferencia`) vira **fallback** sob `null`.
- **Estado:** `{ modelo, categorias[] }`. **Formato:** `choice` (categoria|nenhuma).

### ESCOPO 5 — `flow_intent`

- **Decide:** quais fluxos iniciar e em que ordem.
- **Correções:** (a) `escolherFluxoIniciado` NÃO deixa o regex vencer `ok:true`+`[]` (só sob `ok:false`/null); (b) ler o binding `flow_intent__jev` ANTES do guard de `model` vazio (`flow-intent.ts:192`).
- **"Não conseguiu":** `null`/`ok:false` → regex gatilho.

### ESCOPO 6 — `pergunta_do_fluxo`

- **Decide:** fazer a pergunta do roteiro AGORA, esperar, ou encerrar.
- **Correção:** remover o gate `motivoNegociacao === null` (`inbound-turn.ts:7398`); passar a negociação como **contexto** e deixar a Jev decidir `esperar`.
- **Estado:** `{ pergunta, textosDoTurno, emNegociacao }`.

---

## §4 — Metodologia de teste (a sonda) — ANTES de mudar

Antes de qualquer mudança, **medir a Jev de verdade** (formato + acerto). Sonda pronta em
`/tmp/opencode/probe.ts`, rodada no worker:

```bash
docker cp /tmp/opencode/probe.ts deskcommcrm-worker-1:/app/probe.ts
docker exec deskcommcrm-worker-1 sh -lc 'cd /app && ./node_modules/.bin/tsx probe.ts'
```

A sonda: (1) lê o binding do ponto (`alvosDeJevDaOrg(pool, ORG, '<ponto>')`); (2) chama `decidir` com
o **prompt atual** e um **prompt candidato**; (3) imprime `{choice, confidence, probabilities}`.

**Regras da sonda:**
- Roda contra o binding real (`typesafe`/`jev-latest`) — não simula.
- Cada cenário vira um **teste de caracterização** depois.
- Se a Jev não acertar um cenário com o prompt atual → o conserto é o **prompt** (§3), não um regex.
- Registrar os resultados aqui (linha ANTES).

---

## §5 — Ordem de execução

**Fase 0 — Contrato + timeout (§1.2/§1.3).** Ajustar env; documentar o contrato; sem tocar em decisão.
**Fase 1 — Sondar todos os pontos que mudam (§4)** e registrar o formato real de cada um.
**Fase 2 — Corrigir os 7 escopos [A] (§3)**, um a um, com ANTES/DURANTE/DEPOIS.
**Fase 3 — Amarrar a âncora:** a decisão de escolha alimenta trava + fotos + bloqueio de oferta.
**Fase 4 — Prova:** regressão por ponto + validação ao vivo + atualizar
`docs/doctrine/jev-decide-sempre.md` ("Violações pendentes") e `INVENTARIO-regex-vs-jev.md`.

---

## §6 — Registro ANTES / DURANTE / DEPOIS

> Preencher a cada item. Mais recente no topo.

- **2026-10-15 — FASE 0 (contrato + timeout) — FEITO.**
  - **ANTES:** `.env` só tinha `JEV_BRIEF_ENABLED`; valiam os defaults (teto 120s, 8s/tentativa,
    12 tentativas, breaker 30s).
  - **DURANTE:** `.env` += `JEV_TIMEOUT_MS=30000`, `JEV_CAP_TOTAL_MS=200000`,
    `JEV_MAX_TENTATIVAS=12`, `JEV_COOLDOWN_MS=30000` (decisão do dono: **breaker 30s**; **teto 200s**
    para não-resposta/resposta lenta). Containers `app/worker/scheduler` recriados.
  - **DEPOIS:** env confirmado no worker (`TIMEOUT=30000 CAP=200000 TENT=12 COOLDOWN=30000`);
    containers healthy; contrato (§1.2) documentado. Backup do `.env` em `.env.bak-pre-fase0-jev-*`.
  - **Pendente:** Fase 1 (sondar os pontos restantes) e Fase 2 (corrigir os 7 escopos [A]).

- **2026-10-15 — ANÁLISE + SONDA (Fase 0/1 parcial).**
  - **ANTES:** auditoria dos 19 pontos (§2) e sonda do `moto_escolhida`/`offer_motos` (§3). Formato
    confirmado: `{type:"choice", choice, confidence, probabilities}`.
  - **DEPOIS:** plano criado; 7 violações [A] identificadas; 1 lacuna de prompt achada na sonda
    ("me interessei" com 1 candidata → `nenhuma`).
  - **Pendente:** decisão do dono sobre o breaker (§1.3) e sobre o teto real de espera.
