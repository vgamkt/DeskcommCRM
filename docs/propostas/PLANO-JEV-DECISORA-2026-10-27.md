# PLANO — A JEV como decisora única: contexto de conversa (20+ com "respondida") e formato executável

> **Status:** proposta. NADA implementado ainda.
> **Data:** 2026-10-27
> **Objetivo do dono:** a JEV decide SEMPRE; o motor executa; o modelo só redige.
> **Decisões do dono (2026-10-27):** janela **30 mensagens**; **JEV decide**; seleção por **IDs**; `respondida` como proposto; rollout **flag+A/B**; item 6 (tirar o catálogo do modelo) **testar no spike**.
> Antes de implantar: **testar a JEV num modo que funcione** — ela responde exatamente
> a pergunta (a decisão) num **formato que o motor consiga dar prosseguimento**.


## 0. Status de execução (2026-10-27)

- **F0 — VALIDADO (formato).** Probe real (`typesafe/jev-1.14.0`) sobre conversas
  reais de 30 msgs: a JEV respondeu `choice`/`noul` de forma parseável e o motor
  extraiu ação + **IDs** + notas por moto (ex.: CB 500 X 0.82, Himalayan 0.73).
  Achado: `respondida` correto é **"existe outbound depois"** (a última mensagem
  já pode estar respondida, ex. handoff) — corrigido no builder.
  Arquivo: `scripts/qa/jev-formato-probe.test.ts` (roda com `JEV_PROBE=1`, fora da suíte).
- **F1 — FEITO/VALIDADO.** `lib/agent-engine/agent/contexto-da-conversa.ts` +
  `contexto-da-conversa.test.ts` (5 testes): 30 msgs, `respondida`, rajada, estado, catálogo.
- **F2 — FEITO/VALIDADO.** `lib/ai/jev/pontos/plano-de-turno.ts` +
  `plano-de-turno.test.ts` (6 testes): perguntas do plano (ação/critério/escolhida/
  fecho/handoff + nota por moto) e o **mapper** `PlanoDoTurno` (IDs).
- **F3 (PEÇA) — FEITO/VALIDADO.** `lib/agent-engine/agent/plano-de-turno.ts` +
  `plano-de-turno.test.ts` (2 testes) + probe real `scripts/qa/plano-de-turno-probe.test.ts`:
  carrega 30 msgs + estado + catálogo, chama a JEV (`plano_de_turno__jev`), devolve o
  `PlanoDoTurno` (ação/handoff/IDs). Binding `plano_de_turno__jev` criado (typesafe/jev-latest).
  Observado: 1 conversa devolveu plano; outra `null` (chamada transiente — o `null` cai no
  caminho de hoje, sem quebrar).
- **F3 (ligar no turno) — FEITO atrás da flag, MAS INATIVO no QA.** Código no
  `inbound-turn`: antes do modelo, `decidirPlanoDoTurno` (30 msgs/estado/estoque);
  a seleção e o álbum usam os **IDs**; `acao=perguntar/nenhuma` = sem fotos; `null`
  = caminho atual. Flag **por agente** `catalog.plano_jev` (QA `true`, produção `null`).
  **Problema medido (2026-10-27):** no turno o plano voltou `null` — a chamada do plano
  é a **segunda** da JEV (depois do trio `objecao/negociacao/offer`) e cai no
  rate-limit/breaker; o turno seguiu no caminho atual (sem quebrar).
  **CONSERTADO (2026-10-27):** o plano agora entra na **MESMA** chamada do árbitro
  (`pedido` `plano_de_turno`), orçamento/câmbio movidos para antes do trio, 30 msgs +
  estoque carregados; o `PlanoDoTurno` sai do `porPonto.plano_de_turno`.
  **ESTADO REAL (2026-10-27, pesado 38 no QA):** o pesado passou 38/38, mas o log
  `plano do turno (JEV)` veio **`acao:null`** — o `decidirPlanoDoTurno` devolveu
  **null**: a JEV com o **estoque inteiro (25) + 30 msgs** no request demora ~37s e
  volta vazia (o motor retenta e esgota). O turno seguiu no **caminho atual** (o que o
  pesado validou). **Próximo passo:** limitar o catálogo do plano ao **pool de
  candidatas** (orçamento/câmbio/categoria/uso) ou logar o motivo do `null` e ajustar
  o request; sem isso o plano não liga. Produção segue com a flag desligada.
- **F4–F6 — PENDENTE:** modelo só redigindo; item 6 (catálogo no modelo); replay 8 casos +
  pesado 38; rollout flag+A/B.

---

## 1. Problema (levantamento de hoje)

### O que a JEV recebe hoje
| Ponto | Arquivo | Recebe | NÃO recebe |
|---|---|---|---|
| `objecao` | `lib/ai/jev/pontos/objecao.ts` | só a **rajada** do turno (`mensagem`) + motivo anterior + tem moto em foco | histórico, orçamento, catálogo |
| `negociacao` | `…/negociacao.ts` | só a rajada + tentativas + aguardando/desconto | histórico, estado completo |
| `offer_motos` | `…/oferta.ts` | só a rajada + flags (escolha, foco, fila, objeção) | as 20 mensagens, orçamento, motos já mostradas |
| `moto_escolhida` | `…/moto-escolhida.ts` | mensagem + catálogo do turno | histórico, orçamento, estado |
| `catalog_criteria` | `…/catalog-criteria.ts` | mensagem + colunas/valores + catálogo | histórico, orçamento, fila |
| `flow_validate` | `…/flow-validate.ts` | **até 20 mensagens** (`effectiveContext.messages.slice(-20)`) | — |

- A "mensagem" é `inboundsNaoRespondidos` (para no último outbound) — `inbound-turn.ts:3254`.
- Os 3 pontos do árbitro (`objecao`/`negociacao`/`offer_motos`) recebem **apenas** `mensagem` + flags: `inbound-turn.ts:3865-3915`.
- **Ninguém** recebe a marcação **`respondida`**. `inboundsNaoRespondidos` infere "pendente" só pela rajada (`inbound-turn.ts:2130`).
- O **orçamento** não entra nos contextos da JEV (fica no motor). A **lista de motos mostradas/fila** também não (só flag `temOpcoesPendentes`).
- A janela do contexto apareceu com **3** mensagens nos testes (config `history_message_window:10`, `context_message_window:20`).

### Por que isso gera os erros (casos dos testes)
| Caso | Sintoma | Causa |
|---|---|---|
| T02 "cidade, trabalho, 25 km" | perguntou a faixa em vez de mostrar 5 | `offer_motos` não vê a conversa/uso; decide "vago" |
| T08/T27 objeção de km | não trouxe as menos rodadas | `objecao`/critério não têm estado/km/fila |
| T29 "achei caro, mais em conta" (trilha) | mostrou street/scooter | o **motor** refaz a seleção/filtra; a JEV não decide a lista |
| T32 "moto pra estrada" | só 2 opções | o motor não completa; a JEV não devolve a lista |
| T35 orçamento 30 mil (CB 500 X) | texto da CB 500 X, fotos de outras | o **modelo** escreve antes da seleção; o motor troca depois |
| T11 "prefiro a NMax" (15 mil) | texto 2023, fotos 2019 | modelo escreve antes; motor troca a unidade depois |
| T25 "Lander 250?" | não disse "não tenho" | modelo inventa a introdução |

**Diagnóstico:** o erro não é a JEV decidir mal — é a JEV **não receber contexto** e o
**modelo/motor decidirem por cima** (modelo consulta catálogo e escolhe; motor aplica
filtros/fills por regex e altera a seleção depois do texto).

---

## 2. Princípios (não negociáveis)

1. **JEV decide** — oferta, seleção (quais motos/ids), critérios, objeção, negociação,
   escolha, fecho (tipo), handoff.
2. **Motor executa** — busca por id, renderiza fatos/legendas, envia. **Não decide.**
3. **Modelo redige** — só o texto sobre a lista que a JEV mandou. **Não consulta catálogo,
   não escolhe moto.**
4. **Fallback** — só quando a JEV está desligada/indisponível (`null`), como hoje
   (`docs/doctrine/jev-decide-sempre.md`).

---

## 3. Arquitetura alvo

```
inbound
  └─ monta ContextoDaConversa (últimas 20+ com respondida + estado + catálogo)
       └─ JEV (arbitro/plano de turno) → PlanoDoTurno (JSON estrito)
            └─ motor EXECUTA: busca por id, renderiza, envia
                 └─ modelo REDIGE sobre a lista do plano (sem catálogo/sem escolher)
```

Hoje: `inbound → modelo (consulta catálogo, escolhe, escreve) → motor (filtra/seleciona/altera)`.

---

## 4. Contexto único — `ContextoDaConversa`

Um único objeto, montado uma vez por turno, passado a **todos** os pontos da JEV.

```ts
type MensagemDoContexto = {
  de: 'cliente' | 'loja';
  texto: string;
  hora?: string;          // opcional (fuso do tenant)
  respondida: boolean;    // true = já houve resposta da loja depois dela
};

type EstadoDaConversa = {
  orcamento: number | null;            // FIXO (sem +30%)
  escolhida: { id: string; nome: string } | null;
  referencia: { id: string; nome: string } | null;
  motosMostradas: string[];            // nomes já enviados
  fila: string[];                      // pendentes do "ver mais"
  objecao: { motivo: 'preco'|'km'|'ano'|'outro'; tentativas: number } | null;
  formaDePagamentoPerguntada: boolean;
  usoCategoria: string | null;         // cidade/trilha/estrada…
  cambioPedido: 'automatico' | 'manual' | null;
};

type ContextoDaConversa = {
  mensagens: MensagemDoContexto[];     // >= 30, cronológico
  rajada: string[];                    // inbounds ainda não respondidos
  estado: EstadoDaConversa;
  catalogo?: MotoDoCatalogo[];         // só para pontos que decidem seleção/critério
};
```

**Regra do `respondida`:**
- Percorre as mensagens em ordem; tudo que veio **antes do último inbound** é
  `respondida: true` (a loja já respondeu).
- A **rajada** (inbounds depois do último outbound) é `respondida: false`.
- Objetivo: a JEV vê que é uma **conversa** e que **só a última/rajada** pede resposta —
  não trata mensagens antigas como pedidos novos.

**Janela:** **30 mensagens** (decisão do dono; mínimo 30). Corrigir a janela efetiva
(hoje chega com 3).

---

## 5. Formato de saída — `PlanoDoTurno`

A JEV devolve **um JSON estrito** que o motor executa sem interpretar. Sem texto ao
cliente aqui (o texto é do modelo, depois).

```ts
type PlanoDoTurno = {
  acao: 'oferecer' | 'perguntar' | 'persuadir' | 'mostrar_opcoes' | 'encaminhar' | 'nenhuma';
  selecao: {
    motos: string[];          // IDs do catálogo (fonte da verdade)
    criterio: 'preco'|'km'|'ano'|'categoria'|'cambio'|'nenhum';
    limite: number;           // quantas
  } | null;
  objecao: { eh: boolean; motivo: 'preco'|'km'|'ano'|'outro'|null } | null;
  negociacao: { fase: 'persuadir_1'|'persuadir_2'|'persuadir_3'|'mostrar'|'encaminhar' } | null;
  escolhida: string | null;   // ID
  fecho: 'escolha' | 'saber_mais' | 'outra_opcao' | 'nenhum';
  handoff: { sim: boolean; motivo: string | null };
  motivo: string;             // log (nunca ao cliente)
};
```

Regras:
- `selecao.motos` são **IDs**; o motor busca no estoque por id e envia **exatamente** esses.
- Se `acao = 'perguntar'`, `selecao = null` (o motor não mostra motos).
- `escolhida` é o **ID** da unidade (resolve ano/versão — o motor não troca depois).
- O motor **não** aplica filtro/fill/ordem por cima: só executa o plano.
- O modelo recebe `selecao` + fatos e redige; **não** pode adicionar moto.

---

## 6. Spike — DESCOBRIR o formato de resposta da JEV (exploratório)

> ⚠️ **Não é alimentação fixa/cravada e não é um "teste de fixture".** O objetivo é
> **descobrir empiricamente a FORMA** em que a JEV deve responder para o motor
> conseguir executar. O `ContextoDaConversa`/`PlanoDoTurno` abaixo são **hipóteses de
> trabalho** — o spike refina/derruba/substitui.

- **Entrada:** contextos **reais e VARIADOS** (histórico real do banco — 30 msgs, com
  `respondida`; catálogo real da org; casos diferentes: cidade/trilha/estrada, objeção
  preço/km, modelo/ausente, automática, orçamento). Nada de cenário cravado: o mesmo
  experimento roda sobre conversas e estoques diferentes.
- **O que se descobre:** qual conjunto de **perguntas/tipos** (choice/noul/score) e qual
  **forma de resposta** a JEV devolve de maneira **consistente e parseável**, com os IDs
  certos, que o motor consiga **executar sem reinterpretar**. Inclui testar alternativas
  (ex.: seleção por IDs × score por moto; ação × ação+fase; fecho separado × junto).
- **Sem escrever no CRM.** Reaproveita `lib/ai/jev/decidir`/`arbitro` (JEV real,
  provider da org) e um script de exploração `scripts/qa/jev-formato-probe.ts`
  que imprime **a resposta crua da JEV** + o que o motor conseguiu extrair.
- **Item 6 (catálogo no modelo)** entra aqui: comparar o texto do modelo **com × sem**
  `crm_query_external_data`, recebendo só o que a JEV decidiu — e ver qual formato de
  plano basta para o modelo redigir certo.

### Casos do spike (os 7 erros + critérios)
| # | Contexto | Esperado no plano |
|---|---|---|
| 1 | cidade+trabalho (30 msgs, última pendente) | `acao=oferecer`, 5 motos urbanas (≤400cc, sem trail) |
| 2 | objeção km sobre NMax (15 mil, automática) | seleção com menos km que a NMax (Neo 11k) |
| 3 | "achei caro, mais em conta" (trilha) | seleção **trail** mais barata (não street) |
| 4 | "moto pra estrada" | 5 motos de estrada (não 2) |
| 5 | orçamento 30 mil olhando CB 500 X | seleção coerente com o foco/orçamento (texto depois) |
| 6 | "prefiro a NMax" (15 mil) | `escolhida = id` da 2019 |
| 7 | "Lander 250?" (ausente) | `acao=oferecer`, trail equivalentes; aviso "não temos" |
| 8 | "automática, até 15 mil" | seleção só automáticas ≤15k |

### Critérios de aceite do spike (descoberta de formato)
- O formato que a JEV devolve é **consistente e parseável** em contextos **variados**
  (não só num cenário).
- O motor extrai **os IDs das motos** e a ação **sem heurística/reinterpretação**.
- **Decisão correta** nos comportamentos-alvo (os 8 casos) com o formato descoberto.
- **Determinismo mínimo**: repetir o mesmo contexto → mesma decisão/faixa.
- Só então o formato vira contrato (`PlanoDoTurno`) para implementar.

Só depois disso implementar.

---

## 7. Fases de implementação

- **F0 — Spike** (seção 6): provar contexto + schema + decisão. **Nada em produção.**
- **F1 — `ContextoDaConversa`**: builder único (30 msgs, `respondida`, estado, catálogo);
  corrigir a janela efetiva (hoje 3). Arquivo novo `lib/agent-engine/agent/contexto-da-conversa.ts` + teste.
- **F2 — `PlanoDoTurno` na JEV**: novo ponto `lib/ai/jev/pontos/plano-de-turno.ts`
  (ou o árbitro devolvendo o plano), com as instruções/schema acima; testes puros.
- **F3 — Motor executa**: no `inbound-turn`, usar o plano (ids) para a seleção/entrega;
  **remover** os filtros/fills que decidem (`perfilUrbano`, `filtrarMaisEmConta`,
  `filtrarMenosRodadas`, fills por categoria, corte de câmbio/orçamento como decisão) —
  viram execução do plano ou fallback.
- **F4 — Modelo só redige**: remover `crm_query_external_data`/escolha pelo modelo no
  caminho de oferta; o `send_message` não escolhe moto (o motor usa o plano). O texto é
  gerado sobre a seleção (multi: abertura neutra; 1: ficha factual).
- **F5 — Testes**: spike (8 casos) + suíte unitária + pesado 38 turnos (3 clientes) verde.
- **F6 — Rollout**: flag `JEV_PLANO_DE_TURNO=1`; A/B; rollback = desligar a flag.

---

## 8. O que sai do motor como DECISOR (vira execução/fallback)

`perfilUrbano`, `cortarAcimaDaReferencia`/corte por orçamento como decisão,
`filtrarMaisEmConta`, `filtrarMenosRodadas`, `cortarFila`/fills por categoria,
`pedirCambioAutomatico` como filtro decisor, `textoDaUnidadeEscolhida` como **decisão**
(continua como render de fatos) e o `corpoSemNomesForaDoEnvio` (sanitizador) — todos
passam a **executar** o plano (ou fallback quando a JEV está off).

O que fica no motor: buscar por id, montar legendas/fotos, fatos (preço/km/ano),
contagem real, anti-ban, gates, handoff-duro, idempotência.

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Latência/tokens (contexto 20 + catálogo) | cache do prefixo; catálogo só nos pontos que decidem; 1 chamada (árbitro) |
| Schema não respeitado | provider `typesafe` + validação no motor; fallback |
| Modelo ainda tentar escolher | `send_message` sem `motos`; motor ignora escolha do modelo |
| Janela/`respondida` errada | teste do builder (20 msgs, flags) |
| Regressão do que funciona | flag + A/B + pesado 38 antes de ligar default |
| Provider/JEV indisponível | fallback determinístico (hoje), mas só como rede |

---

## 10. Decisões para o dono (confirmar antes da F1)

1. **Janela:** 20 mensagens fixas ou 20–30 (default 20)?
2. **Saída da JEV:** só decisão/IDs (o modelo redige) ou a JEV também sugere o texto do fecho?
3. **Seleção:** a JEV devolve **IDs** (recomendado) ou nomes?
4. **`respondida`:** última mensagem = `false`, todas as anteriores `true` (como acima)?
5. **Rollout:** flag + A/B antes de default, ok?
6. **Modelo sem catálogo:** **TESTAR no spike (F0)** — comparar o texto do modelo com e sem
   `crm_query_external_data`, recebendo só o `PlanoDoTurno`. Decidir pelo resultado.

---

## FECHAMENTO (2026-10-27)

- **Plano ATIVO e validado no QA e na PRODUÇÃO** (flag por agente `catalog.plano_jev`).
- Oferta: a JEV decide `acao`/critérios/IDs dentro do pool dos critérios **explícitos**
  (orçamento FIXO, câmbio, uso/categoria). "cidade" → 4 urbanas; "automática ≤15 mil" → 2.
- "ver mais": as motos do plano são **gravadas no catálogo da conversa**; o turno seguinte
  usa o mesmo perfil (pool 12) e **não trava** (responde 5 novas).
- Logs de tentativa/decisão (`respostaOk`, `motivo`, `acao`, `selecionadas`).
- **Rollback:** `update ai_agents set config = jsonb_set(config,'{catalog,plano_jev}','false') where id=...` — volta ao caminho anterior sem deploy.
- Pendente opcional: item 6 (modelo sem `crm_query_external_data`) e o pesado 38 com a flag
  na produção para o A/B. O caminho atual continua como fallback (`plano null`).
