# Certificação — Fase 4 (critérios genéricos) — 2026-10-23

- **Versão no ar:** `74c8aaa5` (parser do milhar corrigido depois, `642937a3`, ainda **não** deployado).
- **Canal:** 0101 (WAHA, sem Datafy), agente QA clone, contato de teste.
- **Evidência:** `.test-artifacts/matriz-fase4/*.json` (local; script `scripts/qa/matriz-fase4.sh`).
- **Teste de unidade:** `tests/unit/certificacao-criterios-genericos.test.ts` (14 casos).

## Matriz ao vivo (1 turno por caso)

| # | Pedido | Fotos | Invariante | Resultado |
|---|---|---|---|---|
| 01 | "Quero uma moto vermelha." | 5 | só vermelhas | ✅ 5/5 vermelhas |
| 02 | "Quero uma moto Honda." | 5 | só Honda | ✅ 5/5 Honda |
| 03 | "Quero uma moto de trilha." | 5 | só trail/adventure | ✅ XRE/XTZ/G 310 GS/R 1200 GS/Himalayan |
| 04 | "Quero uma 160." | 5 | cc 126–160 | ✅ CG/NMax/Factor 150/FZ 15/XTZ 150; sem 250/300 |
| 05 | "Quero uma 160 vermelha." | 1 + álbum | principais (160 vermelhas) | ⚠️ veio a **NMax 160 vermelha** (correta), mas o **texto** diz "não tenho nenhuma 160 vermelha" e o fecho é de **aquisição** (era "mais opções") |
| 06 | "Quero uma moto até 20 mil." | 6 | ≤ 20.000 | ✅ todos ≤ 20.000 |
| 07 | "Quero uma moto até 30 mil km." | 2 | km ≤ 30.000 | ✅ 12.000 / 11.000 km |
| 08 | "Quero uma moto de 2024." | 0 | ano bloqueado pela config | ✅ perguntou modelo/estilo (respeita o bloqueio) |
| 09 | "Quero uma Honda vermelha até 20 mil." | 1 + álbum | Honda ∧ vermelha ∧ ≤ 20.000 | ⚠️ veio a **CG 160** (correta); o **texto** cita a **CB 300 F** ("as duas") que **não foi enviada** |
| 10 | "Quero uma moto de trilha até 25 mil." | 3 | trail ∧ ≤ 25.000 | ✅ XRE 22.500 / XTZ 19.990 / XTZ 16.900 |
| 11 | "Quero uma CB 250." | 1 + álbum | modelo ausente → parecida | ✅ "não tenho a CB 250" + CB 300 R (parecida); fecho de aquisição coerente com modelo citado |

## Achados

1. **Filtros (seleção) passaram** em todos os casos: as **motos enviadas** respeitam o critério. O que falhou em 05/09 é **texto do modelo**, não vazamento de filtro:
   - 05: o texto nega a 160 vermelha que ele mesmo enviou.
   - 09: o texto cita a CB 300 F (28.990) num pedido ≤ 20 mil — a moto **não** foi enviada (só citada).
2. **Álbum de 1 moto:** quando a 1ª traz **1 moto**, o motor envia **todas as fotos dela** (1 com legenda + N sem legenda). É o comportamento "uma moto só → todas as fotos", mas conflita com a regra "quantidade = fotos da etapa" (o texto fala em "opções" e o álbum tem N fotos).
3. **Fecho com 1 moto + fila:** o caso 05 (genérico) fechou em **aquisição** em vez de "mais opções parecidas — inclusive de outras fabricantes". O caso 11 (modelo citado ausente) fechou em aquisição — coerente.
4. **Parser do milhar (corrigido):** `"30.000"` virava **30**; agora `30000` (`normalizarNumeroDoEstoque`, commit `642937a3`). A certificação de unidade pegou o bug.

## Recomendação (ordem, sem quebrar)

1. **Deploy único** do lote atual (parser `642937a3` + testes) — sem mudança de seleção.
2. **Fecho genérico com 1 moto + fila** → forçar o combinado "escolha + outras parecidas" (só quando `temMaisOpcoes`; preserva o caso 11, cuja fila é vazia). Teste dedicado.
3. **Contagem x álbum:** decidir a regra (1 foto por moto **ou** álbum com contagem de motos distintas); hoje o texto conta "opções" e o álbum manda N fotos.
4. **Grounding do texto:** impedir o modelo de citar moto que não está na apresentação (05/09) — validar nomes citados contra as enviadas.
5. Re-probe dos casos 05/09 + regressão 01/04/10 após o lote.

## Re-probe pós-deploy `6487aad7` (parser + suíte 9340/19 baseline)

| Caso | Resultado |
|---|---|
| 01 cor | ✅ 5/5 vermelhas |
| 04 cc 160 | ✅ 5 dentro de 126–160 (CG/NMax/Factor 150/XTZ 150/XTZ 150 S) |
| 06 até 20 mil | ✅ 5 ≤ 20.000 |
| 10 trilha até 25 mil | ✅ 2 trail ≤ 20.000 |
| **12 "160 vermelha" (1ª)** | ❌ **Factor 150** (vermelha, 149,3) em vez das 160 (CG/NMax); texto "temos uma 160 vermelha" com foto de 150 |
| **12 "ver mais" (2ª)** | ❌ BMW G 310 GS / CB 500 X / Dominar 400 / Himalayan / FZ 15 — **fora da margem**; a fila estava vazia e caiu na alternativa sem margem |

**Causa:** a 1ª depende da **nota/top da JEV**, que varia entre execuções (ora CG/NMax, ora Factor 150). A 2ª, com fila vazia, cai na `crm_offer_similar_motos` (alternativa) **sem** a margem/âncora.

**Decisão necessária (dono):**
1. **Principal determinística:** quando o cliente cita um número/cc ("160"), a 1ª = as motos com a **cc exata** (CG/NMax); a 150/125 vão para o "ver mais". (Se não houver exata, usa a faixa.) — elimina a variação da JEV.
2. **"Ver mais" sem parecidas:** se a fila/margem não tiver opção, responder **"não tenho outras parecidas nesse perfil"** — nunca mandar BMW/CB 500/Dominar (fora da margem).
3. **Álbum x contagem:** manter "1 moto → todas as fotos" ou 1 foto por moto? (o texto conta "opções", o álbum manda N fotos).

## Correção aplicada (commit/deploy `1dabe8e7`)

Aprovado pelo dono (1 e 2):
1. **Principal determinística pela cc exata.** "160" → só as de `cilindrada` exata (CG/NMax); a 150/125 vão para o "ver mais". Sem exata (ex.: "150"), volta para a faixa/hipóteses.
2. **"Ver mais" sem fila → não busca alternativa.** A ferramenta responde que não há parecidas no perfil/margem; nunca manda BMW/CB 500/Dominar.

### Probe final (mesmo contato, 2 turnos + objeção)
| Turno | Resultado |
|---|---|
| 1ª "Quero uma 160 vermelha." | **CG 160 + NMax 160** (2), texto "Separei 2" ✅ |
| 2ª "Quero ver mais opções." | **Factor 150 + Factor 125** (2), dentro de 160 ±30% ✅ |
| 3ª "Achei caro." | text-only (as duas já são as mais baratas do perfil), 0 fotos ✅ |

**Nota de método:** o "12v2" anterior (BMW/CB 500/Dominar) foi **artefato do script de probe**, que limpava o contato entre os dois turnos — a conversa perdia o contexto. O 2º turno agora é rodado **no mesmo contato** (`scripts/qa` e `.test-artifacts/2turnos-exata/`).

## Correção do preço/km como FATO (commit/deploy `eb222a9b`)

- `catalog-criteria.ts` Fase 2b: se a JEV **não marcar** preço/km, mas a mensagem citar ("até 20 mil", "até 30 mil km"), o motor **adiciona** a coluna + o teto. Sem isso, "Honda vermelha até 20 mil" deixava passar a **CB 300 de 28.990** (medido 2026-10-23).
- Testes: 3 novos (preço, km, e "160"/"2024" NÃO viram preço) — 35 no ponto.
- Re-probe (`eb222a9b`): **09** enviou a **CG 160 (17.500)** — CB 300 fora ✅; **06** 5/5 ≤20.000 ✅; **04** 5 dentro de 126–160 ✅; **01** 5/5 vermelhas ✅.

## Resolvido (histórico — este bloco antes era "Pendente")
- **Fecho do fluxo no 09/04:** resolvido pelo **Fluxo A** (a apresentação fecha no catálogo; nome/pagamento no próximo turno/turno da escolha). Fecho **único**.
- **"mais duas vermelhas":** não é erro de contagem — são as **2 opções da fila** (o próximo turno/"ver mais"); a apresentação manda **1 foto por moto** e o "ver mais" manda as 2. Contagem da etapa conferida.
- **Álbum x contagem:** resolvido — **1 foto/moto na apresentação**; **álbum inteiro na escolha e na troca de escolha**.

## Fluxo A + fecho único + cc exata sempre (commits `814784c3`…`cd177e39`)

- **Fluxo A (dono):** a apresentação fecha com o **catálogo** (escolha/mais opções); a pergunta do fluxo (nome/pagamento) fica para o **próximo turno** (ou para o turno da escolha).
- **Fecho único:** o "mais opções" já contém a escolha → não soma outra pergunta; e se **qualquer** bolha do turno já tem pergunta, o fecho final não acrescenta outra.
- **1 moto apresentada** = escolha travada → fecho de **aquisição** (sem "Alguma dessas" duplicado).
- **CC exata sempre:** "160" → CG/NMax mesmo quando a JEV volta **sem hipóteses** (antes vinha a Factor 150 como principal).

### Probe final (`cd177e39`)
| Caso | Resultado |
|---|---|
| "Quero uma 160 vermelha." | **CG 160 + NMax 160** + fecho "Alguma delas...?" ✅ |
| "Quero uma moto vermelha." | 5/5 vermelhas + fecho único ✅ |
| "Quero uma 160." | 5 na faixa 126–160 + fecho único ✅ |
| "Quero uma Honda vermelha até 20 mil." | **CG 160 (17.500)** + álbum + **aquisição única** ✅ (CB 300 fora) |
| Escolha ("Gostei da CG 160.") | aquisição (pagamento) ✅ |

## Fotos: 1 na apresentação, álbum na escolha/troca (deploy `b5194b50`)

- **Apresentação = 1 foto por moto SEMPRE** (inclusive 1 moto). Antes, 1 moto na 1ª mandava o álbum inteiro (o 09 saiu com 10 fotos).
- **Escolha = álbum inteiro** da escolhida; **troca explícita** ("na verdade prefiro a NMax") = **nova escolha** → álbum da nova (prompt da JEV + `escolhidaNesteTurno`).
- Probe: 09 = 1 foto; "Gostei da CG 160" = 10 fotos; "Na verdade prefiro a NMax" = **11 fotos da NMax** ✅.
- **Pendência conhecida:** no caso de **1 moto** pelo caminho do `enviarApresentacao` (40v1), o fecho ainda pode sair com a pergunta do **fluxo** ("só pra eu entender…") em vez do catálogo. No 09 (outro caminho) saiu catálogo/aquisição. É o mesmo subsistema de fluxo; não mexi mais (pedido do dono: parar).

## Auditoria do estoque externo (2026-10-23, leitura)

Tabela `motos` (vgasistemas_n8n): **26 unidades**.

- **`cilindrada`**: formatos mistos (`293,5`, `149.0 cc`, `649.0 cm3`, `162,7 cc`, `155 cc`) — o `numeroDaCelula` **lê certo** (vírgula decimal + unidades). A **YS Fazer 250** (id 26) já corrigida `149,3`→`249`.
- **`preco`** (`28990.00`) / **`quilometragem`** / **`ano`**: numéricos, ok.
- **`potencia`**: ~10 linhas em texto/faixa (`12.4 cv @ 7.500 RPM`, `~14,2–15,1 cv a ~8 000 rpm`, `207 cv`). O parser atual devolve `null` para as com `@`/`a ... rpm` → a **potência não filtra/ordena** nessas unidades. (A potência raramente é critério; correção opcional: extrair o 1º número quando houver `cv/hp/rpm`.)
- **Nome x cc (não é erro de cc):** `Hymalayan 400` tem cc **451** (modelo 2026 é o **450** — o NOME está "400"); `XRE 190`=184,4; `NMax 160`=155; `CG 160`=162,7; `Dominar 400`=373 — nomes de modelo, cilindradas reais corretas.
- **Sem** outra `cilindrada`/preço/km/ano errados.

## Contagem "mais duas" (verificado — não é bug)
- "Separei ela e mais duas vermelhas" = as **2 opções da FILA** (o próximo turno/"ver mais"), não as fotos da 1ª. A 1ª manda **1 foto/moto**; o "ver mais" manda as 2. Bate com a regra "cada etapa manda a quantidade dela".

## RESOLVIDO — fecho do fluxo na apresentação (`8a6d7e3f`)

- **Trace** (worker stdout): o caso 2 motos já saía certo (o `fecho do turno de catálogo ajustado` + o `trava da pergunta: já houve pergunta no turno — fluxo espera`). No caso **1 moto**, a pergunta do fluxo ficava na **INTRODUÇÃO** do `enviarApresentacao` (texto do modelo), que a limpeza do `corpoFinal` não cobria.
- **Fix:** na `enviarApresentacao`, quando há fotos, a **introdução** passa por `removerPerguntasDoModelo` — tira qualquer pergunta do texto do modelo (inclusive a do fluxo copiada). O fecho do catálogo é reposto depois das fotos.
- **Probe (`8a6d7e3f`):** 05 "160 vermelha" = 2 motos (CG/NMax) + "Alguma delas…?" ✅; 09 "Honda vermelha até 20 mil" = CG (1) + **aquisição do catálogo** ✅; 04 = 5 + escolha/mais opções ✅. **Sem a pergunta do fluxo.**

## Pendências de dados/potência — RESOLVIDAS (`b97881d8`)

- **Potência em texto:** `numeroDaCelula` agora lê o **PRIMEIRO número** quando há `cv/hp/rpm` (`12.4 cv @ 7.500 RPM` → 12.4; `~14,2–15,1 cv…` → 14.2). Nome de moto continua não-numérico. Testes: 26 no `similaridade`.
  - Probe "potência de 30 cv" → 5 motos ~24–34 cv (CB 300 F 30,4 / XMax 24,1 / G 310 34 / CB 300 R 25,4) ✅.
- **Himalayan:** BD externo `motos` id 46 renomeado **"Hymalayan 400" → "Himalayan 450"** (cc 451 é a real do 450; ano 2026). Backup: `/root/backups/hymalayan-antes-20261023-202435.csv`.
  - Probe: "Himalayan 450" → a 450 ✅; "Himalayan 400" → não tem 400, oferece a 450 (parecida) ✅.
- **Cosmético (não corrigido):** no caminho de **modelo ausente/parecidas**, o aviso do motor ("Não temos a …") + a introdução do modelo podem sair **em dois blocos** (ex.: "Não temos a DE 30…" / "Boa tarde!… Tenho sim…"). Não afeta o filtro/fotos; é texto do modelo/aviso.
