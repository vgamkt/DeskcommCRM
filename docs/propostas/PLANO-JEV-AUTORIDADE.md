# PLANO — a Jev como AUTORIDADE (conformidade com a doutrina)

> **Fonte da verdade deste plano.** Toda mudança atualiza ESTE arquivo (status + evidência + linha no Log).
> Mesmo escopo dos demais: ANTES → DURANTE → DEPOIS, um item por vez, nada sem teste real.

- **Criado:** 2026-10-13 · **Base:** `/root/DeskcommCRM` @ `dcaf95ff` (worktree) · **Branch:** `feat/fluxos-de-atendimento`
- **Org:** `e40dc035-b553-4383-8aac-311d29abcfdc` · **Agente:** `a069549c-278f-4d4d-9501-355c5f3f5e4e`
- **Bot:** +5512981672501 (datafy) · **Auxiliar de teste:** +5512997700101 (envia PARA o bot)
- **Deploy:** `bash /root/arquivos/scripts/validacao/subir-sem-testes.sh` (~13 min)
- **Docs irmãos:** `INVENTARIO-regex-vs-jev.md` (inventário bruto) · `REVISAO-CONFORMIDADE-DOUTRINA.md` (auditoria longa) · `PLANO-VIVO-simplificacao-turno.md` (histórico do turno) · `STATUS-E-PENDENCIAS.md`
- **Doutrina (lei):** `docs/doctrine/jev-decide-sempre.md` · `docs/doctrine/hierarquia-do-turno.md` · `CLAUDE.md` §"Jev decide SEMPRE"

## Regras de uso (não negociáveis)
1. **Teste ANTES de implementar** (vermelho → verde).
2. **Um item por vez**; nenhum item sem teste real.
3. **Nada toca a ENGRENAGEM** (turno/rajada/junção/idempotência/anti-ban/opt-out/handoff-duro).
4. **Atualizar este arquivo a cada mudança** (status + evidência + Log).
5. Correção = **remover a segunda régua** (regex vira fallback), nunca criar outra régua.

## PROTOCOLO (o mesmo dos outros planos)
- **ANTES** — mede o comportamento atual (unidade pura + cenário real pelo nº de teste).
- **DURANTE** — teste do novo comportamento (vermelho→verde), ao lado do módulo.
- **DEPOIS** — o mesmo cenário do ANTES, refeito; `pnpm typecheck` + `lint` 0 + `vitest run lib/agent-engine lib/followup` verdes.

**Status:** `[ ]` pendente · `[~]` em andamento · `[x]` feito · `[—]` fora

---

## §1) A regra principal (doutrina)
1. **A Jev decide** (caminho principal). 2. **Regex é FALLBACK** — só quando o veredito é `null`.
3. **Veredito negativo é decisão** (não se roda regex por cima). 4. Veredito ruim **conserta-se no PROMPT/contexto**.
5. **Inteligência = Árbitro de turno** (`lib/ai/jev/arbitro.ts`): UMA chamada da Jev resolve vários pontos sobre o **contexto unificado** do turno.

## §2) Fontes de regra e precedência (resumo)
Camadas: doutrina (`CLAUDE.md`/`AGENTS.md`) · decisão (`jev-decide-sempre`) · comportamento (`hierarquia-do-turno`) ·
falar×operar · sistema-vivo · canal (`restricao-de-canal`) · negócio (`docs/business-rules/00-…`) · spec
(`16-tres-papeis`) · **mecanismos** (`lib/ai/jev/pontos/*`, `arbitro.ts`, `BEFORE_SEND_GATES`, flow-graph) ·
**config do tenant** (persona/skills/fluxos).
Três hierarquias (não se reordenam): **(i) decisão:** Jev > regex-fallback · **(ii) comportamento:** `Fluxo > Objeção(Jev) > Skill > Persona` · **(iii) envio:** `BEFORE_SEND_GATES` versionada.
**Um arquivo de regra só existe para um eixo NOVO.** Mesmo comportamento em dois lugares = a "segunda régua" (defeito).

## §3) ENGRENAGEM protegida (NÃO se move)
Rajada/coalescência · `inbound_superada` · fila/job/idempotência · **junção/unificação (1 bolha)** · bolhas/fotos ·
anti-ban/janela/warm-up/cap · opt-out/LGPD · handoff-duro/cancelar crons.

---

## §4) AUDITORIA (resumo; detalhe em `REVISAO-CONFORMIDADE-DOUTRINA.md`)

**Onde a inteligência roda:** Árbitro unifica `objecao`+`negociacao`+`offer_motos` (`inbound-turn.ts:3300`) e
`moto_escolhida`+`catalog_criteria` (`:4571`). **O resto decide sozinho** (`flow_intent:2585`, `flow_validate:3048`,
`skill_select:3666`, `knowledge_route:4339`, `pergunta_do_fluxo:7403`, `stage_classifier:6428`, `jailbreak:6450`,
`narracao`, `promise_semantic`, `intent_router`, `modelo_categoria`, `sentiment_classify`).

**Violações [A] (regex VENCE a Jev):**
| # | Ponto | Onde |
|---|---|---|
| V1 | `pedidoDeCatalogoInequívoco` antes do veredito | `inbound-turn.ts:3490` < `:3498` |
| V2 | `pedeMotoExplicito` antes da guarda de foco | `pode-oferecer-motos.ts:204` |
| V3 | `TERMO_DE_MOTO` genérico (`categoria`/`cc`/`modelo`) | `selecao-por-intencao.ts:860` |
| V4 | escolha sobrescrita por match ambíguo | `catalogo-da-conversa.ts:315-333` |
| V5 | ✅ corrigido (cidade/P1) | `flow-validate.ts` |
| V6 | ✅ corrigido (`flow_start` sem nome) | `flow-start`/`flow-intent.ts` |

**Pontos DESCOBERTOS (regex sem dono Jev):** `clienteCitouAno` (`:3528`) · `descontoTurno` (`:3257`) · destravar
moto escolhida por `pedeMotoExplicito` (`:3387`). **Justificados (não migrar):** handoff regex (`:2813`), opt-out.

**Evidência real (2026-10-13, jornada adaptativa):** turnos 3 e 6 → `veredito_jev:false` **mas** régua
`pode:true` → **ofereceu** (V1). `moto_interesse` terminou **Factor 125 K** (escolha era Factor 150 — V4).

---

## §5) PLANO (esboço) — item a item

### FASE A — Ambiguidade / falsos positivos (baixo risco, sem tocar estrutura)
| # | Item | Onde | ANTES | DURANTE | DEPOIS | Engrenagem |
|---|---|---|---|---|---|---|
| **A1** | **`TERMO_DE_MOTO`** — remover termos genéricos (`categoria`,`cc`,`cilindrada`) | `selecao-por-intencao.ts:860` | `mencionaMoto("CNH categoria A")=true` (falso) | `=false`; "naked"/"250cc"/"ver modelos" seguem `true` | **✅ FEITO** (build `dcaf95ff`) | não toca |
| **A2** | **Guarda de foco no `pedeMotoExplicito`** | `pode-oferecer-motos.ts:193` | "ver a Factor" c/ escolha travada → força oferta | não força (só se pedir OUTRA) | **✅ FEITO** (build `dcaf95ff`) | não toca |
| **A3** | **Escolha não sobrescreve com match ambíguo** | `catalogo-da-conversa.ts` (`montarPedidoDeEscolha`) | escolhida/detalhada some das candidatas → Jev elege outra (150→125K) | a escolhida entra nas candidatas | **✅ FEITO** (build `dcaf95ff`) | não toca |

### FASE B — Autoridade da Jev na OFERTA (o estrutural)
| # | Item | Onde | ANTES | DURANTE | DEPOIS | Engrenagem |
|---|---|---|---|---|---|---|
| **B1** | **Oferta = autoridade da Jev** — rede vira fallback (só sob veredito `null`) | `inbound-turn.ts`, `pode-oferecer-motos.ts` (`decidirOfertaComAutoridadeDaJev`) | "e uma lander?" Jev nega → bot promete e não mostra; moto escolhida + "ver" → reoferta | Jev decide; rede só sob `null` | **✅ FEITO** (build `dcaf95ff`) — live: "e uma lander?" **mostra**; "moto escolhida + ver" **não** reoferta | não toca |

### FASE C — Pontos descobertos (dar dono à Jev ou justificar)
| # | Item | Onde | Veredito |
|---|---|---|---|
| **C1** | `clienteCitouAno` | `inbound-turn.ts:3518` | **[I] justificado** — é um **parse** ("o cliente citou um ano") que suspende o bloqueio e trava o ano EXATO; decisão do dono porque "a IA variava para 2025/2026". Não é decisão de negócio. |
| **C2** | `descontoTurno` (`ehPedidoDesconto`) | `inbound-turn.ts:3257` | **input da Jev** — só detecta e entra no ctx; a Jev decide a ação. Mantido. |
| **C3** | destravar a escolha por `pedeMotoExplicito` | `inbound-turn.ts:3387` | **justificado** — regra intencional do dono (2026-09-30: pedido claro substitui a moto salva); a parte de falso-positivo já foi tratada na A2. |

### FASE D — Fala social → Jev
| # | Item | Onde | Nota |
|---|---|---|---|
| **D1** | `clienteConfirmouVer`/`clienteNegouVer` | `objecao-de-valor.ts:128/144` | **já é input/fallback** — a CONFIRMAÇÃO é da ação da Jev (`mostrar_opcoes`/`encaminhar`); o regex só estima (`inbound-turn.ts:3257`) ou é fallback (`:3374`). Nada a migrar. |

### FASE E — Fragmentação do Árbitro (contexto único)
| # | Item | Onde | Nota |
|---|---|---|---|
| **E1** | Estender o Árbitro aos pontos acoplados do mesmo turno | `lib/ai/jev/arbitro.ts` + chamadas | **✅ satisfeito nos pontos ACOPLADOS** (trio `objecao+negociacao+offer_motos`; `moto_escolhida+catalog_criteria`). **NÃO acoplar mais:** o Árbitro exige TODAS as perguntas obrigatórias — juntar `skill_select` (N skills) faria o trio **falhar mais** e cair no caminho por ponto (mais chamadas, não menos). Os demais pontos decidem em **momentos diferentes** (fluxo, guardrails, tools) — não compartilham contexto. **Decisão: manter.** |

### FASE F — B3
| # | Item | Onde | Nota |
|---|---|---|---|
| **F1** | não repetir a mesma promessa de "confirmar horário" | brief | **✅ FEITO** (build `dcaf95ff`) — `brief-do-turno.ts` ("Não se repita") |
| **F2** | não fazer "pitch" de specs fora de contexto | `estado-do-atendimento.ts` + brief | **✅ FEITO** (build `dcaf95ff`) — descrição vira REFERÊNCIA + regra no brief |
| **F3** | fecho com moto JÁ ESCOLHIDA = pergunta de AQUISIÇÃO (não "qual delas?") | `fecho-do-turno.ts` + `mais-opcoes.ts` | **✅ FEITO** (build `dcaf95ff`) — induz o fluxo de pagamento |
| **F4** | NÃO re-tentar o turno quando alguma peça JÁ saiu (evita duplicar) | `inbound-turn.ts` + `re-tentativa-de-envio.ts` | **✅ FEITO** (build `dcaf95ff`) — falha transitória não duplica mais |
| **F5** | aviso/alerta de falha NÃO vai para o próprio número do cliente (anti-loop) | `handoff-por-lentidao.ts` | **✅ FEITO** (build `dcaf95ff`) — aviso não entra na conversa |
| **F6** | fotos do catálogo em **HTTPS** (WhatsApp exige) | `fotos-do-catalogo.ts` | **✅ FEITO** (build `dcaf95ff`) — fim do `131053`; fotos `sent` |
| **F7** | escolha detectada com PONTUAÇÃO ("Factor 150,") → envia as fotos da escolhida | `catalogo-da-conversa.ts` | **✅ FEITO** — split por não-alfanumérico nos tokens |
| **F8** | fecho re-adiciona o "quer ver mais?" (o F3 o apagava) | `fecho-do-turno.ts` | **✅ FEITO** — "Quer que eu separe mais opções?" ao vivo |
| **F9** | pergunta de AQUISIÇÃO educada, com o NOME e todas as formas (à vista/financiado/cartão/troca) | `mais-opcoes.ts` + `fecho-do-turno.ts` | **✅ FEITO** — "Vander, só pra eu te ajudar…" ao vivo |

**Ordem de execução acordada:** **A1 → A2 → A3 → B1 → C1/C2/C3 → D1 → E1 → F1.**

---

## §6) LOG DE MUDANÇAS (mais recente no topo)
- **2026-10-14** — **F12 (oferta: 1ª = as que CASAM; "ver mais" = por ordem de casamento) — FEITO e VALIDADO.**
  Decisão do dono: **não encher a 1ª oferta com coisa infundada** — a primeira leva são as que CASAM (até
  `similares_qtd=5`); o **"ver mais"** continua por **ordem de casamento** (as casadas restantes e, se faltar,
  as **parecidas** que casam só em parte — `filtrarPorHipoteses`, OR pontuado). Quando casam **poucas** (ex.: 2),
  manda as 2 e **pergunta** — porque há parecidas para o "ver mais". **Correção:** no modo estrito, a fila
  (`inbound-turn.ts`) passou a ser `[...casadasNaoEnviadas, ...parciais]`; e o convite "quer ver mais?" só sai
  quando a fila tem o que mostrar. **DEPOIS (WAHA real):** "têm uma Lander?" → **5 motos** + "Quer ver mais
  algumas?"; **"Pode mandar mais, quero ver outras"** → **3 motos** (BMW G 310 GS, XRE 190, V-Strom). Suíte
  **1448/1448**, typecheck ✓, lint 0.
- **2026-10-14** — **F11 (modelo FORA do estoque → oferta pela CATEGORIA, sem estreitar pela "linha") — FEITO e
  VALIDADO.** **Defeito:** "Vocês têm uma **Lander**?" (não temos) trazia **1 moto** (CB 500 X). **Causa:** a Jev
  chutou a hipótese "CB 500"; o motor estreitava a oferta pela **"linha" dessa hipótese**
  (`compartilhaLinhaDoModelo`, via `nomeiaModelo`) → sobrava só a CB 500 X, embora houvesse **8 trail** no
  estoque. **Correção:** quando o cliente cita um modelo que **NÃO está no estoque** (`citouModeloForaDoEstoque`,
  detectado no bloco da categoria-da-referência), `nomeiaModelo=false` — a oferta é pela CATEGORIA, sem estreitar
  pela linha. **DEPOIS (WAHA real):** "têm uma Lander?" → **5 motos** (XTZ Crosser, Crosser S, Hymalayan 400, CB
  500 X, G 310 GS). Suíte **1448/1448**, typecheck ✓, lint 0. **Nota:** o teto é `similares_qtd=5` (schema máx 8);
  as demais saem no "quer ver mais?".
- **2026-10-14** — **F10b (a JEV decide a CONTINUAÇÃO do convite — princípio geral) — FEITO e VALIDADO.** Diretriz
  do dono: *"o 'sim' vem de várias formas, em qualquer situação; a decisão primária é a Jev"*. Em vez de a
  regex `clienteConfirmouVer` decidir, o ponto `offer_motos` (`lib/ai/jev/pontos/oferta.ts`) ganhou a pergunta
  **`continuacao`** (`mostrar_mais` / `novo_pedido`), feita **só quando há opções pendentes** (já perguntamos
  "quer ver mais?"). A Jev lê a INTENÇÃO — **qualquer forma** de confirmar conta (sim/pode/quero/manda/claro/…).
  `vereditoDeOfertaDaJev` devolve `continuacao`; a fila (`inbound-turn.ts`) usa **`vereditoOfertaJev.continuacao`
  primeiro**, com `querMaisOpcoes`/`clienteConfirmouVer` só como FALLBACK (Jev desligada). **DEPOIS (WAHA real):**
  "têm uma Honda?" → 5 motos + "Quer ver mais?"; **"Pode mandar sim, quero ver as outras"** → 4 motos + "Claro!
  Separei mais algumas Hondas…". Suíte **1448/1448**, typecheck ✓, lint 0. **Princípio** (vale para os outros
  pontos da Jev): quem entende a intenção é a Jev; regex só fallback.
- **2026-10-14** — **F10 ("Sim" ao "quer ver mais?" agora MOSTRA) — FEITO e VALIDADO.** **Defeito (WhatsApp
  real):** o bot mostrou 5 Honda, perguntou "Quer ver mais algumas?", o cliente respondeu **"Sim"** e o bot
  disse *"Vou verificar aqui as outras Honda… e já te falo"* — **não mostrou**. **Causa-raiz:** a **Jev negava a
  oferta** (`veredito_jev:false`) porque **não sabia que o bot havia perguntado "quer ver mais?"**; e a fila de
  opções só era consumida por `querMaisOpcoes("Sim")` (falso). **Correção:** (1) `temOpcoesPendentes` no
  `ContextoDeOferta` (`lib/ai/jev/pontos/oferta.ts`) + regra "se há opções pendentes E o cliente CONFIRMA o
  convite (sim/pode/quero/manda/mostra) → oferecer"; (2) a fila (`inbound-turn.ts`) também é consumida com
  `clienteConfirmouVer`. **DEPOIS (WAHA real):** "têm uma Honda?" → 5 motos + "Quer ver mais?"; **"Sim"** → 4
  motos + "Perfeito! Separei mais algumas opções pra você:". Suíte **1447/1447**, typecheck ✓, lint 0.
- **2026-10-14** — **F9 (pergunta de aquisição educada, com nome e todas as formas) — FEITO e VALIDADO.**
  `perguntaDeAquisicao` (`mais-opcoes.ts`) reescrita: chama o cliente pelo **nome** e oferece **todas** as formas
  (à vista, financiado, **no cartão**, ou **moto na troca** como parte do pagamento), em tom educado ("só pra eu
  te ajudar do jeito certo…"). O nome vem de `effectiveContext.contact.name` (`display_name ?? name`) passado ao
  fecho (`nomeCliente`). Também corrigida a **duplicação** do "quer ver mais?" (a regex `jaPergunta` não cobria a
  variante "mais algumas" → o fecho F3 somava com a garantia). **DEPOIS (WAHA real):** "Gostei da XRE 190, quero
  essa!" → 9 imagens + *"Vander, só pra eu te ajudar do jeito certo: qual forma de pagamento você está pensando —
  à vista, financiado, no cartão, ou com uma moto na troca como parte do pagamento?"*; `custom_fields.moto_interesse
  = "HONDA XRE 190"` gravado; T1 sem duplicação. Suíte **1105/1105**, typecheck ✓, lint 0.
- **2026-10-14** — **F7 + F8 (escolha com pontuação + "quer ver mais?" no fecho) — FEITO e VALIDADO (WAHA real).**
  **Defeito 1:** o cliente escolhia ("Gostei da Factor 150, quero essa.") e as fotos da escolhida NÃO saíam.
  **Causa:** `normalizarNomeDeMoto` NÃO tira pontuação → o token `"150,"` (com vírgula) não casava o nome →
  `temReferenciaAMoto` false → escolha não detectada. **Correção:** split dos tokens por **não-alfanumérico**
  (`catalogo-da-conversa.ts`, 2 pontos). **Defeito 2:** o "Quer ver mais?" (garantido em `inbound-turn.ts`) era
  **apagado pelo fecho F3** (que remove a cauda interrogativa). **Correção:** `ajustarFechoDoTurnoDeCatalogo`
  ganhou `temMaisOpcoes` — re-adiciona o "quer ver mais?" (sem escolha). **DEPOIS (WAHA real 0101→2501):** T1
  "têm Factor 150?" → 2 imagens + "Qual delas…? Quer ver mais algumas?"; T2 "Gostei da Factor 150, quero essa."
  → **7 imagens** (todas as fotos da escolhida) + "…à vista, financiado ou com troca?" (sem "quer ver mais
  fotos"); persistência confirmada (`agent_catalogo`: motos=2, `escolhida=YAMAHA Factor 150 ED`). Suíte
  **1104/1104**, typecheck ✓, lint 0. **Pendente de decisão:** no turno de "Lander" **após** já haver moto
  escolhida, o fecho é o de aquisição (não "qual delas?") — comportamento por desenho (moto travada).
- **2026-10-14** — **F6 (upload de mídia `131053` — fotos em http) — FEITO e VALIDADO.** **Causa-raiz:** o
  catálogo entrega as imagens em **`http://loja.vgasistemas.app/...`** (27/27 URLs http, 0 https) e o WhatsApp
  **só baixa mídia por HTTPS** → `131053 Media upload error` (a foto não chegava). **Correção:** `extrairMotosDoResultado`
  (`fotos-do-catalogo.ts`) normaliza **http→https** (o host responde 200 em https — confirmado). **DURANTE**:
  testes atualizados (`fotos-do-catalogo.test.ts` + novo caso de normalização). **DEPOIS** (ao vivo, build
  `dcaf95ff`): as imagens saem com `media_url` **https** e status **`sent`** — **0 falhas**. Suíte **1100/1100**,
  typecheck ✓, lint 0.
- **2026-10-14** — **F5 (aviso de falha entrando na conversa) — FEITO e VALIDADO.** **Defeito (conversa real):** o
  alerta *"⚠️ NÃO consegui ENTREGAR…"* e o aviso *"Vou passar seu atendimento para o responsável"* apareceram
  como mensagens **do cliente** e dispararam turnos. **Causa-raiz:** o **destino dos avisos** (`failure_alerts`)
  estava configurado como o **próprio número do cliente** (0101 no teste) → o aviso voltava como **INBOUND** e
  entrava na conversa. **Correção (estrutural):** guarda `avisoVoltariaAoCliente` (`handoff-por-lentidao.ts`) —
  se o destino é o número do cliente, **não avisa** (log). **DURANTE**: teste puro 3/3. **DEPOIS** (conversa real,
  build `dcaf95ff`): **sem** alerta/aviso na conversa, **sem duplicação**, objeção 1/2/3 corretas, "têm Lander?"
  → 4 motos trail. Suíte **1099/1099**, typecheck ✓, lint 0. **Nota:** a falha que disparava o aviso foi o
  **upload de mídia do canal datafy** (`131053`), transitório — a guarda impede o vazamento independentemente dele.
- **2026-10-14** — **F4 (duplicação por re-tentativa de envio) — FEITO e VALIDADO.** **Defeito (conversa real):**
  o turno "Lander" emitiu DUAS levas (moto CB 500 X e pergunta repetidas). **Causa-raiz:** uma peça do envio falhou
  (`datafy_error: fetch failed`, transitória) → o código lançava e **re-tentava o job inteiro** → o turno
  **re-rodava o modelo** (não determinístico) e **reenviava**. **Correção (estrutural):** nova função pura
  `deveReTentarTurnoPorEnvio` (`re-tentativa-de-envio.ts`) — só re-tenta quando **NADA** foi entregue; envio
  PARCIAL **não** re-tenta (o item perdido é melhor que duplicar). Ligada nos 2 pontos de throw (`inbound-turn.ts`).
  **DURANTE**: teste puro 4/4. **DEPOIS** (conversa real): **sem duplicação**. Suíte **1100/1100**, typecheck ✓, lint 0.
  **Observado nesta rodada (fora do escopo, infra/outros):** (a) o canal datafy falhou no **upload de mídia**
  (`131053 Media upload error`) e o **alerta ao controlador** foi gravado como outbound `sent` (a conferir se
  vaza ao cliente); (b) na 1ª objeção o bot disse *"Vou passar seu atendimento para o responsável"* (fala de
  handoff cedo demais — B3). Ambos a tratar à parte.
- **2026-10-14** — **F3 (fecho com moto escolhida = pergunta de AQUISIÇÃO) — FEITO e VALIDADO.** **Defeito:** com
  UMA moto já escolhida na tela, o fecho forçava a pergunta de ESCOLHA ("Gostou de alguma? Me diz qual chamou
  mais a sua atenção") — não havia mais o que escolher. **Causa:** `ajustarFechoDoTurnoDeCatalogo`
  (`fecho-do-turno.ts`) **sempre** garante `perguntaDeEscolha`. **Correção (estrutural, sem regra nova):** novo
  `temEscolha` no ajuste — com moto escolhida, o fecho é a **`perguntaDeAquisicao`** ("como pretende levar? à
  vista, financiado ou na troca?"), que INDUZ o fluxo de pagamento; sem escolha, segue a de escolha. Wiring nos
  2 call sites do `inbound-turn.ts`. **DURANTE**: testes em `fecho-do-turno.test.ts`. **DEPOIS** (ao vivo, build
  `dcaf95ff`): turno do pedido → "Qual delas chamou mais a sua atenção?"; turno da ESCOLHA → *"Boa escolha, Joao!
  A Factor 150 é uma moto muito confiável e econômica no dia a dia. Me diz como fica melhor pra você: à vista,
  financiado ou com a sua moto na troca?"*. Suíte **1096/1096**, typecheck ✓, lint 0.
- **2026-10-14** — **F2 ("pitch" de specs fora de contexto) — FEITO e VALIDADO.** **Motivo achado:** no fecho
  ("só quero fechar essa Factor"), o modelo emendou *"vale saber: faz 40 km/l, tanque 13,5 L, partida
  elétrica"* — specs que estão na **`motos.descricao`** do catálogo (confirmado por SQL) **e** na **base de
  conhecimento** (o RAG trouxe 3 trechos no turno). A instrução do bloco de descrição dizia *"use as QUALIDADES
  ao falar/defender"* — convite ao pitch. **Correção:** (1) `estado-do-atendimento.ts` — a descrição vira
  **REFERÊNCIA** ("use SÓ quando o cliente PERGUNTAR ou em objeção; nada de 'vale saber'"); (2) `brief-do-turno.ts`
  — regra geral "## Não faça 'pitch' não solicitado" (cobre catálogo **e** base). **ANTES** (ao vivo): turno de
  fecho com "dá mais de 40 km/l". **DEPOIS** (ao vivo, build `dcaf95ff`): turno de fecho → *"Factor 150 vermelha
  anotada como a sua. Pra eu já deixar tudo encaminhado certinho, só falta um detalhe rápido. De qual cidade você
  fala?"* — **sem specs**. Suíte **1094/1094**, typecheck ✓, lint 0.
- **2026-10-13** — **VALIDAÇÃO PONTA-A-PONTA (jornada adaptativa) — OK.** Cliente simulado por IA (reage ao bot),
  10 turnos até fechar o negócio, no build `dcaf95ff`. **Confirmado:** (1) oferta só quando o cliente busca
  (turno 2, 3 motos no orçamento); (2) **sem reoferta** após a escolha e ao agendar (turnos 3–4) — B1/A2;
  (3) "CNH categoria A" **não** dispara oferta — A1; (4) `moto_interesse = YAMAHA Factor 150 ED` (correto, não
  125 K) — A3; (5) fluxos **Financiamento** e **Qualificação** `completed`; (6) dados gravados: cidade, cnh, cpf,
  data_nascimento, parcelas, entrada. **Restou observado (fora do escopo):** o bot repete o enquadramento
  "quem analisa é a financeira / o consultor confirma o horário" ao longo dos turnos — é a lacuna de
  produto (não há ferramenta de agenda/análise); a regra F reduziu a repetição literal, não a temática.
- **2026-10-13** — **D + E — REVISADOS (sem código; decisão de manter).** **D** (`clienteConfirmouVer/NegouVer`):
  já é **input/fallback** — a confirmação é a AÇÃO da Jev (`mostrar_opcoes`/`encaminhar`); o regex só estima o
  contexto (`inbound-turn.ts:3257`) ou é fallback (`:3374`). **E** (estender o Árbitro): os pontos **acoplados
  já estão unificados** (trio + `moto_escolhida`/`catalog_criteria`); **acoplar mais é contraproducente** — o
  Árbitro exige TODAS as perguntas obrigatórias, então juntar `skill_select` (N skills) faria o trio **falhar
  mais** e cair no caminho por ponto (mais chamadas). Os demais decidem em **momentos diferentes** do turno.
  **Decisão: manter.** Com isto, **todo ponto de decisão passa pela Jev (autoridade) com determinístico só como
  fallback** — a doutrina está satisfeita no essencial.
- **2026-10-13** — **C (triagem dos pontos "descobertos") — REVISADO (sem código).** `clienteCitouAno` = **[I]**
  (parse que trava o ano EXATO — decisão do dono; não é decisão de negócio); `descontoTurno` = **input da Jev**
  (a Jev decide a ação); destravar a escolha por `pedeMotoExplicito` = **justificado** (regra intencional; a parte
  de falso-positivo já caiu na A2). Nada a migrar.
- **2026-10-13** — **F/B3 (não repetir a promessa de retorno) — FEITO e VALIDADO.** Regra curta no brief
  (`brief-do-turno.ts`, bloco "## Não se repita"), adicionada só quando o brief já tem conteúdo (preserva o
  contrato "vazio ⇒ ''"). **ANTES**: na jornada real o bot repetiu "vou confirmar o horário com o responsável"
  3–9×. **DURANTE**: teste novo em `brief-do-turno.test.ts` (contém a regra; e o contrato de vazio). **DEPOIS**
  (ao vivo, build `dcaf95ff`): turno "consigo ir amanhã?" → "vou confirmar com a equipe…"; turno seguinte "já
  confirmou o horário?" → **NÃO repetiu** — respondeu *"o horário ainda não está fechado — estou aguardando a
  equipe… assim que tiver eu te aviso"*. Suíte **1093/1093**, typecheck ✓, lint 0. Engrenagem intocada.
- **2026-10-13** — **B1 (oferta = AUTORIDADE da Jev; rede vira fallback) — FEITO e VALIDADO AO VIVO.** Extraída a
  decisão para a função pura `decidirOfertaComAutoridadeDaJev` (`pode-oferecer-motos.ts`): **1)** veredito da Jev
  (inclusive NEGATIVO) manda; **2)** só sob veredito `null` a rede (`pedidoDeCatalogoInequívoco` →
  `pedidoExplicitoDeMaisOpcoes` → `podeOferecerMotos`) decide. O closure `decidirOfertaDoTurno`
  (`inbound-turn.ts`) passa a chamar a função (antes a rede rodava **antes** e **vencia** a Jev). **ANTES** (logs
  reais): turnos 3 e 6 da jornada → `veredito_jev:false` **mas** `pode:true` (rede forçou). **DURANTE**: 3 testes
  novos (negativo da Jev vence; positivo manda; `null` → rede). **DEPOIS (ao vivo, build `dcaf95ff`)**: turno 1
  "moto até 15 mil" → **3 motos**; turno 2 "vocês têm uma **Lander**?" → **3 motos** (a Jev segurou o pedido
  claro — o caso do G3.10 **sem** a rede vencer); turno 3 "gostei, quero essa" → escolha, **0 motos**; turno 4
  "ver ela amanhã" → **0 motos** (não reoferece). Suíte **1091/1091**, typecheck ✓, lint 0. Engrenagem intocada.
  **Nota:** o prompt da oferta (`perguntaDeOfertaJev`) já tinha as regras fortes — não precisou mudar.
- **2026-10-13** — **A3 (escolha não se perde em match ambíguo) — FEITO e VALIDADO.** Causa-raiz: em
  `montarPedidoDeEscolha` (`catalogo-da-conversa.ts`) a moto **já escolhida/detalhada era EXCLUÍDA das
  candidatas** — então uma referência ambígua a ela ("a Factor vermelha", havendo outra vermelha) não casava e a
  Jev elegia OUTRA unidade (medido: `moto_interesse` Factor 150 → Factor 125 K). Correção: novo parâmetro
  `escolhidaAtual` — a escolhida entra nas candidatas (como a citada). Wiring em `motoEscolhidaPeloClienteComJev`
  e nos 2 call sites do `inbound-turn.ts`. **DURANTE**: teste novo em `catalogo-da-conversa.test.ts` (sem
  `escolhidaAtual` a escolhida some; com, entra). **DEPOIS** (build `dcaf95ff`): probe deployed — sem
  `escolhidaAtual` candidatas = só `Factor 125 K`; com = `Factor 150 ED` **+** `Factor 125 K` (a Jev agora vê a
  escolhida e responde "nenhuma" no ambíguo → não sobrescreve). Suíte **1088/1088**, typecheck ✓, lint 0.
  Engrenagem intocada.
- **2026-10-13** — **A2 (guarda de foco no `pedidoDeCatalogoInequívoco`) — FEITO e VALIDADO.** Nova função pura
  `citaMotoEmFoco` (`pode-oferecer-motos.ts`): se a mensagem fala da moto **que já está em foco** (mesma LINHA
  e mesmo número), NÃO força oferta — cobre "ver ela de perto"/"ver a Factor" com a moto já escolhida.
  **ANTES** (probe deployed): esses casos forçavam `cliente_pediu_catalogo`. **DURANTE**: testes novos em
  `pedido-de-catalogo.test.ts` (foco → `null`; "CB 300?" vs foco "CB 160" → segue forçando; "ver mais opções" →
  segue forçando). **DEPOIS** (build `dcaf95ff` no ar): "ver ela de perto" e "ver a Factor vermelha" (foco
  Factor 150) → `forcado:null`; "tem uma CB 300?" (foco CB 160) → `cliente_pediu_catalogo`; "e uma lander?" →
  `cliente_citou_modelo`; "quero ver mais opções" → `cliente_pediu_mais_opcoes`; "essa moto presta…" → `null`.
  Suíte **1086/1086**, typecheck ✓, lint 0. Engrenagem intocada.
- **2026-10-13** — **A1 (`TERMO_DE_MOTO` sem genéricos) — FEITO e VALIDADO.** Removidos `categoria`, `cc` e
  `cilindrada` do regex (`selecao-por-intencao.ts:860`); mantidos `moto`/`modelo(s)`/categorias concretas/marcas/
  modelos. **ANTES** (probe no build deployed): `mencionaMoto("Tenho sim, CNH categoria A.")=true` e
  `pedidoDeCatalogoInequivoco` → `cliente_citou_modelo` (falso-positivo). **DURANTE**: teste novo em
  `pedido-de-catalogo.test.ts` (falso-positivo vira `null`; "naked"/"250cc"/"ver modelos" seguem forçando).
  **DEPOIS** (build `dcaf95ff` no ar): "CNH categoria A" → `mencionaMoto:false`, `forcado:null`; "quero uma
  naked"/"tem uma moto 250cc?"/"gostaria de ver modelos" → seguem `true`/forçando. Suíte **1083/1083**,
  typecheck ✓, lint 0. **Ajuste durante a implementação:** 1ª versão removia também `modelo(s)`, o que
  enfraquecia "ver modelos" — revertido antes do definitivo. Engrenagem intocada.
- **2026-10-13** — **Plano criado.** Consolidados o inventário, a auditoria de conformidade e o esboço do plano
  neste arquivo (mesmo padrão dos demais). Nada de código alterado. Achados prévios desta sessão já corrigidos:
  **V5** (`flow-validate`, P1/cidade) e **V6** (`flow_start` sem nome, Jev primeiro). Ordem acordada:
  `A1 → A2 → A3 → B1 → C1/C2/C3 → D1 → E1 → F1`.

## §7) DECISÕES (não reabrir sem motivo)
1. **Engrenagem intocável** (turno/rajada/junção/idempotência/anti-ban/opt-out/handoff-duro).
2. **Correção = remover a segunda régua** (regex vira fallback), nunca criar outra.
3. **Handoff regex e opt-out permanecem [A]** (segurança/legal).
4. **Árbitro é o modelo a ESTENDER**, não substituir.
