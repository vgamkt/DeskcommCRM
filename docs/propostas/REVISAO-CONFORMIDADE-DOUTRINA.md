# REVISÃO DE CONFORMIDADE — "a Jev decide sempre" (revisão de tudo)

- **Data:** 2026-10-13 · **Repo:** `/root/DeskcommCRM` @ `dcaf95ff` (worktree) · **Branch:** `feat/fluxos-de-atendimento`
- **Pedido do dono:** *"tudo precisa ser revisto; tudo que não obedece a regra principal — analisar o que já foi feito/decisado — deve passar pela inteligência ANTES do regex; não quebrar turno, rajada e unificação."*
- **Doutrina de referência:** `docs/doctrine/jev-decide-sempre.md`, `hierarquia-do-turno.md`,
  `separacao-fala-e-operacao.md`, `sistema-vivo.md` (+ `sistema-vivo/02,04,05`), `restricao-de-canal.md`.
- **Natureza:** auditoria + plano. As correções serão aplicadas **uma por vez** (protocolo ANTES→DURANTE→DEPOIS).

---

## 0) FONTES DE REGRA — quando existem e quando se sobrepõem

Pergunta do dono: *"quando arquivos de regras existem? quando um se sobrepõe ou interage com outro?"*

### 0.1 As camadas (cada uma com um dono; nenhuma duplica a outra)

| Camada | Arquivo(s) | O que governa | Natureza |
|---|---|---|---|
| Doutrina de código | `CLAUDE.md`, `AGENTS.md` | como se escreve/valida (DoD, anti-patterns) + **resumo** da regra da Jev | lei de engenharia |
| Doutrina de decisão | `docs/doctrine/jev-decide-sempre.md` | **quem decide** um ponto do turno (Jev; regex só fallback) | lei de arquitetura |
| Doutrina de comportamento | `docs/doctrine/hierarquia-do-turno.md` | **quem manda em cada comportamento** do prompt | lei de arquitetura |
| Doutrina falar×operar | `docs/doctrine/separacao-fala-e-operacao.md` | fala é tool; runtime impõe o que não pode depender do modelo | lei de arquitetura |
| Doutrina de sistema | `docs/doctrine/sistema-vivo.md` (+ `sistema-vivo/*`) | os 7 invariantes (ilha, log, próximo passo, laço…) | lei de arquitetura |
| Doutrina de canal | `docs/doctrine/restricao-de-canal.md` | o que pode sair por um canal (anti-ban × janela) | lei de canal |
| Regras de NEGÓCIO | `docs/business-rules/00-business-rules-catalog.md` | GIVEN/WHEN/THEN + tipo (hard/soft/default) + camada de enforcement | catálogo de negócio |
| Especificação | `docs/specs/16-spec-tres-papeis-do-agente.md` | **como** construir (turnos/contrato) | spec |
| Mecanismos (código) | `lib/ai/jev/pontos/*`, `lib/ai/jev/arbitro.ts`, `guardrails/before-send.ts` (`BEFORE_SEND_GATES`), flow-graph `settings`, catalog config | **onde** a regra roda | execução |
| Config por tenant | `ai_agent_versions.system_prompt` (persona), `skill_versions.body` (skills), `followup_flow_pointers/versions` (fluxos) | **o quê** aquele tenant configurou | dado |

### 0.2 As três hierarquias (quando duas regras disputam)

Não há uma só — há **três**, cada uma no SEU eixo (não se reordenam):

1. **Decisão de um ponto** → `jev-decide-sempre`: **Jev decide · regex só fallback (veredito `null`) · proibido bypass.**
2. **Comportamento no prompt** → `hierarquia-do-turno`: **Fluxo (SISTEMA) > Objeção (Jev) > Skill > Persona.**
3. **Envio** → `before-send`: **cadeia `BEFORE_SEND_GATES` versionada** (a ordem é contrato; mudar exige bumpar versão).

Regra de negócio (catálogo) tem o seu próprio eixo: **hard constraint > soft policy > default com override**; a
hard constraint nunca é sobreposta por comportamento de prompt.

### 0.3 Quando uma regra "existe" e quando "se sobrepõe"

- **Existe** quando há um **novo eixo de comportamento sem dono**. Nunca para repetir um eixo já dono.
- **Sobrepõe/interage** sempre que **o mesmo comportamento é decidido em DOIS lugares** — é exatamente a
  *"segunda ordem para o mesmo comportamento"* que o `CLAUDE.md` proíbe (`hierarquia-do-turno`: *"Nunca crie
  uma segunda ordem para o mesmo comportamento em camada diferente."*).
- Quando aparece, o resultado é a *"interseção imprevisível de duas réguas que não se falam"* (`jev-decide-sempre`).
  **Correção ≠ nova regra: é remover a segunda régua** (o regex vira o fallback do ponto que já tem dono).

### 0.4 Confirmação — o plano NÃO quebra as regras; só tira ambiguidade/contexto

- Nenhuma regra é **removida**: o que muda é a **ordem** (regex deixa de **vencer** a Jev e passa a ser
  **fallback**) — o que a própria doutrina exige.
- Nenhuma **engrenagem** é tocada (turno/rajada/junção/idempotência/anti-ban/opt-out/handoff).
- As correções (V2/V3/V4) removem **falsos positivos** (ex.: "categoria A" ≠ categoria de moto) — tirar
  ambiguidade, não regra.
- **"Oferecer motos é decisão do que o cliente busca (Jev), e só quando precisa"** — é o eixo do item (1):
  o veredito `offer_motos` (a Jev, com contexto) passa a mandar; a rede vira fallback.

---

## 1) A regra principal (o que a doutrina manda)

De `jev-decide-sempre.md`:
1. **A Jev decide**; é a autora do veredito. O motor **sempre tenta** obtê-lo primeiro.
2. **Regex/determinístico é FALLBACK**, acionado **apenas** quando o veredito é `null` (Jev desligada/indisponível).
3. **Veredito negativo é decisão** — o regex **não** roda por cima (não "melhora"/"vence").
4. Veredito ruim **conserta-se no PROMPT** (`perguntaDe*`) ou no **contexto/state** — nunca com bypass de regex.

**O que torna o sistema "inteligente":** o **Árbitro de turno** (`lib/ai/jev/arbitro.ts`) — **UMA** chamada da Jev
que resolve **vários pontos do mesmo turno** (`offer_motos`, `objecao`, `negociacao`, `moto_escolhida`,
`catalog_criteria`, `flow_intent`, `flow_validate`…) sobre um **contexto unificado** (`state.turno` +
`state.pontos[ponto]`). Ele **analisa o turno inteiro** — histórico, moto em foco, escolha travada, estado de
objeção, o que já foi decidido. É isso que "sabe o que já estava resolvido".

De `hierarquia-do-turno.md`: **um dono por comportamento** — `Fluxo (SISTEMA) > Objeção (Jev) > Skill > Persona`;
saudação 1×; pergunta do fluxo sai de **um lugar só**; enquanto há campo pendente o modelo não abre pergunta própria.

De `separacao-fala-e-operacao.md`: **falar é tool** (texto solto é descartado); o que não pode depender da memória
do modelo é **imposto pelo runtime**.

---

## 2) A ENGRENAGEM que NÃO se move (protegida pelo pedido: turno/rajada/unificação)

Estas são **mecânica**, não decisão de negócio. Ficam **determinísticas**:

| Mecanismo | Onde | Por quê não mover |
|---|---|---|
| Rajada/coalescência (debounce, 1 job) | `canal-com-buffer.ts`, drain | é tempo/entrega, não intenção |
| Cancelar resposta se chegou msg nova (`inbound_superada`) | inbound | anti-atropelo |
| Fila/job + idempotência | `job_queue`, retries | entrega confiável |
| **Unificação/junção** do turno (1 bolha) | `juncao-do-turno.ts` | formato do dono |
| Entregar bolhas/fotos com legenda | `split-message.ts`, catálogo | formato |
| Pacing/anti-ban, janela, warm-up, cap | `before-send`, canal | `restricao-de-canal.md` |
| Opt-out/LGPD, handoff duro, cancelar crons | `opt-out/`, `human-handoff.ts` | segurança/legal |

Regra de ouro: **mexer só na DECISÃO; nunca na engrenagem de turno/rajada/junção.**

---

## 3) AUDITORIA — todos os pontos de decisão

Legenda: **[A]** autoridade determinística (decide sozinho / vence a Jev) · **[F]** fallback (Jev primeiro) ·
**[I]** infra/parsing (não é decisão de negócio) · **❌** viola a doutrina.

### 3.1 Entrada de FLUXO
| Ponto | Local | Classe | Observação |
|---|---|---|---|
| `escolherFluxosPorIA` (Jev `flow_intent` → modelo → regex) | `flow-intent.ts:150` | Jev | caminho principal |
| `melhorFluxoPorGatilho` / `fluxosPorGatilho` | `atendimento.ts:286/313` | **[F]** | 3º recurso (só se a IA falha) |
| `flow_start` sem nome (desambiguação) | `inbound-turn.ts:4021` | **[F]** ✅ corrigido | antes **[A]**; agora Jev primeiro |
| `escolherFluxoPorNome` | `atendimento.ts:259` | **[I]** | parsing de nome |

### 3.2 Oferta de CATÁLOGO  ← foco das violações
| Ponto | Local | Classe | Observação |
|---|---|---|---|
| `pedidoDeCatalogoInequivoco` | `pode-oferecer-motos.ts:193` | **[A] ❌** | roda **antes** do veredito da Jev (`inbound-turn.ts:3490` < `:3498`) e **força** |
| `pedidoExplicitoDeMaisOpcoes` | `pode-oferecer-motos.ts:149` | **[A] ❌** | força por cima da Jev |
| `podeOferecerMotos` | `pode-oferecer-motos.ts:217` | **[F]** | régua do fallback (ok) |
| `ehIntencaoDeProcesso` (RE_PROCESSO) | `pode-oferecer-motos.ts:98` | **[F]** | financiar/trocar ≠ catálogo |
| `pedeMotoExplicito`/`querMoto`/`mencionaMoto` | `selecao-por-intencao.ts:889/876/870` | **[A] ❌** | verbo+termo conta **antes** da guarda de "moto em foco" |
| `TERMO_DE_MOTO` | `selecao-por-intencao.ts:860` | **[A] ❌** | contém `categoria`,`cc`,`modelo` → falso-positivo |

### 3.3 Objeção / negociação
| Ponto | Local | Classe | Observação |
|---|---|---|---|
| `ehObjecaoValor` / `motivoDaObjecao` | `objecao-de-valor.ts:229/50` | **[F]** | Jev `objecao` primeiro; `motivoObjecaoFinal:84` respeita a hierarquia |
| `ehPedidoDiferente` | `objecao-de-valor.ts:201` | **[F]** | |
| `clienteConfirmouVer` / `clienteNegouVer` | `objecao-de-valor.ts:128/144` | **[A]** residual | fala social ainda só regex (candidato a ponto Jev) |

### 3.4 Moto escolhida
| Ponto | Local | Classe | Observação |
|---|---|---|---|
| `motoEscolhidaPeloClienteComJev` | `inbound-turn.ts:4581` | Jev | Árbitro `moto_escolhida`; determinístico só fallback ❌ **troca por match ambíguo** |

### 3.5 Handoff / opt-out
| Ponto | Local | Classe | Observação |
|---|---|---|---|
| `detectHumanHandoffRequest` + `matchesHandoffKeyword` | `human-handoff.ts:63`, `agent-config.ts:327` | **[A] justificado** | exigência Meta; roda antes do LLM de propósito |
| `ehOptOutProvavel` | `opt-out/deteccao.ts` | **[A] justificado** | segurança/legal |

### 3.6 Infra (não migrar)
`dados-do-lead.ts` (CPF/data/CNH), `similaridade.ts` (ranking), `projecao.ts` (anti-vazamento),
`split-message.ts` (bolhas), `valorBateComTipo` (tipo do campo). **[I]**.

---

## 4) VIOLAÇÕES CONFIRMADAS (com evidência)

**V1 — A oferta por regex VENCE a Jev.** `pedidoDeCatalogoInequivoco` roda **antes** do veredito
(`inbound-turn.ts:3490` antes de `:3498`). Prova (jornada real 2026-10-13, logs):
turnos 3 e 6 → `"oferta":{"veredito_jev":false}` **mas** régua `pode:true` → **ofereceu**. A Jev viu a moto já
escolhida e disse "não oferecer"; o regex forçou (motivo `cliente_pediu_catalogo` / `cliente_citou_modelo`).

**V2 — `pedeMotoExplicito` sem guarda de foco.** `pode-oferecer-motos.ts:204` decide antes do teste de
"moto em foco" (`:209`). "…**ver** ela de perto?" (verbo "ver" + termo "factor") reoferece mesmo com
`temEscolhaTravada:true`.

**V3 — `TERMO_DE_MOTO` genérico.** `selecao-por-intencao.ts:860` inclui `categoria`/`cc`/`modelo`.
"Tenho sim, CNH **categoria** A" virou `cliente_citou_modelo` → oferta (falso-positivo).

**V4 — Escolha sobrescrita por match ambíguo.** `moto_interesse` terminou **Factor 125 K** (a do turno 3 era a
Factor 150). `catalogo-da-conversa.ts:315-333` **sobrescreve** a cada turno; "fechar a Factor vermelha" (só a
linha) resolveu a unidade errada.

**V5 ✅ corrigido nesta sessão** — `flow-validate` descartava os campos de TEXTO quando a Jev já resolvia um
discreto (causa do P1 "cidade repetida").

**V6 ✅ corrigido nesta sessão** — `flow_start` sem nome usava regex direto; agora Jev primeiro.

---

## 5) PLANO DE CORREÇÃO (um item por vez · ANTES → DURANTE → DEPOIS)

| # | Item | O que fazer | Toca engrenagem? |
|---|---|---|---|
| **1** | **Oferta = autoridade da Jev** | `pedidoDeCatalogoInequivoco`/`pedidoExplicitoDeMaisOpcoes` viram **fallback** (só quando o veredito da Jev é `null`); reforçar `perguntaDeOfertaJev` (`lib/ai/jev/pontos/oferta.ts`) p/ **não negar pedido claro** e **não oferecer** com moto em foco e o cliente só vendo/agendando | não |
| **2** | **`TERMO_DE_MOTO`** | remover `categoria`/`cc`/`modelo` (genéricos) | não |
| **3** | **Guarda de foco** | `pedeMotoExplicito` só força se **não** houver moto em foco/escolhida (ou se pedir OUTRA) | não |
| **4** | **Escolha** | não sobrescrever `moto_interesse` com match ambíguo (só a LINHA, 2+ unidades) — mantém a escolha anterior | não |
| **5** | **Objeção fala** | `clienteConfirmouVer`/`clienteNegouVer` → ponto Jev (ou fallback marcado) | não |
| **6** | **B3** | persona/brief: não repetir a mesma promessa de "confirmar horário" | não |
| **7** | **Bloco 3.6** | manter infra como está (`dados-do-lead`, `similaridade`, `projecao`) | — |

**Ordem recomendada:** (2) e (3) são os mais baratos e inequívocos; (1) é o estrutural; (4) corrige o dado do
CRM. Cada item: teste de unidade do novo comportamento **+** cenário real pelo nº de teste, e registro no PLANO-VIVO.

## 5-A) O QUE QUEBRA A INTELIGÊNCIA — análise coletiva (não só a oferta)

### A) A inteligência RODA, mas está FRAGMENTADA
O **Árbitro** (`arbitro.ts`) unifica numa única chamada **só o trio + 2**:
`objecao` + `negociacao` + `offer_motos` (`inbound-turn.ts:3300`) e `moto_escolhida` + `catalog_criteria`
(`inbound-turn.ts:4571`, `catalogo-da-conversa.ts:646`). **Todo o resto decide SOZINHO**, cada um com o seu
contexto: `flow_intent` (`:2585`), `flow_validate` (`:3048`), `skill_select` (`:3666`),
`knowledge_route` (`:4339`), `pergunta_do_fluxo` (`:7403`), `stage_classifier` (`:6428`), `jailbreak`
(`:6450`), `narracao`, `promise_semantic`, `intent_router` (`resolve-turn-agent.ts:209`), `modelo_categoria`,
`sentiment_classify` (worker).

**Consequência:** a "análise do contexto" existe, mas **não é uma só** → pontos que decidem o MESMO turno veem
contextos diferentes → é a fábrica da *"interseção imprevisível de duas réguas"*. O Árbitro resolveu o custo e a
coerência **de 5 pontos**; os demais continuam por conta própria.

### B) Violações [A] — o regex VENCE a Jev (o que "fura")
| # | Ponto | Onde | Efeito |
|---|---|---|---|
| V1 | `pedidoDeCatalogoInequívoco` antes do veredito | `inbound-turn.ts:3490` < `:3498` | força oferta que o Árbitro negou |
| V2 | `pedeMotoExplicito` antes da guarda de foco | `pode-oferecer-motos.ts:204` | reoferta com moto já escolhida |
| V3 | `TERMO_DE_MOTO` genérico | `selecao-por-intencao.ts:860` | "CNH **categoria** A" vira pedido |
| V4 | escolha sobrescrita por match ambíguo | `catalogo-da-conversa.ts:315-333` | `moto_interesse` errado |

### C) Pontos DESCOBERTOS (decidem por regex, **sem dono Jev**)
| Ponto | Onde | Risco |
|---|---|---|
| `clienteCitouAno` — citar um ANO suspende o bloqueio de ano | `inbound-turn.ts:3528` | o regex decide um parâmetro do catálogo |
| `descontoTurno` (`ehPedidoDesconto`) — "é pedido de desconto?" | `inbound-turn.ts:3257` | regex; entra no ctx da Jev (risco baixo) |
| destravar a moto escolhida por `pedeMotoExplicito` | `inbound-turn.ts:3387-3389` | regex "destrava" a decisão já tomada |
| `detectHumanHandoffRequest` + `matchesHandoffKeyword` | `:2813` | **[A] justificado** (exigência Meta; roda antes do LLM) |
| `ehOptOutProvavel` | `opt-out/deteccao.ts` | **[A] justificado** (segurança/legal) |

### D) FUROS/VAZAMENTOS (decisão que ignora "o que já estava resolvido")
1. **Reabrir oferta com moto já escolhida** — o furo central (V1+V2): o Árbitro viu `temEscolhaTravada:true` e
   negou; o regex reabriu.
2. **Vocabulário genérico** (V3): "categoria"/"cc"/"modelo" casam texto que não é pedido de moto.
3. **Dado sobrescrito** (V4): a escolha correta é trocada por um match frouxo no turno seguinte.
4. **Contexto por ponto** (A): a fragmentação faz um ponto "não ver" o que outro já resolveu.

### E) ORDEM DE EXECUÇÃO (onde o fluxo contraria a doutrina)
1. Árbitro decide o trio (`:3300`) → 2. decisões derivadas → 3. **regex da oferta (`:3490`) sobrepõe** →
4. veredito da Jev (`:3498`) só é usado se o regex não forçou. **A ordem certa é a inversa:** Jev decide; regex
   só sob `null`.

### F) O que está SAUDÁVEL (não mexer)
Handoff/opt-out (segurança) · engrenagem (turno/rajada/junção/idempotência/anti-ban) · infra
(`dados-do-lead`, `similaridade`, `projecao`, `split-message`, `valorBateComTipo`) · o **Árbitro do trio** (é o
modelo a ser estendido, não substituído).

### G) Direção da correção (coletiva)
1. **Todo ponto que hoje decide sozinho por regex vira fallback** do ponto que já tem dono (Jev), na ordem
   `Jev → null → regex`.
2. **Estender o Árbitro** para os pontos que decidem o MESMO turno (menos chamadas, contexto único) — meta:
   um só veredito por turno para os pontos acoplados.
3. **Corrigir vocabulário/ambiguidade** (V2/V3/V4) — tirar falso-positivo, não regra.
4. **Nunca** tocar turno/rajada/junção (engrenagem).

## 6) O que NÃO fazer
- Nenhuma mudança em rajada/fila/junção/idempotência/anti-ban/janela/opt-out/handoff-duro.
- Nenhuma chamada de modelo **por bolha** (custo/latência) — a inteligência decide **por turno** (Árbitro).
- Nenhum bypass novo de regex "vence a Jev" para apagar o sintoma.
