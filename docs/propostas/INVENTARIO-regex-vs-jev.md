# INVENTÁRIO — pontos que ainda decidem por regex/palavra-chave (P2)

- **Data:** 2026-10-13 · **Repo:** `/root/DeskcommCRM` @ `dcaf95ff` (worktree) · **Branch:** `feat/fluxos-de-atendimento`
- **Origem:** `docs/propostas/STATUS-E-PENDENCIAS.md` §P2 ("por que ainda via regex?").
- **Doutrina de referência:** `docs/doctrine/jev-decide-sempre.md`.
- **Natureza deste doc:** só INVENTÁRIO (2026-10-13). **SUPERSEDIDO em parte** pela auditoria completa de
  2026-10-15 em [`PLANO-JEV-ESCOPOS.md`](./PLANO-JEV-ESCOPOS.md), que cobre os **19 pontos** e já corrigiu
  as **7 violações [A]**. Este doc fica como registro do estado anterior.

## Como ler

Classificação de cada ponto:

| Sigla | Significado | Ação sugerida |
|---|---|---|
| **[A] Autoridade** | o regex **decide sozinho** e/ou **vence** a Jev (doutrina violada) | candidato a migrar |
| **[F] Fallback** | a Jev (ou o modelo) decide **primeiro**; o regex só entra com veredito `null`/falha | saudável pela doutrina; migrar é opcional |
| **[I] Infra/formato** | não é decisão de negócio (normalização, formatação, parsing, segurança) | **NÃO migrar** — é engrenagem |

Onde não houver nota, a coluna `Classe` já diz.

---

## BLOCO 1 — ENTRADA DE FLUXO por gatilho (foco do P2)

### Estado real (importante): a entrada JÁ tem caminho Jev/IA

`lib/agent-engine/agent/inbound-turn.ts:2585` chama `escolherFluxosPorIA(...)` — o classificador
`lib/agent-engine/agent/flow-intent.ts:150`. A ordem interna é: **Jev** (`flow_intent`, `flow-intent.ts:174`-`195`) →
**modelo de chat** (`buildFlowIntentPrompt`, `flow-intent.ts:43`) → **regex de palavra** só se a IA **falhar**
(`ok:false` → cai no gatilho, `inbound-turn.ts:2600`). Ou seja: no caminho principal, **a palavra-gatilho é o 3º recurso.**

| # | Local | Classe | O que faz | O que dá p/ migrar |
|---|---|---|---|---|
| 1.1 | `lib/followup/atendimento.ts:286` `melhorFluxoPorGatilho` | **[F]** | escolhe o fluxo com **mais gatilhos presentes** na mensagem (`alvo.includes(gatilho)`, substring, `atendimento.ts:297`) | usado por `escolherFluxoPeloGatilho` (1.3). No caminho de inbound já é último recurso. Só re-decidir quando a IA falha |
| 1.2 | `lib/followup/atendimento.ts:313` `fluxosPorGatilho` | **[F]** | devolve **todos** os fluxos acionados **na ordem em que o cliente citou** (posição do 1º gatilho; `indexOf`); base da fila de processos | idem: em `inbound-turn.ts:2600` só roda se `porIntencao.ok === false` |
| 1.3 | `lib/followup/atendimento.ts:1387` `escolherFluxoPeloGatilho` → usado em `inbound-turn.ts:4021` | **[F] MIGRADO (2026-10-13)** | **único uso direto** do regex como decisão: quando o modelo chama a tool `flow_start` **sem nome** e há **>1 fluxo ativo**, a engine casava pelo **assunto** por substring | **FEITO**: agora consulta a Jev (`escolherFluxosPorIA`) primeiro via `escolherFluxoIniciado` (`flow-intent.ts`); o regex só entra quando a IA não decide. Testes 6/6; DEPOIS (real) pendente |
| 1.4 | `lib/followup/atendimento.ts:259` `escolherFluxoPorNome` | **[I]** | casamento tolerante de **nome** de fluxo ("troca de moto" ≈ "troca"), exato→parcial; `null` se ambíguo | não é regex de intenção; é parsing de nome. **NÃO migrar** |
| 1.5 | `lib/agent-engine/agent/flow-intent.ts:150` `escolherFluxosPorIA` | **Já é Jev/IA** | decide **quais** fluxos iniciar e em que ordem; prompt lista os gatilhos apenas como **pistas** (`flow-intent.ts:45`) | nada a migrar — é o alvo a que os demais devem convergir |

> **Ligação com P1 (Qualificação pede "cidade"):** o prompt do `flow_intent` (`flow-intent.ts:53`) manda
> **CATÁLOGO vazio** ("quero uma moto até 20 mil" → `[]`). Se o fluxo Qualificação ainda abre por "quero uma moto",
> a causa NÃO é o regex (ele só roda se a IA falhar) — é a **IA/Jev classificando**, ou o **caminho da tool** (1.3).
> Isso reabre a hipótese de P1: talvez o conserto não seja tirar o gatilho, e sim o prompt do `flow_intent`/o passo da tool. **Confirmar antes de decidir P1.**

**Como testar 1.1/1.2 (caracterização, já coberta):** `lib/followup/atendimento.test.ts:77` e `:494`.

---

## BLOCO 2 — SINAIS DE OFERTA (`lib/agent-engine/agent/selecao-por-intencao.ts`)

Todos operam sobre `normalizarNomeDeMoto` (`fotos-do-catalogo.ts:81`, minúsculas/sem acento). São **sinais**;
o destino final é a régua do Bloco 3.

| # | Local | Classe | O que faz |
|---|---|---|---|
| 2.1 | `selecao-por-intencao.ts:889` `pedeMotoExplicito` | **[A]* ** | `VERBO_DE_PEDIDO` **e** `TERMO_DE_MOTO` (ambos regex em `:856`/`:860`); é o sinal que **vence a escolha travada** e a Jev (via Bloco 3) |
| 2.2 | `selecao-por-intencao.ts:876` `querMoto` | **[A]** | verbo **OU** termo de moto; usado como pré-filtro e no fallback final |
| 2.3 | `selecao-por-intencao.ts:870` `mencionaMoto` | **[A]** | só `TERMO_DE_MOTO`; usado para não despejar catálogo em processo |
| 2.4 | `selecao-por-intencao.ts:825` `querMaisOpcoes` | **[A]** | "ver mais/outras opções"; **vence** a Jev (`pode-oferecer-motos.ts:149`) |
| 2.5 | `selecao-por-intencao.ts:808` `querAlternativa` | **[F]** | "caro/barato/outra/mais nova/mudar…" com denylist p/ "outra loja/cidade/dia…"; único gate antes de classificar |
| 2.6 | `selecao-por-intencao.ts:846` `pedePrecoSemValor` | **[F]** | fala de preço **sem** número → instrui IA a perguntar a faixa |
| 2.7 | `selecao-por-intencao.ts:487` `TOKENS_DE_MODELO` | **[A]** | lista fixa de nomes/linhas (cb, titan, fazer…) que o freio determinístico usa para considerar "fora do pedido" |
| 2.8 | `selecao-por-intencao.ts:244` `SINONIMOS_CATEGORIA` + `:860` `TERMO_DE_MOTO` | **[I]** | vocabulário/sinônimos (trail≡trilha; marcas/modelos) | 

> **2.1–2.4 são [A]** por desenho explícito (rede de proteção, ver Bloco 3): o dono decidiu que um **pedido
> inequívoco do cliente não pode ser negado** pela Jev. Migrar = dar à Jev o poder de negar pedido claro. **Decisão de produto, não de código.**
> Candidato de migração "segura": 2.5 (`querAlternativa`) e 2.6, que **não vencem** a Jev — já são fallback.

**Testes:** `selecao-por-intencao.test.ts:96`, `:133`.

---

## BLOCO 3 — RÉGUA DA OFERTA (`lib/agent-engine/agent/pode-oferecer-motos.ts`)

Ordem em `inbound-turn.ts:3471`-`3517` (`decidirOfertaDoTurno`): (1) **rede de proteção** determinística →
(2) **veredito da Jev** (`offer_motos`) → (3) **fallback** determinístico.

| # | Local | Classe | O que faz |
|---|---|---|---|
| 3.1 | `pode-oferecer-motos.ts:193` `pedidoDeCatalogoInequivoco` (chamada `inbound-turn.ts:3490`) | **[A]** | **VENCE a Jev** (G3.10). Força oferta em: `querMaisOpcoes`; `RE_OUTRA_MOTO:158`; `RE_FAIXA_DE_PRECO:175` (`"ate 15 mil"`, G3.11); `pedeMotoExplicito`; ou cita modelo/categoria — exceto validação de moto em foco (`RE_VALIDACAO_DE_MOTO:154`), processo (`RE_PROCESSO:95`), moto própria (`RE_MOTO_DO_CLIENTE:166`) ou só-a-moto-em-foco |
| 3.2 | `pode-oferecer-motos.ts:149` `pedidoExplicitoDeMaisOpcoes` (fallback em `inbound-turn.ts:3507`) | **[A]** | força oferta só por `querMaisOpcoes`; vence a Jev |
| 3.3 | `pode-oferecer-motos.ts:217` `podeOferecerMotos` (fallback em `inbound-turn.ts:3509`) | **[F]** | régua completa do fallback determinístico (só quando Jev `null`): usa 2.1–2.6 + estado de objeção |
| 3.4 | `pode-oferecer-motos.ts:98` `ehIntencaoDeProcesso` (`RE_PROCESSO:95`) | **[F]** | financiar/trocar/consignar/vender ≠ catálogo |
| 3.5 | `pode-oferecer-motos.ts:81` `clienteRejeitouMoto` | **[F]** | "não gostei/não era essa/quero outra" → ofertar outra é legítimo |
| 3.6 | `pode-oferecer-motos.ts:51` `fluxoBloqueiaOferta` | **[I] — CÓDIGO MORTO** | o G3.6 removeu o uso (nota do STATUS). Só limpar |

> **3.1/3.2 são a "rede de proteção" [A]** — violação consciente e documentada (G3.10/G3.11) da doutrina
> "Jev decide sempre". Migrar exige mover a regra para o **prompt** `perguntaDeOfertaJev`. É decisão do dono,
> e a última medição (2026-10-12/13) mostrou que **sem** a rede a Jev nega pedido claro.

**Testes:** `pedido-de-catalogo.test.ts`, `pode-oferecer-motos.test.ts`.

---

## BLOCO 4 — OBJEÇÃO (`lib/agent-engine/agent/objecao-de-valor.ts`)

| # | Local | Classe | O que faz |
|---|---|---|---|
| 4.1 | `objecao-de-valor.ts:229` `ehObjecaoValor` | **[F]** | detecta objeção de preço/qualidade (formas com/sem "caro") |
| 4.2 | `objecao-de-valor.ts:201` `ehPedidoDiferente` | **[F]** | "outra cor/mais nova/mais barata"; exclui "outra loja/dia/cidade" |
| 4.3 | `objecao-de-valor.ts:50` `motivoDaObjecao` | **[F]** | tipo `preco/km/ano/outro` |
| 4.4 | `objecao-de-valor.ts:84` `motivoObjecaoFinal` | **já respeita a doutrina** | Jev primeiro; regex só se `null` (não "melhora" veredito) |
| 4.5 | `objecao-de-valor.ts:101` `faseDoTurno` `:128` `clienteConfirmouVer` `:144` `clienteNegouVer` `:264` `ehPedidoDesconto` `:160` `valorCitado` | **[F]/[I]** | fase/contagem, confirmação/negação de ver opções, desconto, extração de valor |

> Já **majoritariamente conforme**: há ponto Jev `objecao` (`objecao-jev.ts`) e `motivoObjecaoFinal` respeita a hierarquia.
> Migração fina = pontos `clienteConfirmouVer`/`clienteNegouVer` (fala de confirmação), hoje só regex.

**Testes:** `objecao-de-valor.test.ts`.

---

## BLOCO 5 — HANDOFF por palavra

| # | Local | Classe | O que faz |
|---|---|---|---|
| 5.1 | `human-handoff.ts:55` `HUMAN_HANDOFF_PATTERNS` + `:63` `detectHumanHandoffRequest` | **[A]** | regex PT-BR dura ("falar com atendente"), roda **ANTES do modelo**, custo zero de LLM |
| 5.2 | `agent-config.ts:327` `matchesHandoffKeyword` | **[A]** | keywords **configuradas na tela**, substring simples; soma-se ao 5.1 |
| 5.3 | `inbound-turn.ts:2809`-`2815` | **[A]** | onde 5.1/5.2 disparam: abre **caso** (não silencia mais). Efeito colateral agora é suave |

> **[A] com justificativa de infra**: handoff é **exigência fiscalizada da Meta** (`human-handoff.ts:3`-`4`) e roda
> antes do LLM de propósito (não gastar turno). Migrar para a Jev **adiciona latência/custo** ao caminho de segurança.
> Recomendação: **manter**; no máximo a Jev como **refinamento** (não substituição).

---

## BLOCO 6 — OUTROS (STATUS §P2)

| # | Local | Classe | O que faz | Migrar? |
|---|---|---|---|---|
| 6.1 | `dados-do-lead.ts:29` `extrairDadosDoTexto` (`RE_CPF:23`, `RE_DATA:24`, `RE_CNH:25`-`26`) | **[I]** | captura determinística de CPF/data/CNH para `custom_fields` (LGPD: campo anonimizável) | **NÃO** — parsing estruturado; LLM pioraria a precisão |
| 6.2 | `similaridade.ts:27` `extrairCilindrada`, `:70` `extrairPrecoDoPedido`, `:124` `numeroDaCelula`, `:176` `relevanciaDoNome`, `:228` `ordenarSimilares` | **[I]** | **ordenação/ranking** numérico e textual do catálogo | **NÃO** — é cálculo, não decisão de negócio |
| 6.3 | `projecao.ts:133` `TRADUCAO_DE_ERRO`, `:202` `chaveDeErro`, `:212` `chaveDeIdentificador` | **[I]** | allowlist/denylist de vazamento (`*_id`, erro→frase) | **NÃO** — guardrail de segurança |
| 6.4 | `split-message.ts:7` `splitIntoBubbles`, `:56` `splitSentences` | **[I]** | quebra em bolhas (formato) | **NÃO** — formato do canal |

---

## RANKING — o que dá pra migrar (proposta para deliberação do dono)

| Prioridade | Item | Classe | Esforço | Risco | Por que |
|---|---|---|---|---|---|
| **1** | **1.3** — `flow_start` sem nome (desambiguação por gatilho, `inbound-turn.ts:4021`) | **[A]→[F]** | baixo | baixo | **IMPLEMENTADO 2026-10-13** (Jev primeiro; regex só se a IA não decidir). Falta DEPOIS (real) |
| 2 | **2.5** — `querAlternativa` (`selecao-por-intencao.ts:808`) | **[F]** | médio | médio | Já é fallback; mover para a Jev reduz o "último recurso" e o falso-positivo histórico ("outra loja") |
| 3 | **4.5** — `clienteConfirmouVer`/`clienteNegouVer` | **[F]** | médio | baixo | Fala social; hoje só regex. Ponto Jev `objecao` já existe — dá para estender |
| 4 | **1.1/1.2** — `melhorFluxoPorGatilho`/`fluxosPorGatilho` | **[F]** | baixo | baixo | Só remover o 3º recurso quando a IA falha **OU** mantê-lo como rede (não decidir na palavra) |
| — | **2.1–2.4 e 3.1/3.2** — rede de proteção da oferta | **[A]** | alto | **alto** | Migrar = deixar a Jev **negar pedido claro**. Foi exatamente o defeito do G3.10 (2026-10-12). **Não migrar sem mudar o prompt dela e re-validar ao vivo** |
| — | **5.1/5.2** handoff · **6.x** infra | **[A]/[I]** | — | — | Manter (segurança/infra/parsing) |

## Pergunta ao dono (decisão antes de qualquer código)

1. Aprova a **prioridade 1** (migrar só a desambiguação do `flow_start`, item 1.3)? É o único ponto **[A]** de fluxo e o mais barato.
2. A rede de proteção da oferta (**2.1–2.4, 3.1, 3.2**) **fica ou migra**? Migrar exige reforçar `perguntaDeOfertaJev` + re-validar ao vivo (foi o motivo de o G3.10 existir).
3. Handoff por palavra (**5.1/5.2**) fica como está (recomendado) ou vira refinamento pela Jev?

> Nada foi implementado. Aguardando decisão.
