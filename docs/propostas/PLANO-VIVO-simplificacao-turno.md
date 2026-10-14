# PLANO VIVO — Simplificação do turno (o motor vira servidor)

> **Este arquivo é a fonte da verdade do plano.** Toda mudança atualiza ESTE arquivo
> (status + evidência + linha no Log). Plano vive aqui, não na memória.

- **Criado:** 2026-10-10 · **Base:** `/root/DeskcommCRM` @ `dcaf95ff`
- **Dono:** Valle Motos · **Ambiente:** VPS produção (Docker)

## Regras de uso (não negociáveis)
1. **Teste ANTES de implementar** (vermelho → verde).
2. **Um item por vez**; nenhuma mudança sem passar por teste real.
3. **Antes de tornar definitivo: cenário real** (nº de teste). Ruim = reverte (flag OFF).
4. **Atualizar este arquivo a cada mudança** (status + evidência).
5. Grupo 4 **adiado** (só se for gargalo).

## PROTOCOLO DE TESTES — ANTES · DURANTE · DEPOIS (exigência do dono, 2026-10-11)
Cada item só é dado por pronto com os TRÊS momentos registrados aqui (linha no Log com os números):
- **ANTES (linha de base)** — um teste/medição que captura o **comportamento atual** (o defeito ou o
  "como está hoje"), rodado e colado no Log. Sem isso não há prova de que mudou.
  - código inline no `inbound-turn.ts` → extrair a decisão para uma função pura e testá-la (caracterização);
  - comportamento de rede → **cenário real** pelo nº de teste (`/tmp/opencode/one-turn.js`), medindo
    bolhas, textos, `handoff`, latência e as linhas de log do ponto.
- **DURANTE (unidade)** — testes do **novo** comportamento (vermelho→verde), ao lado do módulo.
- **DEPOIS (real)** — o **mesmo** cenário do ANTES, refeito, com os mesmos números; e `pnpm typecheck` +
  `lint` 0 + suíte verde. Diferença ANTES×DEPOIS = a evidência de que o item entregou.


**Status:** `[ ]` pendente · `[~]` em andamento · `[x]` feito · `[—]` fora (grupo 4)

## Modelo-alvo (o que o sistema deve ser)
```
1. chega mensagem/rajada
2. a Jev lê o HISTÓRICO e entende a intenção (+ o que FALTA responder)
3. a Jev decide o que entra: skills, RAG, regras
4. o motor só MONTA e entrega à IA
5. a IA escreve
6. bateu fluxo? 2ª chamada SÓ para unificar (sem skills/Jev) → entrega
```
Regras de ouro: **regex só fallback** · **sem resolver → abre chamado + avisa controlador** ·
**chegou msg nova antes de enviar → cancela e roda a próxima**.

---

## GRUPO 3 — decisões que SAEM do motor → viram decisão da Jev (TRABALHO)

| # | Item | Onde | Status | Evidência |
|---|---|---|---|---|
| G3.1 | Oferta não insiste (`send_message` sem `motos` se a decisão nega) | `oferta-de-envio.ts`; `inbound-turn.ts:3741` | **[x]** | loop=0, timeout=0; 1ª resp 41–53s (teste real) |
| G3.2 | C-107: a IA escreve a pergunta de orçamento | `inbound-turn.ts:3446` | **[x]** | **PROMOVIDO**: `PERGUNTA_DE_ORCAMENTO` deletada; real: IA escreveu "Qual valor máximo…", sem catálogo |
| G3.3 | Jev `perguntar` → pergunta de necessidade vira decisão da IA | `inbound-turn.ts` | **[x]** | **PROMOVIDO**: `PERGUNTA_DE_NECESSIDADE` deletada; real: IA escreveu "…ou quer que eu te mostre algumas opções?" |
| G3.4 | Remoção da skill de catálogo pelo motor | `inbound-turn.ts` | **[x]** | **PROMOVIDO**: o motor deixou de filtrar skill; real: `skill removida`=0, sem regressão |
| G3.5 | Negociação prioriza sobre oferta → decide a Jev | `inbound-turn.ts:3483` | **[x]** | **PROMOVIDO**: block+flag+`decisoes-de-oferta.ts` removidos; ANTES `veredito_jev:true` × `pode:false` → DEPOIS `pode:true`, bot apresenta motos |
| G3.6 | Fluxo prioriza sobre oferta → decide a Jev | `inbound-turn.ts` | **[x]** | **PROMOVIDO**: bloqueio por fluxo removido; real: `fluxo_ativo=true` + Jev liberou → bot apresentou motos |
| G3.7 | Trava da pergunta do fluxo (motor reenvia) → decisão da Jev | `inbound-turn.ts` (~7290) | **[~]** | **ANTES/DURANTE ✓** (ponto `pergunta_do_fluxo__jev`, fail-safe `agora`); **DEPOIS não exercitado** (a trava quase não dispara — o modelo inclui a pergunta). **DECISÃO: manter** (barato, alinhado, fail-safe). |
| G3.8 | Trava de escolha/"moto em foco" → decisão da Jev | `catalogo-da-conversa.ts:607` | **[x]** | **JÁ FEITO**: a escolha já é da Jev (Árbitro/ponto `moto_escolhida`); determinístico só como fallback. `temEscolhaTravada` é consequência. |
| G3.9 | Bloqueio de fotos do catálogo por `media_urls` → decisão da Jev | `inbound-turn.ts:4409,4570` | **[—]** | **NÃO MOVER (decisão)**: é o **FORMATO do dono** (1 foto/moto com legenda), não uma decisão. Mover quebraria o formato. |

> Grupo 3 = **"faxina de decisões"**. O ganho aparece quando a Jev manda sozinha
> (o conjunto), não em 1 item. Cada item: teste → flag → deploy(OFF) → teste real(ON) → promover.

## GRUPO 1 — ENGRENAGEM (FICA — não é regra de negócio)
Rajada/coalesce · fila/job · **cancelar resposta se chegou msg nova** (`inbound_superada`) ·
entregar bolhas/mensagens · idempotência · não mandar vazio · opt-out/LGPD/anti-ban/janela ·
breaker anti-travamento · handoff + aviso ao controlador.

## GRUPO 2 — ENTREGA DE MOTOS (FICA — autorizado pelo dono)
Buscar no catálogo · montar apresentação · enviar fotos com legenda · ordenar/ranquear ·
detectar a moto escolhida.

## GRUPO 4 — CONTENÇÃO DE CONTEÚDO (ADIADO por decisão do dono)
Aviso de horário de atendimento · "vazou nota interna" · anti-mecânico · exigir se apresentar ·
contadores de veto. **Testar depois; tratar só se virar gargalo.**

---

## STATUS DAS FASES (de `2026-10-10-mapa-e-plano-turno.md`)
| Fase | O quê | Status |
|---|---|---|
| 1 | Camada 1 — oferta não insiste | **[x]** |
| 2 | "Um decisor só" (enxugar overrides) — G3.1–3.4, 3.6, 3.8 | **[x]** parcial (G3.5 [~], G3.9 [—]) |
| 3 | Turno de sistema + fim da duplicação | **[~]** fim da 2ª bolha + **junção** ✓; **turno de sistema separado NÃO feito** |
| 4 | Camada 0 — rajada como pacote rotulado | **[—]** testado (rajada simples E confusa); coalescência+modelo bastam → **não fazer** |
| 5 | Motor como servidor (meta-raiz) | **[~]** parcial |

## ITENS EXTRA (não estavam no plano — feitos a pedido)
- **Turno de junção** (`canal-com-buffer.ts` + `juncao-do-turno.ts`): >1 peça de texto → 2ª chamada unifica numa só. **ON** (`TURNO_JUNCAO=0` desliga).
- **Categoria do modelo citado** — degrau 1 (referência `modelos`) + **degrau 2** (Jev, `modelo_categoria__jev`).
- **Narração pela Jev** (`narracao__jev`) — regex desligada; abre caso ao admin.
- **Handoff ao concluir fluxo** — persona **v84**: fluxo concluído → **CONTINUA**; transferir só em 3 casos.
- Filtro de stopwords no "modelo citado"; `wipe` resetando `force_human`.

## DECISÕES TOMADAS (não reabrir sem motivo)
1. **Uma mensagem por turno** — a junção unifica; a 2ª bolha do `reescrita_avulso` fica morta (Camada 2-B).
2. **G3.7 mantido** — ponto da Jev no caminho raro da trava; fail-safe (`null` → motor).
3. **G3.8 já feito** — a escolha é da Jev; nada a fazer.
4. **G3.9 não mover** — é o formato do dono (fotos), não decisão.
5. **Latência** — `INBOUND_DEBOUNCE_MS=8000`, `CRM_DRAIN_IDLE_INTERVAL_MS=15000`, `CRM_DRAIN_INTERVAL_MS=2000`, `AGENT_MAX_STEPS=6` (padrão no código).
6. **Grupo 4 adiado** — só se virar gargalo.

## PRÓXIMO ITEM VIÁVEL
- **Menor e já 80% pronto:** **G3.5** (negociação×oferta) — já implementado atrás da flag
  `TURNO_G35_NEGOCIACAO_LLM`, testes 3/3; falta só **teste real conclusivo** (o cenário "achei caro"
  desviou para handoff). Baixo custo, fecha o Grupo 3.
- **Maior valor estrutural:** **Fase 4 (Camada 0 — rajada rotulada)** — ataca a **raiz** (decisão sobre
  mensagem isolada). Maior esforço, maior ganho.
- **Meio-termo:** **Fase 3 (turno de sistema separado)** — hoje a junção já entrega 1 bolha; o ganho
  adicional seria reduzir contexto/skills do turno que faz a pergunta do fluxo.


---

## LOG DE MUDANÇAS (mais recente no topo)
## LOG DE MUDANÇAS (mais recente no topo)
## LOG DE MUDANÇAS (mais recente no topo)
## LOG DE MUDANÇAS (mais recente no topo)
- **2026-10-13** — **TESTE E2E ADAPTATIVO — jornada de compra real (auxiliar 0101 → bot 2501)**: cliente
  **simulado por IA** (a próxima mensagem é gerada a partir da RESPOSTA do bot, não de roteiro fixo). Jornada
  em **10 turnos**: saudação → catálogo até R$ 15 mil → escolha (Factor) → agenda de visita → cidade/CNH →
  **fechamento** (visita amanhã 10h, com documentos + R$ 3.000 de entrada). **Resultado**: fluxo **Qualificação
  CONCLUÍDO**; `custom_fields` = `{cidade:"Campinas", cnh:"sim", nome:"Joao", moto_interesse:…, valor_de_entrada:"3000"}`;
  `contact_flow_data`: cidade=Campinas (`attempts 0`), cnh=sim. **Confirma o P1 corrigido em jornada real**
  (cidade perguntada e **gravada**). Obs.: o bot **re-oferece** o catálogo em turnos consecutivos e repete o
  "vou confirmar o horário com o responsável" — a investigar (não é duplicação intraturno). Harness é teste,
  não código de produto. **Nota:** a "duplicação" vista no roteiro RÍGIDO anterior era artefato do harness
  (o cliente ignorava a pergunta do fluxo) — não regressão de código.
- **2026-10-13** — **P1 — CAUSA-RAIZ do "Qualificação pergunta cidade repetidamente" ACHADA e CORRIGIDA
  (ANTES/DURANTE/DEPOIS ✓)**. A causa NÃO é o gatilho: `contact_flow_data` do contato de teste tinha
  **cidade `value NULL`, `attempts 3`** (e CNH idem) — o fluxo perguntava e **nunca gravava**. Raiz: em
  `validarRespostaDoFluxo` (`flow-validate.ts`), a Jev marca QUAIS campos foram respondidos, mas o valor de
  TEXTO/NÚMERO/DATA é escrito pelo extrator (chat). Havia um **`return` antecipado** que, quando a Jev já
  resolvia um campo DISCRETO no mesmo turno (ex.: CNH), devolvia **só o discreto** e **descartava o texto**
  marcado — "moro em São José dos Campos e tenho CNH" gravava a CNH e **perdia a cidade** (reperguntada até
  esgotar). **ANTES (probe real):** a Jev devolve `respondeu_cidade=0.98` e `valor_cnh=sim`; a função devolvia
  **apenas** `cnh`. **DURANTE:** `restantesParaChat` calculado ANTES do atalho; o chat só é pulado quando NÃO
  sobra campo; se o chat falhar, preserva os discretos já resolvidos pela Jev. 3 testes novos (misto preserva
  texto; falha do chat não perde o discreto; só-discreto não chama o chat). **Suíte 1081/1081**, typecheck ✓,
  lint 0. **DEPOIS (build `dcaf95ff` no ar):** probe no deployed → misto devolve `[cnh, cidade]`, "Sou de
  Campinas" → `cidade`; **end-to-end real** (webhook → worker, enrollment Qualificação + "moro em Campinas e
  tenho CNH") → **`contact_flow_data` gravou `cidade=Campinas`, `cnh=sim`, attempts 0**. **P1 resolvido na
  origem** (não era o gatilho).
- **2026-10-13** — **P2 item 1.3 — `flow_start` sem nome: Jev PRIMEIRO, regex só quando a IA não decide
  (ANTES/DURANTE ✓; DEPOIS pendente)**. **ANTES**: com o modelo chamando `flow_start` sem nome e >1 fluxo
  ativo, quem escolhia era **só o regex de gatilho** (`escolherFluxoPeloGatilho`, `inbound-turn.ts:4021`),
  **sem consultar a Jev**. **DURANTE**: novo helper puro `escolherFluxoIniciado` (`flow-intent.ts`) — usa a
  1ª escolha da IA (`escolherFluxosPorIA`: Jev → modelo de chat) que esteja ativa; cai no `porGatilho` (regex)
  **apenas** quando a decisão da IA é ausente/falhou/vazia. Wiring em `inbound-turn.ts` (flow_start, ramo
  `else`): consulta `escolherFluxosPorIA` e passa `(ativos, porIA, porGatilho)` ao helper. Testes 6/6
  (inclui caracterização do ANTES) em `flow-intent.test.ts`; **suíte `lib/agent-engine`+`lib/followup`
  1078/1078 verdes**, typecheck ✓, lint 0 erros. **DEPOIS (real, build `dcaf95ff` no ar)**: probe no worker
  com o código **deployed** + DB real + Jev real. Org tem **4 fluxos ativos** (Financiamento, Qualificação,
  Troca, Venda/Consignação) e binding **`flow_intent__jev` habilitado** (typesafe/jev-latest) → a Jev é
  consultada de fato. Msg *"quero dar minha moto na troca e financiar o resto"*: **ANTES** (regex sozinho) →
  `Troca`; **DEPOIS** (Jev) → `["Troca","Financiamento"]`, escolhido `Troca` (o regex nem é consultado — a IA
  decide). Msg *"vocês aceitam troca?"*: ANTES regex `null` e DEPOIS Jev `[]` (sem mudança). App/worker/
  scheduler `healthy`. Decisão do dono (2026-10-13): Jev primeiro; regex só quando ela não decidir.
  **Obs.**: a prova exercita a função de decisão no build deployed; o turno completo por WhatsApp depende de
  o modelo chamar `flow_start` sem nome (caminho raro).
- **2026-10-13** — **P2 — INVENTÁRIO regex×Jev ENTREGUE (sem código)**: novo doc
  `docs/propostas/INVENTARIO-regex-vs-jev.md` cataloga, por `arquivo:linha`, os pontos que ainda decidem por
  regex/palavra-chave, classificados em **[A] autoridade** (vence a Jev — violação), **[F] fallback** (Jev primeiro)
  e **[I] infra/formato** (não migrar). Achado central da ENTRADA DE FLUXO: ela **já tem** caminho Jev/IA
  (`flow-intent.ts:150`; em `inbound-turn.ts:2585` a ordem é Jev → modelo → regex `melhorFluxoPorGatilho`
  `atendimento.ts:286`/`fluxosPorGatilho:313` como 3º recurso). O único uso **direto** do regex de fluxo é a
  desambiguação do `flow_start` sem nome (`inbound-turn.ts:4021`) — **candidato nº1** de migração. Rede de
  proteção da oferta (`pedidoDeCatalogoInequívoco`/`pedidoExplicitoDeMaisOpcoes`) segue como **[A]** consciente
  (decisão do dono). **Decisões em aberto** no fim do doc; **nada implementado**. (Obs. P1: como o `flow_intent`
  já manda catálogo→`[]`, a causa de "Qualificação pede cidade" pode **não** ser o gatilho — confirmar.)
- **2026-10-13** — **G3.11 (faixa de preço aciona a oferta) + falso-positivo da moto do cliente — FEITO e
  VALIDADO**: (1) uma **faixa/orçamento** sozinha ("ate 15 mil", "no maximo 20 mil", "uns 12 mil") agora
  **força a oferta** (`RE_FAIXA_DE_PRECO` em `pedidoDeCatalogoInequivoco`) — antes o bot respondia
  *"deixei registrado pro responsável"* e **perguntava o valor de novo** (conversa real, turno C3).
  (2) Excluído o **falso-positivo**: *"minha moto é uma CG 150 2012"* (o cliente descrevendo a moto DELE
  na troca) casava "CG 150" e **disparava motos** — agora `RE_MOTO_DO_CLIENTE` barra. Validado ao vivo:
  F2 "ate 15 mil" → `cliente_citou_faixa`, `pode:true`, 7 bolhas; F4 "minha moto é uma CG 150" →
  `pode:false`, 1 bolha. 1103 testes, typecheck ✓, lint 0.
- **2026-10-13** — **Correção de DADO no catálogo (via SQL)**: `motos.id=37` (YAMAHA Factor 125 K 2015)
  tinha `preco = 950000.00` (absurdo) → corrigido para **9500.00**. Conferido: 27 motos, mín 9500,
  média 26110, máx 95000, **0 outliers**.
- **2026-10-13** — **FECHO DO TURNO DE CATÁLOGO + fim da fusão com fotos — FEITO e VALIDADO**: em turno
  que MOSTRA motos, a pergunta do turno é a de **VENDA** (escolha), não a do fluxo. Rede determinística
  em `fecho-do-turno.ts` (`ajustarFechoDoTurnoDeCatalogo`): remove a **cauda interrogativa** (a pergunta
  do fluxo, mesmo **parafraseada** pelo modelo — o modelo não copia exato) e garante a pergunta de
  ESCOLHA. Aplicada no **ponto FINAL** (após a junção) — antes, a junção reescrevia por cima. E a
  **junção NÃO funde quando há MÍDIA**: fundir jogava a pergunta para ANTES das fotos e engolia as fotos
  (medido ao vivo). Formato agora: **intro → fotos → pergunta de venda**. Espelha o brief e o bloco cru
  (`mostrouMotos`). 1065/1065 testes, typecheck ✓, lint 0.
  - **ANTES**: T1/T2 terminavam em *"De qual cidade você fala?"* (pergunta do fluxo) e, quando juntava,
    a pergunta vinha antes das fotos / sumiam fotos. **DEPOIS**: *"Qual delas te interessou mais?"* DEPOIS
    das imagens.
- **2026-10-12** — **G3.10 (Rede de proteção da oferta) — FEITO e VALIDADO**: quando o cliente faz
  um **pedido inequívoco de catálogo**, a régua determinística **VENCE a Jev** (mesmo padrão de
  `pedidoExplicitoDeMaisOpcoes`). Novo `pedidoDeCatalogoInequivoco` (`pode-oferecer-motos.ts`) +
  `TERMO_DE_MOTO` estendido (lander, himalayan, tornado, bros, pcx…) + `RE_OUTRA_MOTO`.
  - **ANTES** (real): "e uma lander?" → Jev `jev_negou` + régua `sem_pedido_do_cliente` (`pode:false`)
    → bot prometeu "separei opções de trilha" e **não mostrou nenhuma**.
  - **DEPOIS** (real): `motivo: cliente_citou_modelo`, **`pode: true`** → mostrou **XTZ Crosser S,
    Royal Enfield Himalayan, CB 500 X, BMW R 1200 GS, XTZ Crosser**.
  - **Guardrails**: NÃO força em validação de moto já em foco ("essa presta?"), processo
    (financiar/trocar), dado/flow, nem citar só a moto em foco.
  - **Parte 2 (prometeu e não mostrou)**: `brief-do-turno.ts` ganhou `podeOferecer`; quando a régua
    NEGA, o brief instrui o modelo a **não anunciar opções**. 1058/1058 testes, typecheck ✓, lint 0.
  - **Nota**: `fluxoBloqueiaOferta` (`pode-oferecer-motos.ts:51`) é **código morto** (o G3.6 removeu o
    uso) — não é a causa da negação.
- **2026-10-11** — **Fase 4 (Camada 0) — NÃO NECESSÁRIA (verificado)**: teste de **rajada confusa**
  (mostro motos → "gostei da naked|quanto fica de entrada?|voces aceitam minha moto na troca?") foi
  tratada **bem**: o bot reconheceu a ESCOLHA ("naked" → FZ 15), respondeu entrada+troca **juntas** e fez
  a pergunta de seguimento — **1 bolha**, sem handoff. A Coalescência (debounce) + o modelo já cobrem
  rajada simples E confusa; a etiquetagem por item não paga o custo. **Item encerrado (não fazer).**
  (Obs.: o teste exigiu o bot de volta — a sessão **datafy** do +5512981672501 estava FAILED e foi renovada.)
- **2026-10-11** — **Fase 4 (Camada 0 — rajada) — ANTES feito**: rajada real de 3 msgs
  ("bom dia" | "queria ver uma moto" | "ate 15 mil", gap 2s) via `/tmp/opencode/burst.js`. Resultado:
  as 3 foram **coalescidas** (o bot usou "até 15 mil", da 3ª — a junção da rajada funciona), `msgs_IA=1`,
  sem handoff; **mas** `latencia_1a_resposta=170s` (muito alta) e **sem etiquetagem por item** (o modelo
  recebe o texto concatenado, não o pacote rotulado). DEPOIS esperado: rajada como **pacote numerado**
  etiquetado (pergunta/resposta-a-fluxo/escolha/dado) + Jev devolve `resolvido`/`pendente` por item.
- **2026-10-11** — **G3.5 (negociação × oferta) — PROMOVIDO e VALIDADO**: removida a prioridade da
  negociação sobre a oferta (deletados `negociacaoBloqueiaOfertaAgora`, `decisoes-de-oferta.ts` + teste;
  flag `TURNO_G35_NEGOCIACAO_LLM` aposentada). **ANTES** (real): "tem outras opcoes mais baratas?" com a
  Jev dizendo `veredito_jev: true` mas o motor `pode: false` (`negociacao_persuadir_2`). **DEPOIS** (real):
  `motivo: jev_liberou_preco`, `pode: true`, `msgs_IA: 6` → o bot apresentou motos. **A Jev vence o motor.**
  1047/1047 testes, typecheck ✓, lint 0. **Grupo 3 fechado.**
- **2026-10-11** — **G3.5 (negociação × oferta) — ANTES feito**: cenário real "quero ver motos ate 20 mil" →
  "achei caro" → "tem outras opcoes mais baratas?". No **turno 3** o motor logou
  `motivo: negociacao_persuadir_2, pode: false` (bloqueou a oferta) **apesar de** `maisOpcoes:true,
  pediuDiferente:true` — e a **Jev havia dito `veredito_jev: true`** (oferecer). Ou seja: **o motor
  sobrescreve a Jev**. DEPOIS esperado: a Jev vence (`pode: true`).
- **2026-10-11** — **G3.8 — JÁ FEITO (verificado)**: a decisão de escolha/"moto em foco" já é da Jev.
  `motoEscolhidaPeloClienteComJev` (`catalogo-da-conversa.ts:607`) chama o **Árbitro de turno**
  (ponto `moto_escolhida`) ou a Jev direto; o determinístico (`motoEscolhidaPeloCliente`) é **fallback
  só quando a Jev está indisponível** (e nunca por cima de um "nenhuma" — doutrina `jev-decide-sempre`).
  `temEscolhaTravada` (`pode-oferecer-motos.ts:203`) é só CONSEQUÊNCIA dessa decisão. Nada a fazer.
- **2026-10-11** — **G3.7 (trava da pergunta → Jev) — ANTES/DURANTE feitos; DEPOIS inconclusivo**:
  - **ANTES**: decisão atual extraída p/ `lib/followup/trava-da-pergunta.ts` (`motorReenviaPerguntaDoFluxo`),
    caracterizada em teste (7/7). Evidência real: J1–J4 com `pecas_texto: 2` (modelo + pergunta do motor).
  - **DURANTE**: ponto `pergunta_do_fluxo` da Jev (`agora`/`esperar`, fail-safe `agora`) + wrapper
    `pergunta-do-fluxo-jev.ts` + integração na trava; binding `pergunta_do_fluxo__jev`; 1050/1050 testes,
    typecheck ✓, lint 0. Deploy.
  - **DEPOIS (não exercitado)**: nos cenários G7a/G7b o **modelo incluiu a pergunta do fluxo** em todos os
    turnos (`msgs_IA=1`), então a trava **não disparou** e a Jev não foi chamada. A trava é fallback raro;
    para provar o DEPOIS é preciso **forçar a omissão** (ex.: prompt/stub). **Pendente de prova real.**
- **2026-10-11** — **TURNO DE JUNÇÃO — FEITO (ON por padrão, `TURNO_JUNCAO=0` desliga)**: o canal
  agora **GUARDA** os envios do turno (`canal-com-buffer.ts`) e, no **fim**, se houver >1 **peça de
  texto** (resposta + pergunta do fluxo que a trava reenviaria, ou texto do motor), uma **2ª chamada**
  (`juncao-do-turno.ts`, sem skills/Jev) **unifica tudo numa só** mensagem → **1 bolha**. Mídia/fotos
  ficam no lugar. Sem o que juntar, a fila sai como veio (custo zero). Validado ao vivo: `pecas_texto: 2`
  → `bolhas_finais: 6` (antes 7). **Ajuste do prompt**: PRESERVA o conteúdo (saudação, nomes, preços) e
  só remove as perguntas extras (mantém a pendente do roteiro) — antes ele resumia e perdia a saudação.
  Texto final: *"Bom dia! Sou a Marcela… Sobre a Titan 160… De qual cidade você fala?"*. 489/489 testes,
  typecheck ✓, lint 0.
- **2026-10-11** — **Degrau 2 (Jev decide a categoria) — FEITO**: quando a referência `modelos`
  não tem o modelo, a Jev responde a categoria do modelo citado por **escolha fechada** sobre as
  categorias reais do estoque (`lib/ai/jev/pontos/modelo-categoria.ts` + wrapper
  `modelo-categoria-jev.ts`, binding `modelo_categoria__jev`). **Filtro de stopwords** no
  `termosCitados` (normaliza acento: "vocês"→"voces") para não chamar a Jev à toa. Validado:
  termos=["titan"]→Street (degrau 1); degrau 2 dispara quando a referência não casa.
- **2026-10-11** — **Handoff ao terminar fluxo — CORRIGIDO**: o bot escalava ao concluir o
  financiamento (o modelo chamava `request_human_handoff` com razão "depende do setor"). Regra nova
  na **persona v84**: fluxo concluído → **CONTINUA**; transferir só em 3 casos (cliente pede pessoa /
  não há resposta-base-catálogo-ferramenta / fere regra). Teste real: P2a–P2f **0 handoff**.
  **Wipe corrigido** também para resetar `contacts.force_human` (senão o teste seguinte ficava mudo).
- **2026-10-11** — **Categoria do modelo citado — VALIDADO**: "Você tem alguma Lander?" agora traz
  **trilha de verdade** (XTZ Crosser, Crosser S, Himalayan, CB 500 X, R 1200 GS) — antes trazia
  street. Correções: filtro `categoria nao_nulo` na referência (senão "Outlander" sem categoria
  enchia o limite) + casamento de categoria por **token+sinônimo** (`trail≡trilha`, `adventure→trail`;
  o catálogo é inconsistente: "Adventure / Trilha" × "Trail, On-Off Road"). Deploy `dcaf95ff`.
  **Degrau 2 (Jev quando a referência não tem) ainda pendente.**
- **2026-10-11** — **Categoria do modelo citado (degrau 1)**: quando o cliente cita um modelo
  que NÃO está no estoque (ex.: "Lander"), o motor consulta a **referência `modelos`** (mesmo
  schema do catálogo) e usa a **categoria** como critério → parecidas de verdade (trail). Só em
  **turno de catálogo**. Novo: `categoria-da-referencia.ts` + integração em `inbound-turn.ts`.
  (De graus: 1=referência; 2=Jev; 3=filtro.) Deploy.
- **2026-10-11** — **FURO do catálogo — VALIDADO**: "você tem alguma Fazer?" agora mostra **só as
  2 Fazer** (FZ 15 + YS Fazer 250); XMax 250 / CBX 250 Twister **sumiram**. Deploy `dcaf95ff`.
  Obs.: o "quer ver mais?" ainda aparece (temMaisOpcoes = qualquer candidato a mais) — anotado.
- **2026-10-11** — **FURO do catálogo (contato ...2169)**: ao pedir "Fazer", a Jev acertava (hipóteses
  = só as 2 Fazer), mas a **seleção do motor** acrescentava XMax 250 / CBX 250 Twister. Causa:
  `compartilhaLinhaDoModelo` (`selecao-por-intencao.ts:148`) comparava **qualquer token** — e a
  **cilindrada ("250")** é token → "YS Fazer **250**" casava com QUALQUER "**250**". Corrigido:
  tokens puramente numéricos são ignorados (a linha é o NOME do modelo). (código — deploy).
- **2026-10-11** — **VALIDADO (real)**: escolha da moto gravada → **para de convidar** "quer ver
  mais" (K2); quando o cliente **pede**, mostra parecidas (K3). Deploy `dcaf95ff`.
  **Novo achado:** em "quais modelos você tem" o bot **lista as 24 motos** numa mensagem gigante
  (+ 5 fotos) e ainda convida "mais" → **excesso de catálogo** (a tratar).
- **2026-10-11** — **"Quer ver mais opções?" respeita a moto de interesse**: a flag
  `temMaisOpcoesNesteTurno` (convite) agora é `selecao.temMaisOpcoes && escolhida === null`.
  Antes o convite aparecia mesmo com a escolha travada (o `podeOferecerMotos` já barrava a
  oferta, mas o convite não). Com escolha gravada, só convida se o cliente PEDIR (fila).
  (código — deploy).
- **2026-10-11** — **VALIDADO (real)**: fluxo pede **1 pergunta por vez** (CPF → nascimento);
  moto do estoque **não é descredibilizada** ("uma das mais procuradas, super confiável, bem cuidada";
  km como fato neutro). Deploy `dcaf95ff`.
- **2026-10-11** — **2 regras/ajustes do dono**:
  1. **Fluxo: uma pergunta por vez** — reforçado o bloco do fluxo (`atendimento.ts`): os campos
     pendentes são só para REGISTRAR; "faça SOMENTE a pergunta da vez". (código — deploy).
  2. **Não descredibilizar moto do estoque** — regra adicionada à **persona** (banco): nova versão
     publicada **v83** (`fn_publish_ai_agent_version`). Não dizer "rodada/muito usada/antiga";
     km/ano como fato neutro.
- **2026-10-11** — **Tempos de espera REVERTIDOS** (decisão do dono): `INBOUND_DEBOUNCE_MS` 4s→**8s**,
  `CRM_DRAIN_IDLE_INTERVAL_MS` 5s→**15s**, `CRM_DRAIN_INTERVAL_MS` 1,5s→**2s**. Mantido
  `AGENT_MAX_STEPS=6` (evita o travamento de 143s). **Papelada verificada**: `checkpoint`/`operator_turn`
  já rodam DEPOIS da resposta (`inbound-turn.ts:7267` "o lead já recebeu resposta") — nada a mover.
- **2026-10-11** — **Camada 2-B PROMOVIDA**: junção do avulso **removida** (bloco + imports +
  arquivos `reescrever-complementar.ts`, `avulso-do-turno.ts`, `juncao-do-turno.ts` e testes).
  Smoke (memória limpa): **1 bolha/turno** em todos os 4 turnos; 410/410 testes, typecheck ✓, lint 0.
- **2026-10-11** — **"20 mil" investigado**: era **memória antiga do lead** (`lead_notes`/`custom_fields`
  de teste anterior), não alucinação. **Wipe corrigido** para limpar `lead_notes` + `custom_fields`.
- **2026-10-11** — **Camada 2-B (1 mensagem por turno) VALIDADA**: `podeJuntarAvulso` +
  flag `TURNO_UMA_MENSAGEM` desliga a junção quando o modelo já enviou. Cenário 2-fluxos:
  **msgs_IA=1 em todos os turnos** (antes 2), conteúdo completo (resposta + pergunta do fluxo
  juntas). Teste 3/3, typecheck ✓, lint 0 erros. **Falta promover.**
- **2026-10-11** — **Narração — 2º ajuste (vazamento real)**: teste achou "Respondido ao Vander:"
  vazando pelo caminho "turno sem envio" (fora do `send_message`). Corrigido: check da Jev movido
  para o **ponto único** `enviarTextoDoMotor`; **prompt da Jev melhorado** (cabeçalhos "Respondido ao
  <nome>:" = narração). **Probe no build implantado**: `Respondido ao Vander:` → **true**; legítimas → false.
- **2026-10-11** — **Narração PROMOVIDA (regex → Jev)** + **abre CASO ao admin** quando a Jev
  detecta narração. Regex `internal_vocabulary` desligada (`enforceInternalVocabulary:false`),
  Jev decide sempre. Deploy + smoke (2 fluxos, 5 turnos): **0 handoff**, 0 vazamento, 0 "sem
  resposta"; Jev decidiu 4× `ehNarracao:false`. Binding `narracao__jev` no banco.
- **2026-10-11** — **Narração: regex → Jev (VALIDADO)**: novo ponto `narracao` da Jev +
  `narracao-jev.ts`; quando `TURNO_JEV_NARRACAO=1`, a regex `internal_vocabulary` sai e a Jev
  decide (narração→reescreve; senão passa). Cenário D (2 fluxos) **antes×depois**: `handoff` 1→**0**,
  `internal_vocabulary_leak` 1→**0**, conversa **não quebra mais**. Binding `narracao__jev` criado.
  **Falta promover (default).**
- **2026-10-10** — **G3.4 PROMOVIDO em produção** (`dcaf95ff`) + smoke test: 0 loop/abort/handoff,
  0 `skill removida`, latências 28–53s. **Faxina de overrides encerrada (G3.1–G3.4, G3.6).**
- **2026-10-10** — **G3.4 PROMOVIDO**: o motor deixou de remover a skill de catálogo
  (validado com flag; sem regressão). Removidos: `motorRemoveSkillDeCatalogo` + teste,
  o bloco de filtro e a flag. `skillMatch` virou `const`. Verde. **Falta deploy.**
- **2026-10-10** — **Latência PROMOVIDA a padrão no código** (`env.ts`): `INBOUND_DEBOUNCE_MS=4000`,
  `CRM_DRAIN_IDLE_INTERVAL_MS=5000`, `CRM_DRAIN_INTERVAL_MS=1500`, `AGENT_MAX_STEPS=6` (teste
  `env.test.ts` atualizado). Deploy + **smoke test**: **"Ola" 48→30,7s**, **"Quais modelos"
  143→35,7s**; **0** loop/timeout/abort/handoff; `agent_turn` máx 66s. Verde 423/423.
- **2026-10-10** — **Latência (config)**: `INBOUND_DEBOUNCE_MS=4000`, `CRM_DRAIN_IDLE_INTERVAL_MS=5000`,
  `AGENT_MAX_STEPS=6` → turno pesado **143s→33s** (sem abort). "Ola" ~46s (residual ~28s é
  **upstream**: entrega WAHA/datafy→ingest, não o worker). Aplicado via override do worker; **falta tornar permanente**.
- **2026-10-10** — **Camada 2 VALIDADA em cenário real**: `2ª bolha evitada` = 4,
  `avulso reescrito` = 0 → **a mensagem duplicada sumiu** (turnos 1 e 3 com 1 bolha).
  Os "6/7" são a apresentação legítima do catálogo. Obs.: turno 4 teve **aborto do
  provedor** (90s + retry, 144s) — problema de latência, separado. Flag
  `TURNO_AVULSO_SEM_DUPLICAR` pronta; **falta decidir promover**.
- **2026-10-10** — **Camada 2 (fim da 2ª bolha) implementada atrás da flag**
  `TURNO_AVULSO_SEM_DUPLICAR`: quando o texto avulso já está contido no que foi enviado,
  o motor NÃO reescreve/reenvia a 2ª bolha. Helper `avulso-do-turno.ts` (teste 4/4),
  wiring em `inbound-turn.ts`. Verde: 414/414, typecheck ✓, lint 0 erros. **Falta deploy + teste real.**
- **2026-10-10** — **Deploy das promoções** (`dcaf95ff`) + **smoke test real** (roteiro de 4
  turnos): latências 38–51s, **0** `same_tool_failure`, **0** timeout/abort, **0** handoff.
  Promovidos em produção: G3.1, G3.2, G3.3, G3.6. G3.5 atrás de flag.
- **2026-10-10** — **G3.3 e G3.6 PROMOVIDOS**. Removidos: `PERGUNTA_DE_NECESSIDADE`,
  `motorUsaTextoDeNecessidade`, `fluxoBloqueiaOfertaAgora`, o bloqueio por fluxo e o
  import `fluxoBloqueiaOferta`; apagado `decisoes-de-texto.ts` + teste. Ajustado o teste
  de `captura-do-fluxo`. Verde: 443/443, typecheck ✓, lint 0 erros. **Falta deploy.**
- **2026-10-10** — **G3.2 PROMOVIDO** (constante `PERGUNTA_DE_ORCAMENTO` deletada; IA sempre escreve).
  **G3.3/G3.5/G3.6 implementados atrás de flags** (`TURNO_G33_NECESSIDADE_LLM`,
  `TURNO_G35_NEGOCIACAO_LLM`, `TURNO_G36_FLUXO_LLM`; default OFF). Testes: 9/9 novos,
  suíte engine **416/416**, `typecheck` ✓, `lint` 0 erros. **Falta: deploy + teste real de cada flag.**
- **2026-10-10** — G3.2 **validado em cenário real** (flag `TURNO_C107_TEXTO_LLM=1`): o bot
  escreveu a própria pergunta de orçamento ("Qual valor máximo você tem em mente?"), não o
  texto fixo, e não ofereceu catálogo. Sem loop/timeout. **Pendente: promover (default ON) ou manter flag.**
- **2026-10-10** — G3.2 implementado (flag `TURNO_C107_TEXTO_LLM`, default OFF). Teste
  `decisoes-de-texto.test.ts` vermelho→verde (3/3). `typecheck` ✓, `lint` 0 erros,
  suíte engine 410/410. **Falta:** deploy + teste real.
- **2026-10-10** — G3.1 concluído e medido em produção (`dcaf95ff`): `same_tool_failure` 0,
  timeout 0, `agent_turn` 12,7/18,3/21,3/36,9s, 1ª resp 41–53s.
- **2026-10-10** — Documento de mapa (`2026-10-10-mapa-e-plano-turno.md`) e protocolo
  (`2026-10-10-fase2-protocolo-e-backlog.md`) criados.
