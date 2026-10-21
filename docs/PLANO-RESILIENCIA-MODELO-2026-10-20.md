# Plano de resiliência do modelo — incidente do pesado 2026-10-20

**Status:** correção do classificador de retry implementada e testada; falta
deploy + pesado com preflight. Ambiente de teste restaurado; sem Datafy.

## 1. Achado medido

No pesado completo (5924), 3 de 10 turnos ficaram **sem outbound**:
escolha+objeção, multi-informação e Lander. Não foi fluxo/Lander.

Logs do worker:
```
llm: chamada falhou  purpose=agent_turn  provider=opencode_go
model=deepseek-v4-flash
error_message=Failed after 3 attempts. Last error:
AI_APICallError: Upstream request failed: Endpoint is unavailable.
turno: tentativa do modelo falhou  tentativa=1 max=2 retenta=false
turno: esgotou as tentativas do modelo — handoff/libera fila
```
A JEV (`typesafe/jev`) continuou respondendo; só o modelo do turno caiu.

## 2. Causas

1. **Upstream do provedor indisponível.** Erro externo, não regra de fluxo.
2. **Erro classificado como NÃO-retentável.** O `retentavel()` de
   `turno-com-resiliencia.ts` não reconhecia `Endpoint is unavailable` nem
   `AI_APICallError`; então o turno desistia na 1ª tentativa externa
   (`retenta=false`) em vez de tentar novamente.
3. **Turno superado por inbound mais nova.** O harness manda a próxima
   mensagem 25s depois; se o turno anterior ainda está no retry/timeout, o
   motor (corretamente, por desenho) não envia a contingência
   (`haInboundMaisNova`) — o turno antigo é abandonado. No teste isso virou
   silêncio de 4min; o próximo turno é que recebe resposta.
4. **Sem preflight/fallback de provedor.** O teste começa sem checar o endpoint
   e sem provedor secundário; uma indisponibilidade derruba o turno.

## 3. Correção implementada e testada (simulando o erro)

- `lib/agent-engine/agent/turno-com-resiliencia.ts`: `retentavel()` agora
  reconhece `unavailable`, `upstream request failed`, `service unavailable`,
  `bad gateway` e `gateway timeout` como transitórios.
- `turno-com-resiliencia.test.ts`: teste novo com a string real
  `AI_APICallError: ... Endpoint is unavailable`.
  - **ANTES:** falhava (devolvia `null`, 1 tentativa, `aoEsgotar`).
  - **DEPOIS:** 6/6 verdes; tenta 2x e devolve a resposta da 2ª.
- `tsc` 0; sem mudança de fluxo/catálogo/handoff.

## 4. Correções pendentes (propostas com teste)

### 4.1 Preflight do provedor no teste pesado
- Chamar o modelo exato do agente com prompt mínimo; exigir 2xx e latência.
- Se falhar, não iniciar o pesado; registrar e aguardar.
- Teste: endpoint simulado indisponível → o harness aborta antes do turno 1.

### 4.2 Fallback + circuit breaker do `agent_turn`
- Secundário configurável (mock determinístico para funcional; provedor estável
  para smoke). Primário 5xx/timeout → secundário; breaker após N falhas.
- Teste: força 503 no primário e verifica que o turno responde pelo secundário.

### 4.3 Contingência com entrega garantida
- Teste de integração: modelo esgota **sem inbound mais nova** → uma mensagem
  determinística ao cliente + job retryável + fluxo ativo pendente.
- Se houver inbound mais nova, o turno antigo não deve prometer resposta; a
  próxima rodada responde. Medir o tempo de silêncio.

### 4.4 Harness fiel ao turno
- Esperar o turno/checkpoint/operador terminar (não só a 1ª bolha) e usar
  intervalo humano (45–60s) antes da próxima mensagem; repetir turno falho em
  vez de mandar o próximo por cima.
- Sem isso, o próprio teste provoca “turno superado”.

### 4.5 Pesado em duas camadas
- **Funcional:** modelo mock/determinístico; valida fluxo, Lander, catálogo,
  nome, contagem, handoff e persistência.
- **Smoke real:** poucos turnos no 5924, com preflight e retry; sem Datafy.

## 5. Aceite
- Falha forçada de upstream → retry externo; se esgotar, **uma** contingência
  ao cliente e job não perdido.
- Fluxo ativo continua pendente.
- Pesado: 10/10 turnos com outbound ou contingência; zero silêncio >60s.
- Lander correta com e sem fluxo ativo.
- Sem Datafy; restaurar tudo ao final.

## 6. Estado
- Correção do retry: **verde** no teste unitário (6/6), `tsc` 0.
- Deploy: **pendente**.
- Pesado completo: **pendente** de provedor estável/preflight.
- Ambiente: Datafy `open`, agente 84, 0101 allowlist 2501, 5924 limpo.

## 7. Fechamento desta rodada

- Correção do retry commitada em **`30633f78`** e implantada (worker jevfix39,
  app/scheduler recriados; health `30633f78`).
- Teste que simula o erro: **6/6** verdes; `tsc` 0; lint 0 erros.
- Ambiente de teste restaurado: Datafy `open`, agente 84, 0101 allowlist 2501,
  5924 limpo; sem crédito Datafy.
- Pesado completo ainda **não** repetido; os pontos pendentes (preflight,
  fallback, contingência integrada e harness esperando o turno inteiro) estão nas
  seções 4.1–4.5.

## 9. Investigação do provedor — 2026-10-21

**Sonda direta** (`runModelCall`, mesma credencial `opencode_go`, org e40dc035,
sem WhatsApp/Datafy):

| modelo | resultado |
|---|---|
| `deepseek-v4-flash` (agente) | ✅ ok, ~7,7s (também falhou 1x antes: intermitente) |
| `deepseek-v4.1-flash` (auxiliares) | ❌ `Endpoint is unavailable` consistente |
| `glm-5.1` | ✅ ok, ~1,7s |
| `gpt-5.6-luna` | ❌ protocolo não suportado |

**Configuração da org:**
- `organizations.settings.llm.default_model = deepseek-v4.1-flash`;
- `ai_agent_versions` do agente 84 = `opencode_go/deepseek-v4-flash`;
- `jailbreak_detect`, `stage_classifier` (fallback), `flow_validate`,
  `checkpoint`, `compaction`, `promise_semantic`, `followup_*` estão todos
  bound em `opencode_go/deepseek-v4.1-flash`;
- os pontos `*__jev` usam `typesafe/jev-latest` e seguem funcionando.

**Conclusão:** o turno 3/7/8 do pesado morre **antes do agente**, no
`jailbreak_detect` (e pode morrer no checkpoint), porque o modelo auxiliar
`deepseek-v4.1-flash` está indisponível. O `chamarTurnoComResiliencia` só envolve
o `agent_turn`; o retry `30633f78` não cobre os auxiliares. O harness depois manda
outra mensagem; o turno é superado e não há contingência.

**Correções pendentes (não aplicar em produção sem o dono):**
1. Trocar `default_model`/bindings auxiliares para `glm-5.1` (ou
   `deepseek-v4-flash` se estabilizar) e testar `jailbreak_detect` real.
2. Adicionar fallback de modelo para TODOS os `runModelCall` auxiliares (não só
   `agent_turn`) ou um resolvedor de fallback por purpose.
3. Preflight por purpose antes do pesado.
4. Harness esperando o turno inteiro; repetir turno falho.
5. Repetir o pesado funcional com mock e o smoke real com o modelo escolhido.

## 10. Causa verdadeira — sonda HTTP (2026-10-21)

A sonda capturou o **corpo HTTP real** dos dois endpoints da OpenCode:

| Endpoint | Modelo | HTTP | Corpo |
|---|---|---|---|
| Go `/zen/go/v1` | `deepseek-v4.1-flash` | **429** | `Upstream request failed: Endpoint is unavailable.` |
| Go `/zen/go/v1` | `deepseek-v4-flash` | **503** | `Upstream request failed: Endpoint is unavailable.` |
| Go `/zen/go/v1` | `glm-5.1` | **200** | respondeu “Ok” em ~1,4s |
| Zen `/zen/v1` | `deepseek-v4.1-flash` | **402** | `Insufficient account funds` |
| Zen `/zen/v1` | `deepseek-v4-flash` | **403** | `Model access is disabled` |
| Zen `/zen/v1` | `glm-5.1` | **403** | `Model access is disabled` |

**Interpretação:** não é formato, prompt nem código. O formato está correto —
`glm-5.1` no MESMO endpoint Go responde 200. O upstream da DeepSeek está
**429/503** (rate limit/indisponível), e a conta não tem acesso/fundos no Zen.
A credencial é Go; Zen não deve ser usada.

**Por que “antes funcionava”:** o upstream da DeepSeek estava saudável; agora
está instável/limitado. O `deepseek-v4-flash` chegou a responder 1x na sonda e
falhou outras — é intermitente. `deepseek-v4.1-flash` está 429 consistente.
O `glm-5.1` está estável.

**Impacto em produção:** o agente 84 e os auxiliares usam DeepSeek; a
instabilidade pode deixar turnos sem resposta (jailbreak/checkpoint/agent).
Correção recomendada: usar `glm-5.1` para o teste e fallback; ou trocar os
bindings/default e o modelo do agente após validar. Não trocar a credencial
para Zen (402/403).

## 11. Correção da conclusão — teste simples controlado (2026-10-21)

Teste HTTP direto, corpo mínimo, com e sem o campo `thinking` que o provider
injeta nos modelos DeepSeek:

| Modelo | thinking | HTTP | Resultado |
|---|---|---:|---|
| `deepseek-v4-flash` | sem | 200 | respondeu (reasoning; content curto) |
| `deepseek-v4-flash` | **`{type:"disabled"}`** | **200** | `content:"ok"` em ~1,5s |
| `deepseek-v4.1-flash` | sem | **429** | `Endpoint is unavailable` |
| `deepseek-v4.1-flash` | **`{type:"disabled"}`** | **429** | `Endpoint is unavailable` |
| `glm-5.1` | sem | 200 | ok ~1s |

**Conclusão corrigida:** o formato NÃO é o problema — o mesmo campo `thinking`
que o app envia funciona no `deepseek-v4-flash` (200 + “ok”). O problema é
**modelo-específico e intermitente**: `deepseek-v4.1-flash` respondeu 200 numa
sonda anterior e agora 429 consistente; `deepseek-v4-flash` está 200 no momento.
O `deepseek-v4.1-flash` é justamente o **default e o modelo dos auxiliares**
(`jailbreak_detect`, `checkpoint`, `flow_validate`, etc.). O `glm-5.1` está
estável.

**Ação recomendada:** trocar default/auxiliares de `deepseek-v4.1-flash` para
`glm-5.1` (ou `deepseek-v4-flash`, que está respondendo) e validar o
`jailbreak_detect` real. Não é necessário mexer no formato/`thinking`; manter.

## 12. Correção via UI (não no código) e teste simples — 2026-10-21

**Feito na configuração da UI/org (sem escolher modelo no código):**
- `organizations.settings.llm.default_model`: `deepseek-v4.1-flash` →
  **`deepseek-v4-flash`**;
- 9 `ai_purpose_bindings` de `opencode_go` que estavam em
  `deepseek-v4.1-flash` → **`deepseek-v4-flash`**: checkpoint, compaction,
  flow_summary, flow_validate, followup_classify, followup_decide_timing,
  jailbreak_detect, promise_semantic, stage_classifier.
- JEV (`typesafe/jev`) e o agente 84 (`deepseek-v4-flash`) não mudaram.

**Teste simples ao vivo (5924, sem Datafy):**
- “Oi, boa tarde! Queria ver as motos.” → bot respondeu, pediu critério, sem
  fotos.
- `llm_calls` do turno:
  - `jailbreak_detect` → `opencode_go/deepseek-v4-flash`;
  - `agent_turn` → `opencode_go/deepseek-v4-flash`;
  - `checkpoint` → `opencode_go/deepseek-v4-flash`;
  - `operator_turn` → `opencode_go/deepseek-v4-flash`;
  - nenhum `deepseek-v4.1-flash`.

**Conclusão:** a seleção de modelo agora vem da configuração da UI; o código
continua só com o retry genérico e as regras de fluxo. Não foi adicionado
fallback/modelo hardcoded. O ajuste `thinking` por família DeepSeek é
pré-existente e não escolhe modelo; se o dono quiser, pode ser removido/movido,
mas não foi mexido nesta rodada.
Ambiente restaurado: Datafy `open`, agente 84, 0101 allowlist 2501, 5924 limpo;
sem crédito Datafy.

## 13. Preflight da UI — 2026-10-21 (verde)

Lendo os `ai_purpose_bindings` da UI (sem hardcode de modelo), os 9 purposes
`opencode_go` estão em `deepseek-v4-flash` e todos responderam 200:

`checkpoint`, `compaction`, `flow_summary`, `flow_validate`,
`followup_classify`, `followup_decide_timing`, `jailbreak_detect`,
`promise_semantic`, `stage_classifier`.

`promise_semantic` foi o mais lento (~49s); os demais ~1,3–1,9s. Preflight do
agente/auxiliares: **ok**. Próximo: pesado com o harness esperando o turno
inteiro (não só a primeira bolha).

## 14. Pesado pós-UI — 2026-10-21

**9/10 turnos OK.** O modelo configurado na UI (`deepseek-v4-flash`) funcionou em
todos os auxiliares do preflight e nos turnos 1, 2, 4–10. O único silêncio foi o
turno 3 (escolha + objeção), e **não foi o DeepSeek**:

- `send_message` recusado: “send_message após apresentação automática — recusado
  (anti-duplicação)” (primeiro envio);
- o agente chamou `open_human_case` (caso “Analisar condição de preço na CB 300 R
  2011”);
- a JEV classificou o texto final como **narração interna** (`ehNarracao: true`);
- o motor bloqueou o envio (`envio do motor bloqueado — a Jev detectou narração
  interna`) e **não mandou contingência**; `messages_sent=0`;
- o turno 4 respondeu à objeção; o caso ficou `awaiting_human`.

**Passaram:** genérico (sem nome, 0 fotos), cidade (5, sem V-Strom, sem “outras
marcas”), objeção persistente, ver mais (3), nome (“Prazer, Letícia”, sem
contradição), multi-informação (sem fluxo), Lander (5 trail, sem Qualificação),
troca+financiamento (Troca ativa + Financiamento na fila) e handoff (comportamento
atual).

**Pendência nova/real:** quando o único envio do modelo é vetado por
anti-duplicação/narração, o motor precisa mandar **contingência determinística**
(ou liberar o texto válido de transferência) e não deixar o cliente mudo. É o
item 4.3 na prática; o caso humano já foi aberto, então a mensagem de transferência
é legítima.

Ambiente restaurado: Datafy `open`, agente 84, 0101 allowlist 2501, 5924 limpo;
UI segue `deepseek-v4-flash`; sem crédito Datafy.

## 15. Continuidade — pesado pós-anti-duplicação (2026-10-21 ~04h)

**Pré-condições medidas:** app/worker/scheduler em `94ba686e`; preflight dos 9
purposes `opencode_go` verde (`deepseek-v4-flash`, ~1,3–1,9s); agente 84
(versão `dea42fb8`, canal 2501) com versão temporária 85 vinculada ao 0101;
allowlist 0101 = 2501 + 5924; contato 5924 limpo antes do teste.

**Pesado completo (10 turnos, harness esperando o turno + 45s de silêncio):**
**10/10 turnos com outbound**, nenhum silêncio. Artefatos:
`.test-artifacts/heavy-dup-01..10.json`.

- **Turno 3 (escolha + objeção), antes mudo:** agora responde à objeção, manda
  as fotos da CB 300 R e pergunta a faixa de valor. Correção `94ba686e`
  confirmada ao vivo.
- **Regressão medida no turno 2 (cidade):** saíram **dois fechos** —
  "Alguma delas é a sua praia...?" e "Desculpa, ficou faltando uma coisa: qual
  dessas você quer que eu te conte mais?". O anti-duplicação passou a liberar
  qualquer texto novo, não só resposta de objeção.
- **Correção aplicada:** a 2ª bolha de texto após a apresentação automática só
  passa quando há objeção/negociação no turno (`faseObjecaoTurno`/
  `motivoNegociacao`, estado decidido pela JEV). Fora disso, continua barrada.
  Teste de trava em `multi-pergunta-uma-mensagem.test.ts`.
- **Validação em worker temporário (fonte local, prod parado e restaurado):**
  turnos 1–3 — turno 2 voltou a **7 bolhas / 1 fecho**; turno 3 continua
  respondendo com fotos e pergunta. Artefatos: `heavy-fix-01..03.json`.
  `tsc` 0; `vitest` dos dois arquivos: **10/10**.
- **Turno 10 (handoff):** responde e transfere, mas ainda pergunta "Qual moto
  você pretende dar na troca?" depois de dizer que passa para o consultor —
  comportamento pré-existente (também no `heavy-ui-10`); não alterado, pois
  handoff é decisão do dono.

**Estado:** ambiente restaurado (agente 84 na 2501, versão 85 removida,
allowlist 0101 = 2501, 5924 limpo, worker de prod healthy na `94ba686e`).
**A correção do 2º fecho está no working tree, NÃO commitada nem implantada.**

**Pendências que continuam:** 4.2 fallback/circuit breaker dos auxiliares
(hoje só `agent_turn` tem retry), 4.5 pesado em duas camadas (mock + smoke),
decisão do dono sobre o handoff e sobre commit/deploy desta correção.
