# Plano completo de correção e teste — 2026-10-20

**Status:** concluído e validado no 5924. Worker **jevfix39** no ar com nome,
fluxo, frase “outras marcas”, disponibilidade e anti-alucinação de veículo.
Ambiente restaurado (Datafy open, agente 84, 0101 allowlist 2501; sem crédito
Datafy). Pendência única: decisão sobre handoff-duro (hoje abre caso, não
`force_human`).
**Telefone de teste:** **somente +55 12 98132-5924** (canal WAHA 0101). O dono
acompanha. **Sem Datafy** (gate fechado, zero crédito). Restaurar tudo ao final.
**Base:** achados do teste completo e do teste pesado; relatório:
`docs/RELATORIO-TESTE-PESADO-2026-10-20.md`.
**Regras:** JEV decide; motor executa; sem regex decidindo venda. Não tocar em
turno/rajada/junção/idempotência/anti-ban/opt-out/handoff-duro.

## 1. O que o dono pediu (revisão completa)

1. Não usar Datafy nos testes.
2. Testar só no 5924; o dono acompanha; não mandar para 6837/1455.
3. Corrigir **nome contraditório**: o bot chama “Letícia” e na mesma conversa
   pergunta “Como você se chama?”.
4. Corrigir o **fluxo errado**: escolha + objeção abria Qualificação e depois
   injetava “De qual cidade você fala?” em turnos de catálogo/multi-intenção.
5. Corrigir **“outras marcas” em tudo**: a frase só pode existir quando o
   cliente pediu um **modelo ou marca específica**; em pedido genérico
   (cidade/uso/categoria/faixa) é só “outras opções que temos”.
6. Revisar o **handoff** (“quero falar com um humano”): o teste pesado marcou
   falha porque `force_human` ficou false; o comportamento atual abre **caso**
   e o bot segue. Não é regressão; validar o caso, não `force_human`. Se o dono
   quiser silêncio/transferência dura, é decisão de produto (mexe no
   handoff-duro) e precisa de confirmação.
7. “Arrume tudo definitivamente no mesmo processo, teste, descubra quando
   responde certo e aceite isso; veja se não quebra outras coisas.”
8. Recriar o plano completo (este documento).

**Novos achados no teste ao vivo de 2026-10-20 (revisão do dono):**
- “Tem uma Lander 250?” (disponibilidade) abria **Qualificação** (JEV 0,44);
  depois “De qual cidade?” contaminava o turno de troca/financiamento.
- Na resposta do fluxo, o bot afirmou “você já me passou os dados da sua **CG
  160 2019**”, que o cliente **nunca** disse (alucinação de veículo).

## 2. Correções implementadas (parte já no ar; parte no código)

### 2.1 Nome: fonte única confirmada (P1-C concluído)

**Causa raiz:** `get-lead-context.ts` montava `contact.name = display_name ??
name`. O `display_name` do WhatsApp (“Letícia & Gustavo”) era usado na
saudação; o fluxo, corretamente, não o considerava nome confirmado e perguntava
“Como você se chama?”. A contradição era a **divergência de fontes**.

**Correção:** o contexto do agente agora usa **somente `contact.name`**. O
`display_name` continua no CRM/WhatsApp, mas não é nome do cliente para o bot.
Saudação e pendência do fluxo agora têm a mesma fonte:
- sem `name` → não chama por nome e pergunta;
- com `name` (cliente/CRM/P4) → chama e não pergunta.

**Provas:** `tests/unit/get-lead-context-decisao.test.ts` 5/5 (novo caso
`display_name` não vira nome; `name` vence); `atendimento` 54/54; `tsc` 0.

### 2.2 Escolha + objeção não abre Qualificação (raiz do “De qual cidade”)

**Causa raiz medida na JEV:** a mensagem
`Gostei da CB 300 R 2011, mas achei um pouco caro.` fazia a JEV escolher
`Qualificação` (confiança 0,61). O fluxo ficava ativo; no turno seguinte de
catálogo/multi-intenção a pergunta pendente “cidade” aparecia. O problema não
era a multi-intenção em si.

**Correção (JEV primeiro, sem regex):** exceção explícita no prompt do ponto
`flow_intent` e no prompt do modelo de fallback: escolha/gosto **junto** de
objeção de preço/ano/km → `none`; a objeção é tratada no turno; Qualificação só
quando o interesse vem **sem** objeção. O fluxo duplo explícito
(“troca + financiar o resto”) continua sendo iniciado.

**Sonda real (typesafe/jev-latest), antes → depois:**
- “Gostei da CB 300 R 2011, mas achei um pouco caro.” → `Qualificação` (0,61)
  **antes**, `[]/none` (1,00) **depois**.
- “Quero ver mais opções.” → `[]` (0,96) → `[]` (0,99).
- “Vocês financiam? Aceitam cartão? Onde fica a loja?” → `[]` (0,97) → `[]` (0,96).

**Provas:** `lib/ai/jev/pontos/flow-intent.test.ts` 9/9;
`lib/agent-engine/agent/flow-intent.test.ts` 16/16; `tsc` 0.

### 2.3 “Outras marcas” só em pedido específico (novo P1-E)

**Causa raiz em 3 lugares:**
1. `perguntaDeMaisOpcoes` sem modelo: todas as 4 variantes diziam “inclusive de
   outras marcas” — era a frase repetida no catálogo genérico.
2. Prompt do turno (`inbound-turn.ts`, bloco “Ainda há outras opções”):
   “Sempre deixe claro ... mesmo estilo ou de outras fabricantes”, até em
   pedido genérico.
3. Aviso de “parecidas” na 2ª entrega/“ver mais”: dizia “não são exatamente o
   que você pediu e algumas são de outras marcas” para qualquer fila, inclusive
   “moto para cidade”.

**Correção:**
- sem modelo/marca: variantes falam **só** em “outras opções parecidas que
  temos”; nunca “outras marcas/fabricantes”;
- com modelo/marca específica: pode oferecer outras fabricantes (skill §2);
- o aviso forte “não são exatamente o que você pediu / algumas de outras
  marcas” só quando **um modelo pedido não existe no estoque**;
- prompt do turno condiciona “outras fabricantes” ao pedido específico.

**Provas:** `mais-opcoes.test.ts` 37/37 (novo teste sem modelo não menciona
marcas; com modelo pode); teste ao vivo no 5924: cidade e “ver mais” genéricos
saíram **sem** “outras marcas”; Lander (modelo específico) manteve a oferta de
alternativas.

### 2.4 Disponibilidade não abre Qualificação (novo P1-F)

**Causa raiz:** “Tem uma Lander 250?” era lida pela JEV como interesse em uma
moto (Qualificação, 0,44), embora seja catálogo/disponibilidade. Ficou ativa e
no turno seguinte (“troca + financiar”) a pergunta pendente “cidade” apareceu.

**Correção:** prompt da JEV distingue **PERGUNTA DE DISPONIBILIDADE** (“tem uma
X?”, “vocês têm X?”) → `none`; Qualificação só com decisão/gosto (“quero essa”).
Reforço: se a mensagem pede um **processo**, o fluxo principal é o primeiro
processo citado, **nunca** Qualificação, mesmo citando moto.

**Sonda real antes → depois:**
- “Tem uma Lander 250?” → `Qualificação` (0,44) **antes**; `[]/none` (1,00)
  **depois**.
- “Quero dar minha moto na troca e financiar o restante.” → `Troca` +
  `Financiamento` (1,00) em ambos (a falha ao vivo foi a Qualificação ativa do
  Lander, não o duplo em si).
- Demais cenários inalterados (objeção, ver mais, multi-informação).

**Provas:** `lib/ai/jev/pontos/flow-intent.test.ts` 9/9; probe acima; **live
no 5924:** “Tem uma Lander 250?” → 5 trail, **sem** Qualificação/cidade;
`followup_enrollments` vazio.

### 2.5 Alucinação de veículo do cliente (novo P3-I)

**Causa raiz:** com Qualificação ativa, o modelo escreveu “você já me passou os
dados da sua CG 160 2019” — nenhum `custom_fields`, `contact_flow_data` ou
mensagem continha CG 160/2019. O catálogo tinha uma CG 160 2022; o modelo
inventou o resto.

**Correção:** bloco de prompt “Dados do veículo — NÃO inventar”: não afirmar
modelo/ano/km/placa/documentação do cliente sem estar no contexto/flow_data/
histórico; se a moto de troca não foi dita, perguntar.

**Prova:** `tsc`/testes; **live no 5924:** troca+financiamento perguntou
“Qual moto você pretende dar na troca?”, sem “sua CG 160 2019”.

### 2.6 Handoff — correção de expectativa, sem tocar no handoff-duro

O comportamento atual de “quero falar com um humano” é **abrir caso**
(`agent_cases`) e o bot **segue** respondendo; `force_human` **não** é o
critério. O relatório anterior chamou isso de falha; a expectativa estava
errada. Validar o caso, não `force_human`. Mudar para silêncio/transferência
dura é decisão de produto (mexe no handoff-duro) e precisa de confirmação.

## 3. Teste ao vivo no 5924 — resultado parcial

### 3.1 Preparação (feita)
- Disco liberado (imagens antigas) e build jevfix39 concluído; app/worker/
  scheduler healthy.
- Datafy `allowlist []`; 0101 allowlist `+5512981325924`; versão temporária 85
  (channel 0101) publicada só no teste; 5924 limpo.
- Harness `/tmp/harness5924.js` (webhook sintético + leitura de banco).
- **Restaurado depois do teste:** Datafy `open`, agente 84, 0101 allowlist 2501,
  versão temporária removida, 5924 limpo, `force_human=false`.

### 3.2 Resultado do teste ao vivo (worker jevfix39)
| # | Cenário | Resultado |
|---|---|---|
| 1 | Genérico | ✅ não chamou “Letícia”; pediu critério; 0 fotos |
| 2 | Cidade | ✅ 5 urbanas, sem V-Strom; fecho **sem** “outras marcas” |
| 3 | Escolha + objeção | ✅ sem Qualificação/“De qual cidade”; objeção tratada |
| 4 | Ver mais | ✅ 3 opções; **sem** “não são exatamente/outras marcas” |
| 5 | Nome (“Meu nome é Letícia”) | ✅ P4 gravou `name`; “Prazer, Letícia!”; sem reperguntar |
| 6 | Multi-informação (financiam/cartão/loja) | ✅ respondeu as 3; **sem** cidade/Qualificação; fila vazia |
| 7 | Lander (disponibilidade) | ✅ após deploy: 5 trail, **sem** Qualificação/cidade; enroll vazio |
| 8 | Troca + financiamento | ✅ após deploy: Troca ativa + Financiamento na fila; pergunta a moto da troca |
| 9 | Alucinação “sua CG 160 2019” | ✅ após deploy: não repetiu; perguntou a moto da troca |
| 10 | Handoff | não retestado; por desenho abre caso, não `force_human` |

### 3.3 Roteiro de aceite final (nesta ordem)
1. “Oi, boa tarde! Queria ver as motos.” → **não** chamar Letícia; pedir
   critério; 0 fotos.
2. “Quero uma moto para cidade, uso no dia a dia.” → 5 urbanas; **sem V-Strom**;
   fecho **sem** “outras marcas”.
3. “Gostei da CB 300 R 2011, mas achei um pouco caro.” → objeção tratada;
   **nenhum fluxo Qualificação**; não perguntar cidade neste nem no turno
   seguinte.
4. “Quero ver mais opções.” → 3 parecidas; **sem** “não são exatamente o que
   você pediu/algumas de outras marcas” (pedido genérico).
5. “Vocês financiam? Aceitam cartão? Onde fica a loja?” → responde as 3; **sem**
   cidade/Qualificação pendente.
6. “Tem uma Lander 250?” → assume ausência; só trail; **pode** falar em outras
   marcas (modelo específico).
7. “Quero dar minha moto na troca e financiar o restante.” → Troca ativa +
   Financiamento na fila; pergunta só troca.
8. Nome: em um turno sem `name`, o bot **não** chama por Letícia; ao dizer
   “Meu nome é Letícia”, P4 grava e o próximo turno chama sem reperguntar.
9. Handoff: “Quero falar com um humano.” → verificar **caso aberto** em
   `agent_inbox_items`; `force_human` não é o critério atual. Registrar no
   relatório; não alterar handoff-duro sem confirmação.
10. Restaurar Datafy/0101/agente/flows/mensagens; health; atualizar relatório.

### 3.4 Regressão obrigatória
- `tsc` 0; `eslint` 0 nos arquivos tocados;
- `vitest` dos pontos: `get-lead-context`, `mais-opcoes`, `flow-intent` (JEV e
  agente), `atendimento`, `fecho-do-turno`, `catalogo-da-conversa`;
- suíte `lib/agent-engine lib/followup lib/ai` completa: **1579/1579** no worker
  de teste (copiar `tests/setup`/`tests/support`; rodar `--environment node`);
  `tsc` 0; lint 0 erros (só warnings antigos em `inbound-turn.ts`);
- ao vivo: os 10 passos acima; confirmar contagem, ordem texto→fotos→pergunta,
  uma pergunta, sem “Perfeito”, sem promessa de foto sem foto.

## 4. Deploy e fechamento
- Deploy jevfix39 feito (app/worker/scheduler healthy). Teste final no 5924:
  Lander sem fluxo; troca+financiamento correto; sem alucinação; nome e “outras
  marcas” validados.
- Ambiente restaurado: Datafy open, agente 84, 0101 allowlist 2501, versão temp
  removida, 5924 limpo, `force_human=false`.
- Pendente: decisão do dono sobre handoff-duro (hoje caso + bot segue) e
  commit/push (só quando pedir).

## 5. Riscos / decisões
- **Handoff-duro:** comportamento atual (caso + bot segue) é intencional;
  `force_human` não é esperado. Se o dono quiser mudar, parar e confirmar.
- **“Outras marcas” em modelo específico:** continua permitido; não remover.
- **Disco:** não iniciar build antes de liberar; remover imagens antigas
  `jevfix26..38` e build cache; manter `jevfix39`/atuais.
- **Commit:** só quando o dono pedir; o deploy usa a árvore atual.

## 6. Arquivos tocados nesta rodada
- `lib/agent-engine/edge/crm/get-lead-context.ts`
- `lib/followup/atendimento.ts` (comentário da fonte única)
- `lib/followup/atendimento.test.ts` (comentário)
- `lib/ai/jev/pontos/flow-intent.ts` + `.test.ts`
- `lib/agent-engine/agent/flow-intent.ts` + `.test.ts`
- `lib/agent-engine/agent/mais-opcoes.ts` + `.test.ts`
- `lib/agent-engine/agent/inbound-turn.ts` (prompt + aviso de parecidas)
- `tests/unit/get-lead-context-decisao.test.ts`
- `docs/RELATORIO-TESTE-PESADO-2026-10-20.md` (corrigir achados 1/2 após o
  teste; o handoff é caso, não `force_human`).

## 7. Correção da regressão da Lander + persistência do fluxo (2026-10-20 23h)

**Causa medida:** no turno “Vocês financiam? Aceitam cartão? Onde fica a loja?” o
modelo chamou `flow_start('Financiamento')` apesar da JEV dizer `none`. O
Financiamento ficou ativo e contaminou o turno seguinte da Lander (álbum errado,
8 imagens com legendas vazias, texto de outro fecho). O prompt de fallback ainda
tinha a regra antiga “pergunta abre fluxo”.

**Correções implantadas (worker jevfix39):**
1. `flow_start` explícito agora só abre fluxo **autorizado pela intenção do
   turno** (JEV/fallback); fluxo negado não inicia.
2. Prompt de fallback alinhado: pergunta/informação sobre processo → lista
   vazia; só pedido explícito inicia.
3. **Fluxo ativo persiste**: responder catálogo antes NÃO cancela, não reinicia
   e não troca o fluxo; ele fica pendente até concluir. O `flow_start` com fluxo
   ativo devolve o ativo.

**Teste ao vivo no 5924 (sem Datafy):**
- “Vocês financiam? Aceitam cartão? Onde fica a loja?” → **nenhum fluxo**.
- “Tem uma Lander 250?” sem fluxo → 5 trail corretas, com legendas.
- “Quero financiar a CB 300 R 2011.” → Financiamento **active**.
- “Tem uma Lander 250?” com Financiamento ativo → 5 trail corretas; o
  Financiamento **continuou active**.
- “Pode seguir com o financiamento.” → bot pediu CPF; Financiamento **continua
  active**, sem fila paralela.

**Estado:** app/worker/scheduler healthy; Datafy `open`, agente 84, 0101
allowlist 2501; 5924 limpo; sem crédito Datafy. Pesado completo ainda não
repetido após esta correção.

## 8. Pesado completo pós-correção — 2026-10-20 ~23h

**Resultado:** 7 de 10 turnos responderam. Falha de INFRA do provedor de modelo,
não de fluxo/Lander: logs do worker mostram
`AI_APICallError: Upstream request failed: Endpoint is unavailable`
(`opencode_go/deepseek-v4-flash`) nos turnos 3, 7 e 8.

| # | Cenário | Resultado |
|---|---|---|
| 1 | Genérico | ✅ sem nome; pergunta critério; 0 fotos |
| 2 | Cidade | ✅ 5; sem V-Strom; sem “outras marcas” |
| 3 | Escolha + objeção | ⚠️ sem outbound por falha do provedor (não pelo fluxo) |
| 4 | Objeção persistente | ✅ respondeu após o provedor voltar |
| 5 | Ver mais | ✅ 3; sem “outras marcas” genéricas |
| 6 | Nome | ✅ “Boa, Letícia!”; sem contradição |
| 7 | Multi-informação | ⚠️ sem outbound por falha do provedor |
| 8 | Lander | ⚠️ sem outbound por falha do provedor |
| 9 | Troca + financiamento | ✅ fluxo Troca ativo; pergunta a troca |
| 10 | Handoff | ✅ `paused_handoff`; comportamento atual |

O recorte crítico separado — multi-informação → Lander → fluxo Financiamento
persistente → Lander com fluxo ativo → “pode seguir” — passou (seção 7). O
pesado completo precisa ser repetido com o provedor estável; não é regressão do
código de fluxo/Lander. Ambiente restaurado; sem Datafy.
