# HANDOFF — Estado atual + Escopo 9 (combinar interesse + critério novo)

> Documento de CONTINUIDADE. Escrito em 2026-10-15. Leia isto primeiro.
> Repo: `/root/DeskcommCRM` · branch: `feat/fluxos-de-atendimento`.

---

## 1) Estado ATUAL (o que já está feito, commitado e no ar)

- **Deploy no ar:** versão **`e931f588`** (app/worker/scheduler healthy).
- **HEAD = origin = `e931f588`** (árvore limpa). Commits de hoje, do mais novo ao mais antigo:
  - `e931f588` — fecho após a escolha (não repergunta "qual chamou mais atenção")
  - `b700a465` — revert do 7a/7c (mantém margem +30% e ordem numérica por proximidade); mantém 7b
  - `8514d67d` — doutrina atualizada (7 violações [A] corrigidas)
  - `5ff07228` — Escopo 6 (`pergunta_do_fluxo`)
  - `d34cac7a` — Escopo 5 (`flow_intent`)
  - `5e467d6b` — Escopo 4 (`modelo_categoria`)
  - `fc1122d8` — Escopo 3 (`catalog_criteria`)
  - `19bade25` — Escopo 2 (`offer_motos`)
  - `70bd384f` — Escopo 1 (`moto_escolhida`)
  - `1e3ff077` / `2eea79b9` — docs
- **Suíte:** `vitest run lib/agent-engine lib/followup lib/ai` = **1456/1456 verde**; `tsc` 0; `lint` 0 erros.
- **Fase 0 (timeout):** `.env` com `JEV_TIMEOUT_MS=30000`, `JEV_CAP_TOTAL_MS=200000`,
  `JEV_MAX_TENTATIVAS=12`, `JEV_COOLDOWN_MS=30000` (breaker 30s).
- **Plano completo:** `docs/propostas/PLANO-JEV-ESCOPOS.md` (escopos, sondas, ANTES/DURANTE/DEPOIS).
- **Doutrina:** `docs/doctrine/jev-decide-sempre.md` (seção "Violações pendentes" atualizada).

### O que os fixes de hoje fizeram (resumo)
- **Escopo 1 `moto_escolhida`:** os gates de regex (`bloqueiaEscolha`, `temReferenciaAMoto`,
  `ehPedidoDiferente`) deixaram de BARRAR a Jev — viraram **sinais no contexto**. Prompt ganhou
  "SEM REFERÊNCIA" e "ÚNICA EM FOCO". Sonda: "me interessei" (1 candidata) → a moto.
- **Escopo 2 `offer_motos`:** a continuação da fila é da Jev (regex só fallback); `nomeMotoEmFoco` +
  "REGRA DA MOTO EM FOCO".
- **Escopo 3 `catalog_criteria`:** o extrator roda pelo veredito da Jev (`turnoDeCatalogo`), não por regex.
- **Escopo 4 `modelo_categoria`:** prompt com conhecimento de modelos ("Lander"→Trail). A referência
  `modelos` é **DADO** do cliente e permanece 1ª.
- **Escopo 5 `flow_intent`:** veredito negativo (`ok:true`+`[]`) não cai no regex; binding Jev lido antes do
  gate de modelo de chat.
- **Escopo 6 `pergunta_do_fluxo`:** a negociação virou **contexto** (`emNegociacao`), não gate.
- **Fecho após escolha:** `brief-do-turno.ts` e `atendimento.ts` ganharam `temEscolha`; com moto escolhida,
  o fecho é o de **AQUISIÇÃO** (à vista/financiado/cartão/troca), não "qual delas chamou mais atenção".

---

## 2) Escopo 9 — COMBINAR interesse + critério novo (NÃO IMPLEMENTADO)

### 2.1 A solicitação do dono (verbatim)
> "o sistema tem capacidade de entender a moto de interesse e unir com outras opções do estoque? por
> exemplo: o cliente pede uma CB 300 mas por algum motivo ele pergunta se tem alguma até 17 mil. Ele
> mostra as CB até 17 mil ou inferiores ou aproximados e pergunta se ele deseja ver outros modelos nesse
> valor? Se não tem deveria conseguir fazer isso também. E lembre tudo isso é Jev primeiro."

### 2.2 O comportamento medido ao vivo (o defeito)
Jornada testada (WAHA 0101 → bot 2501):
- **"Vocês têm uma CB 300?"** → mostrou os CB (CB 300 R, CB 300 R FLEX, CB 300 F Twister, CBX 250
  Twister, CB 500 X). **Certo.**
- **"E tem alguma até 17 mil?"** → mostrou **TODOS os modelos ≤17 mil** (Factor 125, Neo 125, NMax 160,
  Biz 125, …) — **PERDEU a CB**. **Errado.**

### 2.3 A causa raiz (dos logs, `catalog: critérios extraídos` do turno "até 17 mil")
```
intencao: "pedido"          <-- A JEV CLASSIFICOU COMO PEDIDO NOVO (não como "alternativa")
principal: "preco"
exigidos: ["preco"]
faixas: { "preco": { "max": 19500 } }
hipoteses: [ Factor 125 0.58, CBX 250 0.56, Factor 150 0.64, Neo 125 0.51 ]  <-- qualquer modelo
```
Ou seja: a Jev viu só o preço e **não recebeu a moto em foco (a CB)** como contexto — porque em
`inbound-turn.ts` (~linha 4814) a moto atual só é injetada na mensagem da extração quando
`intencaoDoTurno === 'alternativa'`. Como o turno foi classificado como `pedido`, a CB não entrou, e o
critério novo **substituiu** o interesse em vez de **combinar**.

### 2.4 O comportamento DESEJADO (regra do dono)
1. **Âncora preservada:** com uma moto em foco e o cliente adicionando um critério numérico (preço/cc/ano),
   a busca é **interesse ∩ critério** — mostra as **CB até 17 mil** (as que encaixam ≤17 mil, do maior pro
   menor), depois as da margem (≤19.5k) pela mais próxima.
2. **Broaden explícito (Jev decide):** se o filtro esvaziar (ou sobrar pouco), a Jev decide oferecer
   **outros modelos naquele valor**, e o motor **pergunta** isso ("quer ver outros modelos nesse valor?").
3. **Limite duro:** nunca trazer muito acima do teto (um "até 17 mil" NÃO vira "até 95 mil").
4. **Jev primeiro:** quem decide a intenção (é continuação do interesse, com um teto novo) é a JEV
   (`catalog_criteria`), não um regex no motor.

### 2.5 Onde mexer (pontos prováveis)
- **`lib/ai/jev/pontos/catalog-criteria.ts`** — o ponto `catalog_criteria`. A pergunta `intencao` hoje é
  `pedido` | `alternativa` | `nenhum`. Precisa que "e tem alguma até 17 mil?" (com moto em foco) seja lido
  como **alternativa** (continuo querendo a CB, agora com teto), e que a **família/modelo da moto em foco**
  entre como exigência/hipótese junto do preço.
- **`lib/agent-engine/agent/inbound-turn.ts`** (~4814, o call do `extrairCriterios`): hoje a moto atual só
  entra na mensagem se `intencaoDoTurno === 'alternativa'`. Precisa entrar **sempre que há moto em foco**,
  como CONTEXTO (a Jev decide) — cuidado com o comentário histórico de "a IA copiar o nome errado".
- **`lib/agent-engine/agent/selecao-por-intencao.ts`** — a combinação interesse ∩ critério (a âncora/família
  + a faixa de preço). E o "broaden" quando o filtro esvazia.
- **`lib/agent-engine/agent/fecho-do-turno.ts` / `mais-opcoes.ts`** — a pergunta de "quer ver outros modelos
  nesse valor?" quando o filtro esvaziou (hoje há `perguntaDeEscolha`, `perguntaDeMaisOpcoes`,
  `perguntaDeAquisicao`).

### 2.6 Protocolo obrigatório (não negociável)
- **Sondar a Jev ANTES** (formato real): usar `alvosDeJevDaOrg(pool, ORG, '<ponto>')` + `decidir`, como em
  `/tmp/opencode/probe.ts` (rodar com `tsx` no worker). Confirmar que a Jev classifica "e tem alguma até 17
  mil?" (com a CB em foco) como `alternativa` + mantém a família.
- **ANTES → DURANTE → DEPOIS** em cada mudança; registrar em `docs/propostas/PLANO-JEV-ESCOPOS.md`.
- **Nunca tocar na engrenagem** (turno/rajada/junção/idempotência/anti-ban/opt-out/handoff-duro).
- **`tsc` 0 + `lint` 0 + `vitest run lib/agent-engine lib/followup lib/ai` verde** antes de deploy.
- **Deploy:** `systemd-run --unit=<nome> /bin/bash /root/arquivos/scripts/validacao/subir-sem-testes.sh`
  (~15 min; acompanhar `/root/arquivos/scripts/validacao/subir-sem-testes.log`).
- **Commit + push** só quando o dono pedir; token em `/root/.docker/config.json` (base64 → `vgamkt:ghp_…`).
- **Dados de teste:** org `e40dc035-b553-4383-8aac-311d29abcfdc`; bot +5512981672501 (datafy); auxiliar
  +5512997700101 (WAHA session `org_e40dc035_088c53ac96424e2bb62c4a59cf3cc287`).
- **Ambiente de teste (harness):** ver `/tmp/opencode/live2.js` (jornada via WAHA + leitura do DB) e
  `/tmp/opencode/probe.ts` (sonda da Jev). O DB é `SUPABASE_DB_URL` (env do worker).

### 2.7 Critério de aceite do Escopo 9
Jornada ao vivo: **"CB 300"** → **"e tem alguma até 17 mil?"** deve mostrar **as CB ≤17 mil** primeiro (e as
≤19.5k pela proximidade) **e** perguntar se ele quer **outros modelos nesse valor**. Se não houver CB nesse
valor, oferece outros modelos no valor (sem trazer R$95 mil).

---

## 3) Prompt de CONTINUAÇÃO (copie e cole numa sessão nova)

```
Você continua um trabalho no repo /root/DeskcommCRM (branch feat/fluxos-de-atendimento).
LEIA PRIMEIRO: docs/propostas/HANDOFF-ESCOPO-9.md e docs/propostas/PLANO-JEV-ESCOPOS.md
e a doutrina docs/doctrine/jev-decide-sempre.md.

Contexto: hoje corrigimos as 7 violações [A] da Jev (Escopos 1–6), o fecho após a escolha,
e revertemos o 7a/7c. Tudo commitado/pushado e no ar na versão e931f588; suíte 1456/1456 verde.

Sua tarefa: implementar o ESCOPO 9 (ver §2 do HANDOFF-ESCOPO-9.md): quando o cliente tem uma
moto de interesse em foco (ex.: "CB 300") e adiciona um critério numérico (ex.: "e tem alguma
até 17 mil?"), o motor deve COMBINAR (interesse ∩ critério) — mostrando as CB ≤17 mil — e a Jev
decide oferecer "outros modelos nesse valor" quando o filtro esvazia. Tudo JEV PRIMEIRO.

Regras: sonda a Jev ANTES de mexer (formato real); ANTES→DURANTE→DEPOIS; não tocar na engrenagem;
tsc 0 + lint 0 + vitest verde antes de deploy; deploy via subir-sem-testes.sh (acompanhe o log);
não commitar/pushar sem o dono pedir.

Entregue: a implementação, os testes, a sonda antes/depois, e a validação ao vivo da jornada
"CB 300" → "e tem alguma até 17 mil?".
```
