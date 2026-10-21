# Relatório — pesado de 10 turnos na `a58d11ce` + reserva de modelo

**Data:** 2026-10-21
**Branch:** `feat/fluxos-de-atendimento`
**No ar durante o teste:** `APP_VERSION=a58d11ce` (app/worker/scheduler healthy)
**Ambiente:** org `e40dc035…`, canal de teste `9d9d8ddc…` (0101, provider `waha`), contato `5512981325924`

> **CONFIRMADO:** em nenhum momento o teste enviou mensagem pelo WhatsApp real nem pelo
> Datafy. O worker de teste rodou com um **WAHA falso** (`qa-waha-mock`, porta 3999), que
> responde como se tivesse enviado e grava o payload em
> `/tmp/opencode/qa-mock-capturas.jsonl`. O worker de produção (Datafy) ficou parado
> durante a execução e foi restaurado depois. O app de produção continuou de pé.

---

## Atualização pós-queda — deploy de `d8fa91b1` (2026-10-21 15:20)

A sessão do opencode caiu às **14:53**, logo depois de disparar o deploy via
`systemd-run` (`subir-sem-testes`). O deploy **terminou sozinho às 15:08:56**:

- `APP_VERSION=d8fa91b1`; app/worker/scheduler **healthy**; health responde
  `{"status":"healthy","version":"d8fa91b1"}`. **CONFIRMADO.**
- Entraram os dois commits pendentes: `fbfba95b` (reserva grava sem exigir
  provedor do ponto) e `d8fa91b1` (fecho depois das fotos + contagem na abertura).
  `tsc` 0, lint 0, **1606/1606** no `pesado-funcional.sh` antes do commit.
- **Reserva revalidada na tela já no build novo:** `PUT /api/v1/ai/providers`
  disparado pelo botão devolveu **200** (antes: 422), persistiu
  `{openrouter, z-ai/glm-5.1}` e o card mostrou badge, selects e **Remover**.
  Prova em `.superpowers/evidence-pos-deploy/reserva-prova.json` + PNGs.
- **Revalidação ao vivo feita** (seção seguinte): turno 3 com ordem correta e
  "ver mais" com contagem correta; o turno 5 da primeira rodada foi capturado
  pelo handoff de sentimento e foi refeito numa conversa limpa.
- **Push:** os 32 commits foram enviados em 2026-10-21 15:58;
  `origin/feat/fluxos-de-atendimento` = **`d8fa91b1`**. **CONFIRMADO.**

### Revalidação ao vivo (turnos 1–5 e 8, 15:30–15:45)

Mesmo ambiente de teste (v85 temporária, WAHA falso, worker de produção parado por
~8 min), agora com o build `d8fa91b1`. Artefatos: `.test-artifacts/pos-d8/`.

- **Turno 3 — RESOLVIDO. CONFIRMADO.** Resposta à objeção (1 texto) → **7 fotos** →
  **pergunta de fecho** em bolha própria, depois das fotos. Antes, a pergunta vinha
  fundida na chamada, antes das fotos.
- **Turno 5 — não avaliável nesta execução.** O inbound "Quero ver mais opções."
  não chegou ao motor: 0 jobs, 0 chamadas de modelo, 1 única saída — o aviso
  determinístico de transferência ("Deixa comigo: vou passar seu atendimento…")
  e a conversa ficou silenciada (`bot_silenced_until=infinity`). O turno 8 caiu em
  `nao_elegivel_para_ia / conversa_silenciada` como consequência.
  - **INFERIDO (forte), não confirmado:** foi o **handoff por sentimento**
    (`low_sentiment`), não a correção: o `ai-sentiment-worker` classificou o
    inbound às 13:38:17 UTC, o aviso saiu às 13:38:26 sem chamada de agente, e
    `performHumanHandoff` não foi o caminho (`contact.force_human=false`). Os logs
    do worker temporário foram removidos na restauração, então a causa exata não
    ficou registrada.
  - Consequência: a **contagem na abertura do "ver mais"** ficou sem prova na
    primeira rodada (só unitária, 39 testes em `mais-opcoes.test.ts`). Provada
    na conversa limpa abaixo.
- **"Ver mais" em conversa limpa (1 → 2 → "ver mais") — RESOLVIDO. CONFIRMADO.**
  Artefatos: `.test-artifacts/pos-d8-limpo/pesado-05.json`. A abertura diz
  **"deixa eu te mostrar 3 opções urbanas"** e saem **exatamente 3 fotos**, com
  o fecho ("Qual delas te agradou mais?") depois delas. Contagem = fotos = 3,
  ordem texto → fotos → pergunta correta.
- **Ambiente restaurado e CONFIRMADO:** v84 (`dea42fb8…`) publicada, v85 apagada,
  allowlist `["+5512981672501"]`, contato `5924` limpo (`contacts=0`),
  `qa-worker-temp`/`qa-waha-mock` removidos, worker de produção `healthy`,
  `APP_VERSION=d8fa91b1`.

---

## 1. Como o teste rodou

1. Contato `5924` limpo (`limpar-teste-completo.sh`) — já estava sem registros.
2. Versão `84` (`dea42fb8…`) clonada como `85`, `status=published`,
   `channel_session_id = 9d9d8ddc…`; `ai_agents.published_version_id → 85`.
3. Allowlist do 0101 = `["+5512981672501","+5512981325924"]`.
4. Worker de produção **parado**; worker temporário (`qa-worker-temp`) com o mesmo
   `env` da imagem `jev-prod-local-jevfix39`, **exceto**
   `WAHA_API_BASE_URL=http://qa-waha-mock:3999`.
5. Inbound injetado pelo webhook real (`scripts/qa/pesado-smoke.sh` +
   `harness-turno.js`), 10 turnos, silêncio de 45 s por turno.
6. Restauração completa ao fim (seção 5).

`grep liberarAvisoDeterministico lib/agent-engine/agent/inbound-turn.ts` dentro da
imagem do worker = **3** ocorrências → a imagem contém a correção do handoff da
`a58d11ce`. **CONFIRMADO.**

---

## 2. Resultado turno a turno (a58d11ce × 860e3494)

Artefatos: `.test-artifacts/heavy-a58/pesado-01..10.json` (novo) e
`.test-artifacts/heavy-dup-01..10.json` (referência).

| # | Mensagem | out (novo) | txt | fotos | llm | out (dup) | txt | fotos | llm |
|---|---|---|---|---|---|---|---|---|---|
| 01 | "queria ver as motos" | 1 | 1 | 0 | 4 | 1 | 1 | 0 | 4 |
| 02 | "moto para cidade" | **7** | **2** | 5 | 4 | 8 | 3 | 5 | 4 |
| 03 | "CB 300 R 2011, achei caro" | **8** | **1** | 7 | 5 | 9 | 2 | 7 | 5 |
| 04 | "muito caro, não cabe" | 1 | 1 | 0 | 4 | 1 | 1 | 0 | 4 |
| 05 | "quero ver mais opções" | 6 | 1 | 5 | 7 | 4 | 1 | 3 | 4 |
| 06 | "meu nome é Letícia" | 1 | 1 | 0 | 5 | 1 | 1 | 0 | 5 |
| 07 | "financiam? cartão? onde fica?" | 1 | 1 | 0 | 4 | 1 | 1 | 0 | 4 |
| 08 | "tem uma Lander 250?" | 7 | 2 | 5 | 5 | 7 | 2 | 5 | 5 |
| 09 | "troca + financiar o restante" | 1 | 1 | 0 | 4 | 1 | 1 | 0 | 4 |
| 10 | "quero falar com um humano" | 1 | 1 | 0 | **0** | 1 | 1 | 0 | 3 |

- **10/10 turnos com outbound**, nenhum silêncio, **0 erros de modelo**.
- **42 chamadas de modelo** (todas `binding` ou `agente_publicado`; nenhuma usou
  reserva, porque não houve falha transitória).
- **35 bolhas** persistidas no total (inclui o turno 1 isolado): 13 textos +
  22 imagens. **Todas** com `external_id` do mock e `status=sent`; destino único
  `5512981325924@c.us`. **CONFIRMADO** (zero envio real).

### Anti-duplicação (correção da `860e3494`)
- Turno 2: **3 textos → 2** (um único fecho). **CONFIRMADO.**
- Turno 3: **2 textos → 1** (resposta à objeção sem 2ª pergunta duplicada). **CONFIRMADO.**
- Nenhum turno repetiu a mesma pergunta de fecho em bolhas separadas.

### Handoff (correção da `a58d11ce`)
- Turno 10: **1 outbound**, **0 chamadas de modelo**, texto só de transferência,
  sem pergunta de venda; `contact.force_human = false`. **CONFIRMADO.**
- Referência anterior (`860e3494`): 3 chamadas de modelo e `force_human = true`.

---

## 3. Quebras de regra observadas (NÃO corrigidas — decisão do dono)

> A skill `regras-atendimento` manda **parar e avisar** quando uma destas aparece.
> Não mexi em prompt/motor. As duas são intermitentes e **não** vêm da `a58d11ce`
> (que só mexeu na liberação do buffer da junção) — a mesma assinatura já apareceu
> em execuções anteriores.

### 3.1 Turno 3 — pergunta de fecho ANTES das fotos
- Texto enviado primeiro (recorte): *"…Pra eu te ajudar de verdade: o que ficaria
  confortável no seu bolso? A gente vê o que encaixa."* → **depois** 7 fotos.
- A ordem exigida é **chamada → fotos → pergunta** (skill, item 1).
- Na execução de referência o fecho veio em bolha própria **depois** das fotos
  (`heavy-dup-03`: `T FFFFFF T`); aqui veio fundido na chamada (`T FFFFFF`).
- Precedente: `heavy-clean-03` já tinha `T` único com pergunta na 1ª bolha.

### 3.2 Turno 5 — texto não informa a quantidade de motos
- Texto: *"Temos outras opções no estoque, sim. Separei **umas** que ficam abaixo
  do valor da CB 300 R…"* → **5 motos/fotos** enviadas, sem contagem.
- A regra diz que o texto **sempre** menciona a contagem real de motos quando há
  mais de uma (skill, item 3).
- Precedente: `heavy-clean-08` também mostrou 9 fotos sem contagem.

**Recomendação:** tratar os dois no **prompt/contexto da JEV** (não em regex), como
manda `docs/doctrine/jev-decide-sempre.md`. Não fiz por conta própria.

---

## 4. Reserva de modelo (item 2)

### 4.1 Configurada e provada na tela
- **Antes:** vazia (`provider=null`, `model=null`).
- **Depois:** `provider=openrouter`, `model=z-ai/glm-5.1`.
- `organizations.settings.llm` gravado; linha de auditoria
  `ai.fallback_model_updated` (`{provider:"openrouter", model:"z-ai/glm-5.1"}`).
- Card recarregado mostra badge `z-ai/glm-5.1`, selects **OpenRouter** /
  **Z.ai: GLM 5.1** e botão **Remover**.
- Credencial OpenRouter **revalidada pela tela**: 446 → 468 modelos, sem erro —
  a chave está viva. **CONFIRMADO.**
- Escolha do `glm-5.1`: o catálogo oferece `glm-5.1` em `openrouter` e `opencode`;
  **não** existe `glm-5.1` em `opencode_go` (lá há `glm-5.2/5.3`). Usei OpenRouter,
  que também dá redundância **de provedor** (o principal é `opencode_go`).

Provas visuais: `.superpowers/evidence/reserva-01-antes.png`,
`reserva-02-preenchido.png`, `reserva-03-bug-422.png`, `reserva-04-depois.png`,
`reserva-05-card.png` + `reserva-prova.json`.
Métricas do card: `x=352 y=326 w=976 h=174` (dentro de 1440×950, sem corte).

### 4.2 Defeito achado: o botão "Salvar reserva" sempre devolvia 422
- **Medido na tela:** `PUT /api/v1/ai/providers` com `{fallback_provider,
  fallback_model}` → **422 `invalid_body`** — *"provider: expected string,
  received undefined; model_id: expected string, received undefined"*.
- **Causa raiz:** o `corpoDoPut` da rota mantinha `provider` e `model_id`
  **obrigatórios** em qualquer corpo. O `safeParse` reprovava **antes** do ramo da
  reserva; o card existia, explicava e nunca gravava.
- **Correção no working tree (NÃO implantada):**
  - schema extraído para `lib/ai/pontos/corpo-do-put.ts` com `provider`/`model_id`
    opcionais (a obrigatoriedade é da **operação**);
  - `app/api/v1/ai/providers/route.ts` ganhou o guard do ramo do ponto
    (`informe o provedor e o modelo do ponto`);
  - regressão em `lib/ai/pontos/corpo-do-put.test.ts` — **8/8**.
- **Até o deploy da correção**, o único caminho que grava é o `PUT` com os quatro
  campos (`provider`/`model_id`/`fallback_*`), que foi o usado para configurar a
  reserva sem mudar o build no ar — mesma rota, mesma auditoria, mesmo ramo.

---

## 5. Verificação funcional e restauração

- `bash scripts/qa/pesado-funcional.sh` → `tsc` **0**, lint **0 erros**,
  **1602/1602** testes (1594 anteriores + 8 novos). **CONFIRMADO.**
- Ambiente restaurado:
  - worker de produção de volta (`healthy`), sem `qa-worker-temp`/`qa-waha-mock`;
  - `ai_agents.published_version_id = dea42fb8…` (84), versão 85 **apagada**;
  - allowlist do 0101 = `["+5512981672501"]`;
  - contato `5924` limpo (`contacts=0`, `messages=0`, mídia removida);
  - `APP_VERSION=a58d11ce`; app/scheduler/worker healthy. **CONFIRMADO.**

---

## 6. Pendências

1. **Deploy da correção da reserva** (o botão da tela continua 422 até subir).
   Commit/push/deploy só com pedido do dono.
2. **Decisão sobre as quebras 3.1 e 3.2** (ordem do fecho e contagem no turno 5).
3. Os 4 commits locais seguem **sem push**.

### O que não foi provado
- A reserva **sendo acionada em runtime** (exigiria derrubar o provedor primário).
  A cadeia está coberta por `reserva-no-seam`, `reserva-de-modelo` e
  `breaker-de-modelo`; o que se provou aqui foi a **configuração e a persistência**.
- Ordem/contagem dos turnos 3 e 5 ficaram **abaixo da regra** nesta execução.
