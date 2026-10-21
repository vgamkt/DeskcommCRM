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
