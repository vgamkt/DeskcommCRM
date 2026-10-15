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

- **2026-10-15 — ESCOPO 12 (o TEXTO tem que casar com as motos enviadas) — FEITO.**
  - **DIAGNÓSTICO (onde estava o erro):** no caminho da apresentação AUTOMÁTICA, o MOTOR escolhe as
    motos, mas o modelo escreve o texto (`send_message.body`) ANTES — sem saber QUAIS/QUANTAS vão. Ele
    então "chuta" ("vou te mandar duas", "não encontrei dentro do valor") e o motor envia outra coisa →
    **divergência texto × motos**. O mecanismo que daria a lista ao modelo (prefetch `JEV_PREFETCH_ENABLED`)
    está DESLIGADO, e testá-lo ligado **piorou** (passou a perguntar em vez de mostrar) — não promover.
  - **CORREÇÃO estrutural:** na apresentação automática (`enviarApresentacao(..., motorEscolheuMotos=true)`)
    a INTRO passa a ser **determinística e factual** (`introducaoFactualDaApresentacao(N)` = conta as
    motos REAIS que vão sair) + a pergunta de escolha determinística. O texto do modelo fica só nos turnos
    sem apresentação automática. Também: (a) `perguntaDeOutrosNoValor` ganhou frases NEUTRAS (não afirmam
    "não encontrei dentro do valor"); (b) o hint de "outros nesse valor" não afirma mais que não há opções;
    (c) `exigidos_quilometragem`/`exigidos_potencia` só exigem se o cliente FALAR delas (a Jev marcava km
    sozinha → excluía motos boas); (d) `offer_motos`: USO/TERRENO conta como critério (não perguntar).
  - **DEPOIS (ao vivo):** texto e fotos CASAM ("Separei 2 opções" + 2 fotos; "até 20 mil" → 2 fotos ≤20k).
    `tsc` 0; suíte **1484/1484**.
  - **Pendência observada:** um turno com `categoria_alvo` trouxe só 2 motos onde o filtro isolado traz 6 —
    investigar os CANDIDATOS (leitura do banco / consulta do modelo), não o filtro.

- **2026-10-15 — ESCOPO 11 (separar MATCH de SIMILAR; estilo por texto) — FEITO E VALIDADO AO VIVO.**
  - **ANTES (medido ao vivo):** (a) "pra cidade e umas **trilhas**" → a Jev NÃO marcava `categoria` →
    sem filtro de estilo → vinha **CB 300 F (seminova)** entre as trail; (b) "gostei dessas trail. tem
    alguma **até 20 mil**?" → a faixa de preço vinha **já com a margem (+30% = 26.000)** → o **XRE 190
    (R$22,5k)** aparecia ANTES das ≤20k.
  - **REGRA (dono):** a 1ª oferta traz SÓ o que casa EXATAMENTE (estilo principal + dentro do valor).
    O que NÃO casa (margem/outro estilo) sai **somente depois** do "quer ver similares?".
  - **DURANTE:**
    (1) `catalog-criteria`: `faixas` = EXATO; novo `faixasSimilares` = mesmo intervalo com a margem ±30%
    (a fila). Nova pergunta **`categoria_alvo`** (como `marca_alvo`): estilo por texto ("trail", "naked",
    "scooter", uso/terreno) vira **exigência + faixa de texto** — o motor MANTÉM o estilo.
    (2) `extrair-criterios`: `CriteriosExtraidos.faixasSimilares`.
    (3) `inbound-turn`: a 1ª oferta usa `faixasDoTurno` (exata); a FILA do "ver mais" usa
    `{ ...faixasDoTurno, ...faixasSimilaresDoTurno }` (texto exato + número com margem) — mantém o
    estilo e só alarga o número.
  - **DEPOIS (ao vivo):** "cidade + trilhas" → **só trail** (XTZ, BMW GS, XRE, CB 500 X); "até 20 mil"
    → **só ≤20k** (Crosser S 19.990, Crosser 16.900) + "outros nesse valor?"; "pode mostrar sim" →
    **XRE 190 (trail acima do valor)**, não street. `tsc` 0; `lint` 0; suíte **1480/1480**.

- **2026-10-15 — ORDEM NUMÉRICA + anti-duplicação de apresentação — FEITO E VALIDADO AO VIVO.**
  - **ORDEM NUMÉRICA (dono):** quando o cliente pede um NÚMERO (ex.: "quero uma 250") e a Jev marca a
    coluna principal (`principal=cilindrada`), as motos mais PRÓXIMAS do número têm que vir primeiro
    (exata antes da aproximada), para QUALQUER coluna numérica (cilindrada/preço/ano/potência).
    **ANTES:** a ordem final era a NOTA da Jev (que podia pôr uma scooter 250 à frente, ou um ~300 antes
    do 250). **DURANTE:** `filtrarPorHipoteses` ganhou o critério PRIMÁRIO de proximidade ao número do
    pedido (alvo derivado do termo; a coluna vem do `principal` da Jev = Jev-first); a nota da Jev
    desempata. **DEPOIS (ao vivo):** "Quero uma 250." → CBX 250 (249), XMax 250 (249), depois CB 300s.
  - **ANTI-DUPLICAÇÃO (apresentação):** investigação do "Lander 250" (intro repetida) → o modelo lite
    chama `send_message` DUAS vezes na mesma job (steps 2 e 3); a 1ª dispara a apresentação automática
    (texto+fotos+pergunta, fotos já deduplicadas por `jaApresentouAutomatico`), a 2ª vira bolha de texto
    repetida. **DURANTE:** `send_message` recusa (determinístico, sem fuzzy) uma 2ª mensagem SEM
    mídia/motos depois de a apresentação automática já ter saído, com instrução para encerrar.
    **DEPOIS (ao vivo):** "Lander 250" saiu com UMA intro + a pergunta + as 5 fotos trail.
  - `tsc` 0; `lint` 0; suíte **1475/1475**; deploy `8acab534`.

- **2026-10-15 — CORREÇÃO da regressão de SEGMENTAÇÃO (Lander/250/Honda) — FEITO E VALIDADO AO VIVO.**
  - **ANTES (medido ao vivo):** "Vocês têm uma Lander 250?" (com foco de CB na conversa) → a Jev vinha
    `intencao=alternativa`; e no motor `alternativa` **desligava** `filtrarPorComparacao` → o filtro de
    `categoria` (Trail, resolvido da referência `modelos`) era **calculado e descartado** → vinham 250
    aleatórias (CBX 250, XMax 250, YS Fazer 250). Provado por sonda: a MESMA mensagem dava `pedido` sem
    foco e `alternativa` com foco (efeito do contexto `motoEmFoco` do Escopo 9). Segundo defeito medido:
    "Quero uma 250." → ponto `offer_motos` negava (`jev_negou`, sem fotos).
  - **DURANTE (correção em 2 lugares, JEV PRIMEIRO):**
    (1) `catalog-criteria.ts` — a instrução de foco separa 3 casos: **pedido de MODELO por nome** →
    `pedido` (mesmo de outro estilo); **critério adicionado ao foco** → `pedido` (refino); só **reações**
    ("achei caro"/"outra cor") → `alternativa`.
    (2) **LIGAÇÃO** (`inbound-turn.ts` ×2 + `selecao-por-intencao.ts`): o que a Jev SEPAROU
    (`exigidos`/faixas) **SEMPRE filtra** — `alternativa` só desliga o filtro quando a Jev não declarou
    nada explícito. Era o "esquecer de ligar": categoria/marca/faixa virava filtro morto.
    (3) `oferta.ts` — pedido por **CILINDRADA/cc** ("quero uma 250"/"300cc") com moto em foco agora é
    pedido claro → `oferecer` (antes negava).
  - **DEPOIS (ao vivo, versão `8acab534`):** "CB 300" → "Lander 250" → **só trail** (XTZ 150 Crosser S
    FLEX, Himalayan, CB 500 X, BMW G 310 GS, XRE 190) + narração "não tenho a Lander, mas separei trail";
    "Tem alguma Honda?" → **só Hondas**; "Quero uma 250." → **mostra fotos** (250s + 300 próximos);
    Escopo 9 "CB 300" → "e tem alguma até 17 mil?" → 3 CB ≤17 mil + convite "outros nesse valor".
    Sonda `offer_motos`: "Quero uma 250"→oferecer, "essa moto é boa?"→nao_oferecer (Escopo 2 preservado).
    `tsc` 0; `lint` 0; suíte **1473/1473**.
  - **Pendências observadas:** (a) narração de apresentação saiu DUPLICADA numa bolha (intro repetida);
    (b) "Quero uma 250" traz XMax 250 (scooter R$31.9k) primeiro — ordem pela NOTA da Jev (decisão de produto).

- **2026-10-15 — ESCOPO 9 (combinar interesse + critério novo) — FEITO E VALIDADO AO VIVO.**
  - **ANTES (sonda ao vivo, binding `typesafe`/`jev-latest`):** "e tem alguma até 17 mil?" com o
    estoque completo e o estado ATUAL (`{mensagem, estoque}`):
    `intencao=pedido`, `principal=preco`, `exigidos=[preco]`, `cx_preco="15 a 20 mil"` (teto),
    **`parecidas={}`** — a Jev **não recebia a CB em foco** e não ancorava a família; o critério de preço
    **substituía** o interesse. Com o contexto `motoEmFoco=[CBs]` no `state`, a MESMA mensagem passou a
    marcar `parecidas={CB 300 R 0.93, CB 300 R FLEX 0.94, CB 300 F 0.93, CBX 250 0.9, XRE 0.76}` —
    provando que **a informação que faltava era o contexto**, não a capacidade da Jev.
  - **DURANTE (JEV PRIMEIRO):**
    (1) `catalog-criteria.ts` — `EntradaDeCriterios` ganhou `motoEmFoco`; a pergunta `intencao` e a
    instrução das `parecida_i` passam a dizer que, com moto em foco, adicionar um critério é **REFINO**
    (interesse ∩ critério) e que a **família/linha em foco manda na nota** (outras famílias = "plano B").
    ⚠️ A intenção continua **`pedido`** (não `alternativa`): no motor, `alternativa` desliga
    `filtrarPorComparacao` e a faixa de preço deixaria de filtrar. A decisão do QUE buscar segue toda da
    Jev (critérios + parecidas); o motor só **executa** a interseção.
    (2) `extrair-criterios.ts` — `motoEmFoco` viaja no `state` e no `contexto` (ponto e árbitro).
    (3) `inbound-turn.ts` — `motosEmFoco` (escolhida → referência → apresentadas, dedup, ≤6) é passado aos
    DOIS call sites do `catalog_criteria` e ao `selecionarPorIntencao`; novo flag `outrosNoValorNesteTurno`.
    (4) `selecao-por-intencao.ts` — **combina interesse ∩ critério**: com `motoEmFoco` + faixa numérica +
    hipóteses da Jev com NOTA, o INTERESSE (casadas que a Jev marcou) vem primeiro; se o interesse **não
    preenche** o pedido (ou **esvazia**), amplia para **outros modelos no valor** e liga `outrosNoValor`.
    (5) `mais-opcoes.ts`/`fecho-do-turno.ts` — pergunta **"quer ver outros modelos nesse valor?"** (variada),
    usada no fecho e na apresentação quando o interesse não preencheu.
  - **DEPOIS (sonda, prompt novo):** "e tem alguma até 17 mil?" com `motoEmFoco=[CBs]` →
    `intencao=pedido`, `parecidas={CB 300 R 0.93, CB 300 R FLEX 0.94, CB 300 F 0.93, CBX 250 0.9, XRE 0.76}`
    (familia CB ancorada, XRE rebaixada). Caso "sem CB no valor" (`motoEmFoco=[CB 500 X]`) →
    `parecidas` mantém a CB 500 X (0.9) e marca CBs caras com nota baixa — o interesse esvazia no valor e o
    motor amplia. 13 testes novos (catalog-criteria, extrair-criterios, selecao-por-intencao, fecho, mais-opcoes).
    `tsc` 0; `lint` 0 erros; suíte **1469/1469** (`vitest run lib/agent-engine lib/followup lib/ai`).
  - **DEPOIS (deploy + AO VIVO):** versão **`e9ce6baf`** no ar (app/worker/scheduler healthy); sonda no
    código DEPLOYADO confirma o prompt novo. Jornada real (WAHA 0101 → datafy 2501):
    **[1] "Vocês têm uma CB 300?"** → 5 fotos (CB 300 F Twister, CB 300 R, CB 300 R FLEX, CBX 250, CB 500 X).
    **[2] "E tem alguma até 17 mil?"** → 3 fotos, **todas CB e ≤ 17 mil, do maior pro menor** (CB 300 R FLEX
    14.990 → CB 300 R 12.500 → CBX 250 9.990) e o fecho **"Não encontrei outras dentro desse valor, mas
    posso te mostrar outros modelos nesse valor. Quer ver?"**. Log do turno 2: `intencao=pedido`,
    `exigidos=["preco"]`, `faixas={preco:{max:26000}}` (bucket "15 a 20 mil" + margem 30%),
    `hipoteses` ancoradas na família CB (R 0.88, R FLEX 0.86, F 0.8, CBX 0.53) →
    `depois.motos=[CB 300 R FLEX, CB 300 R, CBX 250]` (a CB 300 F de 28.990 ficou de fora). `similares_qtd=5`
    → interesse (3) < 5 → `outrosNoValor=true` (pergunta de outros no valor). **Aceite cumprido.**
  - **Observações:** (a) a intenção fica **`pedido`** (não `alternativa`), de propósito — ver "DURANTE";
    (b) os buckets de preço são discretos ("15 a 20 mil"), então o teto efetivo foi R$ 26.000 (o "17 mil"
    entra no bucket e o motor mantém a margem +30%) — nunca trouxe R$ 95 mil; (c) a combinação só LIGA com
    um critério **NUMÉRICO** (faixa com limite): sem ele, nada muda (teste dedicado — evita o convite
    "outros nesse valor" em turnos sem valor). Deploy revalidado ao vivo após esse ajuste.

- **2026-10-15 — FECHO APÓS A ESCOLHA (bug do "qual chamou mais atenção") — FEITO (aguarda deploy).**
  - **ANTES:** `brief-do-turno.ts` (e `atendimento.ts`, caminho sem brief) mandavam o modelo **"convide a
    ESCOLHA ('qual delas chamou mais atenção?')"** SEMPRE que o turno mostrou motos — **mesmo com a moto JÁ
    ESCOLHIDA**. Resultado (medido ao vivo): o bot reperguntava "qual chamou mais atenção" depois de a escolha
    já ter sido feita e as fotos já terem saído.
  - **DURANTE:** `blocoDoFluxoCompacto`/`renderBlocoDeAtendimento` ganharam `temEscolha`; com escolha, a
    instrução vira a de **AQUISIÇÃO** (à vista/financiado/cartão/troca). 1 teste novo.
  - **DEPOIS:** typecheck 0; lint 0 erros; suíte **1456/1456**.
  - **Pendente:** deploy + validação ao vivo.

- **2026-10-15 — FASE 2 · ESCOPO 6 (`pergunta_do_fluxo`) — FEITO (aguarda deploy). CONCLUI os 7 [A].**
  - **ANTES:** `inbound-turn.ts` tinha `motivoNegociacao === null` no gate — durante uma objeção/negociação a
    Jev era BARRADA e o regex decidia `esperar` sozinho.
  - **DURANTE:** removido o gate; `emNegociacao` vai como **CONTEXTO** para a Jev (ponto + bridge + call site).
    1 teste novo.
  - **DEPOIS:** typecheck 0; lint 0 erros; suíte **1455/1455**.
  - **Pendente:** deploy + validação ao vivo.
  - **Status:** os **7 escopos [A]** da §2 estão corrigidos (1–7). Falta a Fase 3 (amarrar a âncora) e a Fase 4
    (prova ao vivo + atualizar a doutrina).

- **2026-10-15 — FASE 2 · ESCOPO 5 (`flow_intent`) — FEITO (aguarda deploy).**
  - **ANTES:** (a) `escolherFluxoIniciado` deixava o regex `porGatilho` vencer o veredito NEGATIVO da Jev
    (`ok:true` + `[]`); (b) `escolherFluxosPorIA` retornava `{ok:false}` quando o modelo de CHAT estava
    vazio, ANTES de ler o binding `flow_intent__jev` — a Jev nunca rodava.
  - **DURANTE:** (a) `ok:true` é AUTORITATIVO (inclusive vazio) → não cai no regex; (b) o check de `model`
    vazio foi movido para DEPOIS do bloco da Jev. 2 testes atualizados.
  - **DEPOIS:** typecheck 0; `flow-intent.test.ts` 15/15; suíte **1454/1454**.
  - **Pendente:** deploy + validação ao vivo.

- **2026-10-15 — FASE 2 · ESCOPO 4 (`modelo_categoria`) — FEITO (aguarda deploy).**
  - **RECLASSIFICAÇÃO (reformulado pós-sonda):** o "DEGRAU 1" (`categoriaDoModeloNaReferencia`) **não é
    regex** — é lookup na tabela `modelos` (dado curado do cliente). Por isso **permanece primeiro** (dado
    autoritativo); a Jev é o fallback para modelos FORA da referência. Inverter faria a Jev sobrepor o
    cadastro do cliente com um palpite. O gap real era o **prompt**.
  - **ANTES:** prompt fraco → sonda: "Lander 250" → `nenhuma`.
  - **DURANTE:** `modelo-categoria.ts` ganhou conhecimento de modelos (XRE/NXR/Lander/Ténéré/XTZ = Trail;
    PCX/Biz/Nmax/Burgman = Scooter; CG/Titan/Fan/Factor/Fazer = Street; CB/MT = Naked/Esportiva).
  - **DEPOIS (sonda):** Lander 250 → Trail; Tenere 700 → Trail; PCX 160 → Scooter; CB 500X → Trail
    (todos certos).
  - **Pendente:** deploy + validação ao vivo.

- **2026-10-15 — FASE 2 · ESCOPO 3 (`catalog_criteria`) — FEITO (aguarda deploy).**
  - **ANTES:** o extrator de critérios só rodava se `precisaClassificar` (regex
    `querMoto`/`querAlternativa`/`motosCitadasNoTexto`) — nos DOIS pontos (`pedidoCritDoTurno` ~4539 e
    call site ~4781). O regex barrava a Jev de classificar.
  - **DURANTE:** os dois gates passaram a ser o veredito da Jev (`turnoDeCatalogo`); removidos
    `semMotoDoPedido`/`precisaClassificar` de regex.
  - **DEPOIS:** typecheck 0; lint 0 erros; suíte **1454/1454**.
  - **Pendente:** deploy + validação ao vivo.

- **2026-10-15 — FASE 2 · ESCOPO 2 (`offer_motos`) — FEITO (aguarda deploy).**
  - **ANTES:** `inbound-turn.ts:4725` consumia a fila com
    `vereditoOfertaJev?.continuacao===true || querMaisOpcoes(...) || clienteConfirmouVer(...)` — OR que
    deixava o regex vencer o veredito NEGATIVO (`continuacao:false`). O prompt não distinguia "fala DELA"
    de "pede OUTRA".
  - **DURANTE:** (1) a continuação passou a ser `vereditoOfertaJev.continuacao` (Jev); regex só sob `null`;
    (2) `oferta.ts` ganhou `nomeMotoEmFoco` no contexto + a **"REGRA DA MOTO EM FOCO"**. 1 teste novo.
  - **DEPOIS (sonda, prompt novo):** fala dela → `nao_oferecer`; pede nova → `oferecer`; confirma ver mais
    → `oferecer`+`mostrar_mais`; ver de perto → `nao_oferecer`; quer ver outra → `oferecer`.
    typecheck 0; suíte **1454/1454**.
  - **Pendente:** deploy + validação ao vivo.

- **2026-10-15 — FASE 2 · ESCOPO 1 (`moto_escolhida`) — FEITO (aguarda DEPOIS ao vivo).**
  - **ANTES:** `montarPedidoDeEscolha` barrava a Jev com `bloqueiaEscolha`/`temReferenciaAMoto`
    (`return null`, `catalogo-da-conversa.ts`); `inbound-turn.ts` barrava com `!pediuOutraMoto`. Sonda:
    "me interessei" (1 candidata) → `nenhuma` (lacuna).
  - **DURANTE:** (1) `moto-escolhida.ts`: prompt ganhou **"SEM REFERÊNCIA"** e **"ÚNICA EM FOCO"**;
    (2) `catalogo-da-conversa.ts`: os gates viraram **SINAIS** no contexto (`parece_pergunta_objecao`,
    `tem_referencia_nominal`, `unica_em_foco`, `pediu_algo_diferente`); `null` só estrutural (sem
    catálogo/candidatas); (3) `inbound-turn.ts`: `pediuOutraMoto` vira sinal (não barra a Jev). 5 testes novos.
  - **DEPOIS (sonda com o prompt NOVO):** "gostei dela"/"me interessei"/"essa mesmo"/"quero ver ela de
    perto" (1 candidata) → a candidata (0.98–1.0); cidade/objeção/ambíguo (3 candidatas) → `nenhuma` (1.0);
    "quero outra cor" → `nenhuma`. typecheck 0; suíte **1453/1453**.
  - **DEPOIS (deploy):** versão **`70bd384f`** no ar; containers healthy; sonda no CÓDIGO DEPLOYADO
    confirma ("me interessei" → a moto; "sou de Sao paulo"/"gostei da 300" → `nenhuma`).
  - **Pendente:** validação ao vivo (WAHA) quando o datafy estiver pago; Escopos 2–7 (Fase 2).

- **2026-10-15 — FASE 1 (sondar todos os pontos que mudam) — FEITO.**
  - **DURANTE:** sonda real (binding `typesafe`/`jev-latest`) nos 6 pontos (§4). Formato comum
    confirmado: `{"<id>":{"type":"choice|noul","choice"|"noul":...,"confidence":0..1,"probabilities":{...}}}`.
  - **DEPOIS (acerto por ponto):**
    - `moto_escolhida`: **acerta** escolha clara (0.99), citando a foto (0.96), pergunta/objeção→`nenhuma`,
      cidade→`nenhuma`, ambíguo→`nenhuma`. **LACUNAS:** "gostei dela" (1 candidata) acerta mas confidence 0.4;
      **"me interessei" (1 candidata) → `nenhuma`** → precisa da regra "única em foco + interesse" (Escopo 1, regra 3).
    - `catalog_criteria`: **acerta** (preço faixa/modo/teto, `intencao` pedido/alternativa, vago→`principal=nenhum`).
    - `modelo_categoria`: Burgman→Scooter, XRE→Trail (ok); **LACUNA:** "Lander 250" → `nenhuma` (o modelo não
      reconhece) → o escopo precisa de **exemplos por categoria** (Escopo 4).
    - `flow_intent`: **todos certos** (Qualificação / Financiamento / `none` p/ dúvida / multi-fluxo Troca+Financiamento).
    - `pergunta_do_fluxo`: **todos certos** (objeção→`esperar`; interesse→`agora`; vazio→`agora`).
  - **Conclusão:** a Jev **é capaz**; o que a atrapalha são os **gates de regex** (§2) e **2 lacunas de escopo**
    (Escopos 1 e 4). **Pendente:** Fase 2 (implementar os 7 escopos [A]).

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
