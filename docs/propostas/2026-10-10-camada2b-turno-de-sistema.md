# Camada 2-B — Turno de SISTEMA (mensagem de fluxo separada)

- **Data:** 2026-10-10 · **Status:** DESENHO (não implementado)
- **Base:** `/root/DeskcommCRM` @ `dcaf95ff`

## 1. O problema (o que existe hoje)

Quando um **fluxo de atendimento** está ativo e tem uma **pergunta pendente** (ex.:
"Qual seu CPF?"), quem força essa pergunta a sair é o **motor**, dentro do **turno de
venda**:

- a pergunta do fluxo entra no **mesmo turno** que o catálogo/skills/venda;
- se o modelo não escreveu a pergunta, o motor **reenvia** a pergunta por conta
  própria (a "trava da pergunta", `inbound-turn.ts` ~7151–7257);
- resultado: **duas responsabilidades no mesmo turno** (venda × roteiro do fluxo),
  que competem e às vezes se misturam.

## 1.1 REQUISITOS QUE NÃO PODEM QUEBRAR (o porquê das regras — do dono)

Estas regras existem porque, antes, ao entrar num fluxo o bot:
- tentava **concluir o fluxo INTEIRO** de uma vez e **se perdia**;
- deixava de **vender moto** e de **responder o que o cliente perguntava**;
- e podia **se perder durante OU depois** do fluxo.

Portanto, a Camada 2-B **tem de preservar**:
1. **Uma pergunta de fluxo por vez** (nunca despejar o roteiro inteiro).
2. **Responder o cliente** (venda/conhecimento) mesmo com fluxo ativo — a resposta de
   venda **não** é descartada pelo roteiro.
3. **Não se perder**: concluído o fluxo, a conversa volta ao normal; nada trava.
4. **Vários fluxos ao mesmo tempo** continuam suportados (fila de fluxos — já existe).

## 2. Objetivo (o modelo do dono)

A **mensagem de sistema** causada por fluxo deve sair em um **TURNO SEPARADO**:

1. **sem cache**;
2. carregando **SÓ as regras inegociáveis** (nada de skill de venda, catálogo, RAG);
3. lendo o **contexto total**, com **ênfase no que FALTA responder**;
4. **reescrevendo/unificando** numa única resposta natural;
5. entregue ao cliente pela mesma cadeia de envio (os guardrails de proteção ficam).

## 3. Desenho

### 3.1 Quando dispara (o "turno de sistema")
Um **job próprio** (kind novo, ex.: `flow_system_turn`) é enfileirado quando:
- um fluxo **inicia** e tem pergunta pendente; OU
- a mensagem do cliente **não responde** a pergunta pendente (o validador do fluxo
  diz "nada foi respondido") e a pergunta ainda **não saiu** neste turno.

Ele **não** roda o turno de venda.

### 3.2 O que ele monta (contexto MÍNIMO)
- **System:** apenas o **bloco do fluxo** (pergunta pendente + "só isso") + as
  **regras inegociáveis** (as mesmas da reescrita: não se dizer IA, não prometer,
  não inventar, 2ª pessoa). **Sem** persona de venda, sem catálogo, sem RAG, sem skills.
- **Mensagens:** o **histórico recente** do cliente + o **pendente** explicitado.
- **Sem cache** (prefixo volátil; é chamada curta).

### 3.3 O que ele faz
- Uma única chamada ao modelo pedindo: *"unifique numa mensagem natural, com ênfase
  no que FALTA responder; se a pergunta pendente ainda não foi respondida, faça-a"*.
- Passa pela cadeia `before_send` (guardrails de proteção continuam) e envia **1 bolha**.

### 3.4 O que sai do turno de venda
- O motor **para de reenviar** a pergunta do fluxo (sai a "trava" — hoje G3.7).
- O turno de venda **não carrega** a pergunta pendente do fluxo como obrigação.
- Se o cliente responder a pergunta, o **validador do fluxo** grava (como hoje) e o
  turno de venda segue normal.

## 4. Arquivos/peças envolvidas
- Novo job/handler: `workers/agent-worker` + `lib/agent-engine/agent/` (novo módulo
  `flow-system-turn.ts`), reusando `runModelCall` + `before_send`.
- Gatilho: no `inbound-turn.ts` (enfileirar o job) e no `iniciarFluxoDeAtendimento`.
- `reescrever-complementar.ts` (regras inegociáveis) passa a ser reusado aqui.
- Remover a "trava da pergunta" (G3.7) do turno de venda.

## 5. Teste completo — ANTES × DEPOIS

**Cenário (real, pelo nº de teste):**
1. `quero financiar uma moto` → o fluxo **Financiamento** inicia (pergunta: CPF).
2. `bom dia, tudo bem?` (não responde ao CPF) → o pendente continua.

**Medições por passo:** nº de bolhas do bot, texto, qual turno processou, tokens
(`llm_calls`), latência, e se vazou "nota interna"/outro idioma.

| # | Observação | ANTES (esperado) | DEPOIS (esperado) |
|---|---|---|---|
| 1 | Quem pergunta o CPF | turno de **venda** (com skills/catálogo no contexto) | turno de **sistema** (contexto mínimo) |
| 2 | Pergunta reenviada pelo motor se o modelo não inclui | **sim** (trava do motor) | **não** (o turno de sistema é o dono) |
| 3 | Contexto do turno que pergunta | ~10k+ tokens (ystem+opening+skills) | mínimo (só regras + pendente) |
| 4 | Duplicação | evitar (Camada 2 já cobre) | evitar |
| 5 | Regras inegociáveis | aplicadas | aplicadas |

**Critério de aceite:** no DEPOIS, a pergunta do fluxo sai por um turno com contexto
mínimo (sem skills/RAG/catálogo) e **o motor não reenvia** mais a pergunta; 0 regressão
nos 414 testes; sem loop/timeout.

## 6. ANTES — medição real (2026-10-10, `dcaf95ff`)

Cenário: `quero financiar uma moto` → `bom dia, tudo bem?`.

- **Turno 1** (inicia o fluxo): skills carregadas = `[catalogo-apresentacao, financiamento,
  qualificacao]`; `opening=14832 chars`; `skill_bodies=6666`.
- **Turno 2** (não responde ao CPF): o bot **re-pergunta o CPF** ("Para o financiamento,
  pode me passar seu CPF?") **no turno de venda**; skills `[financiamento, qualificacao]`,
  `opening=8977`, `sys=9878`, `skill_bodies=2320`.
- `flow-validate` ×7 — *"a Jev diz que nada foi respondido — sem chat"*.
- Bolhas por turno: 1 (sem duplicação). Latências: 30,7s e 29,1s.

**Conclusão do ANTES:** a pergunta do fluxo é conduzida pelo **turno de venda**, com
catálogo e skills de venda no contexto — exatamente o que a Camada 2-B quer separar.

## 7. DEPOIS — alvo (a implementar)
Um turno de sistema com `system` = só regras inegociáveis + bloco do fluxo (sem catálogo/
skills/RAG), contexto total com ênfase no pendente, 1 bolha, e o motor **sem** a trava da
pergunta. Medição a refazer no mesmo cenário (a tabela §5 vira a régua).
