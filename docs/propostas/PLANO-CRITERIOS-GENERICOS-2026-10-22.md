# Plano — Critérios genéricos do catálogo (qualquer coluna, único ou combinado)

- **Data:** 2026-10-22
- **Escopo:** extração/execução de critérios do catálogo do banco externo.
- **Regra-mãe:** a JEV decide **se** uma coluna é critério; o motor só **executa** (filtra/ordena) com o valor/faixa. O valor pode ser derivado de FATOS da mensagem (palavra/número) quando a JEV só marcar "é critério" e não der o valor.

## 1. Inventário (ANTES)

Conexão: **Allma n8n** (`allma-db`, `vgasistemas_n8n`, tabela `motos`).

Colunas marcadas `criterio: true` (10):

| Coluna | Tipo | Como era tratada antes |
|---|---|---|
| `nome` | texto | modelo específico (tokens) — não vira filtro `exigido` |
| `marca` | texto | `marca_alvo` (valor real do estoque) ✅ |
| `versao` | texto | **sem valor** ❌ |
| `categoria` | texto | `categoria_alvo` ✅ |
| `cor` | texto | **sem valor** ❌ |
| `ano` | numérico | sem faixa (bloqueio de ano configurável) |
| `preco` | numérico | faixas do dono ✅ |
| `quilometragem` | numérico | **sem faixa** ❌ |
| `cilindrada` | numérico | faixas do dono + fallback do número ✅ |
| `potencia` | numérico | faixas do dono ✅ |

Defeitos medidos (teste 0101, 2026-10-22):
- **"vermelha"** → JEV exigiu `cor`, mas sem valor → entraram **Preta (Himalayan)** e **Azul (FZ 15)**.
- **"bmw 1200"** e **"HONDA CB 500 X 2015"** vazavam outros modelos até a correção por tokens/modelo citado.

## 2. Plano (fases)

- **Fase 1 — valor para TEXTO (`cor`, `versao`, e generaliza `marca`/`categoria`):** a JEV escolhe o valor real do estoque (`valor_<col>`); fallback determinístico casa a palavra da mensagem contra os valores distintos do estoque.
- **Fase 2 — faixa para NUMÉRICO genérico (`ano`, `km`, futuras):** ano exato; km com teto/quando citado; preço/cc/potência mantêm as faixas do dono; fallback pelo número da mensagem.
- **Fase 3 — combinado + principal:** todo `exigido` com valor/faixa filtra em AND; `principal` só ordena.
- **Fase 4 — certificação:** matriz de testes por coluna/combinação + probes ao vivo no 0101 (sem Datafy), com evidência salva.

## 3. REGISTRO ANTES (baseline 2026-10-22)

Suíte: **1646/1646**, tsc/lint 0 — commit `394c6624`.

Critérios extraídos nos 9 pedidos (teste 0101):

| Pedido | principal | exigidos | faixa/valor | Resultado |
|---|---|---|---|---|
| trilha | categoria | categoria | Trail, On-Off Road | 3 motos (ok) |
| Honda | marca | marca | HONDA | 5 motos (ok) |
| 160 | cilindrada | cilindrada | 126–160 | 2 motos (ok) |
| até 30 mil | preço | preço | máx 30.000 | 5 motos (ok) |
| barata | — | — | — | perguntou o valor |
| 0km | — | — | — | explicou que só trabalha com usadas/seminovas |
| **vermelha** | cor | cor | **sem valor** | **vazou preta e azul** ❌ |
| forte | — | — | — | perguntou o uso |
| econômica | — | — | — | 5 motos por hipóteses (baixa cc) |

## 4. REGISTRO DURANTE (execução e achados)

### Fase 1 — valor para TEXTO (IMPLEMENTADA)
- Alteração em `lib/ai/jev/pontos/catalog-criteria.ts`: para coluna de texto exigida pela JEV e **sem valor**, o motor casa a palavra da mensagem contra os **valores reais do estoque** (tolerante a gênero/acento: "vermelha" → "Vermelho") e grava `faixas[col] = [valor]`. A JEV continua decidindo **se** a coluna é critério (`exigidos_<col>`).
- Sem match no estoque ou ambíguo (2+ valores) → **não** filtra (não chuta).
- Testes: 3 novos no ponto `catalog-criteria.test.ts` (28 no ponto) e **1649/1649** na suíte; tsc/lint 0.
- Commit: `3999857b`.

### Fase 2 — faixa para NUMÉRICO genérico (IMPLEMENTADA)
- Alteração em `catalog-criteria.ts`: quando a JEV exige coluna numérica sem faixa, o motor usa o número da mensagem (aceita "30 mil"/"30.000"):
  - `ano` = exato (1900–2100);
  - `quilometragem`/`preco` = **teto** ("até"), **piso** ("mais de") ou faixa próxima (±30%);
  - preço/cc/potência mantêm a faixa da JEV quando ela existe; um número só; 2+ (combinação) fica para a Fase 3.
- Testes: 4 novos (32 no ponto) e **1653/1653** na suíte; commit `ec9484b3`.
- Achado no probe: "até 30 mil km" trazia **só a XMax** (9 fotos) porque `nomeiaModelo` ligava só por "quero uma moto" e prendia a seleção na única hipótese da JEV. Corrigido: a flag só liga com **modelo CITADO** (`26dd2ac4`); testes 1653/1653.

### Fase 3 — combinado + principal (IMPLEMENTADA)
- Prompt: "o cliente pode citar VÁRIAS colunas — marque TODAS" (ex.: "Honda vermelha até 20 mil" → marca+cor+preço).
- `inbound-turn.ts`: se o cliente cita uma **cilindrada plausível** ("160") e a JEV não marcou, o número é FATO → adiciona a coluna + a faixa (sem modelo específico citado).
- Commit `bf96b99b`; suíte 1653/1653.

## 5. REGISTRO DEPOIS (validação)

Probe ao vivo no canal **0101 (WAHA, sem Datafy)**, commit `3999857b`:

| Pedido | Critérios extraídos | Resultado |
|---|---|---|
| "Quero uma moto **vermelha**." | `principal=cor`, `exigidos=["cor"]`, `cor=Vermelho` (7 casadas) | **5/5 vermelhas** (XMax, CB 300 F, NMax, Factor 150, YS Fazer); nenhuma preta/azul ✅ |
| "Quero uma moto **Honda**." | `principal=marca`, `exigidos=["marca"]`, `marca=HONDA` | 5/5 Honda (sem regressão) ✅ |
| "Quero uma moto de **trilha**." | `principal=categoria`, `exigidos=["categoria"]`, `Trail/On-Off Road` | 3 trail (XTZ 150 Crosser, CB 500 X, XTZ 150 Crosser S) (sem regressão) ✅ |

Probe da **Fase 2** (0101, sem Datafy, commit `26dd2ac4`):

| Pedido | Critérios | Resultado |
|---|---|---|
| "até **30 mil km**" | `principal=quilometragem`, `exigidos=["quilometragem"]`, `{max:30000}` | **5 motos** (4.000/4.500/9.800/17.800/21.300 km), fecho de "mais opções" ✅ |
| "até **20 mil**" | `principal=preco`, `exigidos=["preco"]` | 5 motos ≤ R$ 20 mil, fecho de "mais opções" ✅ |
| "de 2024" | ano **bloqueado pela config do agente** | perguntou tipo/uso (respeita o bloqueio) |
| Regressão: "HONDA CB 500 X 2015" | `cor`/modelo | 13/13 fotos + fecho de aquisição ✅ |
| Regressão: "vermelha" | `cor=Vermelho` | 5/5 vermelhas, fecho de "mais opções" ✅ |

Probe da **Fase 3** (0101, sem Datafy, commit `bf96b99b`):

| Pedido | Critérios | Resultado |
|---|---|---|
| "Honda **vermelha até 20 mil**" | `marca+cor+preço` | 1 moto (CG 160 Fan), **10/10 fotos** + fecho de aquisição ✅ |
| "**160 vermelha**" | `cor+cilindrada` (agora marca os dois) | filtro AND aplicado; entraram 150s (faixa 126–160) e a **YS Fazer 250**, cujo `cilindrada` está **"149,3" no banco externo (dado errado)** ⚠️ |
| "trilha até 25 mil" (probe anterior) | `categoria+preço` | 5 trail; a faixa de preço do dono (20–30 mil) permite até 30 mil, dentro da margem de 30% |
| Regressão "trilha" | `categoria` | 5 trail, fecho de "mais opções" ✅ |

### Correção de DADO (2026-10-23)
- `motos.cilindrada` da **YS Fazer 250 BLUE FLEX 2017 (id 26)** corrigida de `149,3` para **`249`** no banco externo (backup: `/root/backups/fazer250-antes-<ts>.csv`).
- Efeito: no pedido **"160" puro** a YS Fazer 250 **saiu** da lista.
- Achado de projeto: no **"160 vermelha"** ainda entram 150/125/250. Causa: `ehAtributoDePedido` (`selecao-por-intencao.ts`) **não trata cilindrada/ano/potência como filtro rígido** — de propósito, para "CB 250" (nome de modelo) não virar filtro de cc. Resultado: a cilindrada só **pontua/ordena**; com a cor como único filtro rígido, entram vermelhas de outras cc.
- Proposta (precisa de OK): quando a cilindrada é pedida **POR SI** (sem modelo citado, ex.: "160", "160 vermelha"), restringir a seleção às **motos que a JEV marcou como parecidas** (hipóteses — ex.: NMax 160/CG 160) e não completar com outros perfis. Mantém o caso "CB 250" (modelo) como está.

**Fases 1, 2 e 3 certificadas.** Próxima: **Fase 4** (matriz de certificação) — ou corrigir o dado do estoque.

## 6. Salvaguardas

- Só colunas `criterio: true` do mapeamento.
- Sem regex decidindo: JEV decide; o motor executa + fallback factual (palavra/número da mensagem).
- Cada fase: commit isolado → suíte verde → probe ao vivo → só então a próxima.
- Regressão em cenário que funcionava → `git revert` imediato.
- Preserva os caminhos atuais (faixas de preço/cc/potência, marca/categoria, modelo específico por tokens, "ver mais").


## 7. REGRA DO DONO (2026-10-23) — 1ª principal, 2ª dentro das margens

- **1ª apresentação (pedido genérico):** as **PRINCIPAIS** (as hipóteses de MAIOR NOTA da JEV), fechando com *"opções parecidas — inclusive de outras fabricantes"*.
- **2ª (quando o cliente pede mais):** as **parecidas DENTRO das margens** (`faixasSimilares`), sem trazer de fora.

### Execução/achados
- Fecho genérico atualizado (inclui "outras fabricantes") e testes ajustados.
- 1ª mostra: `primeirasSomenteHipoteses` + `hipotesesDeMaiorNota` → **CG 160 + NMax 160** (as principais), validado ao vivo (commit `b1656fbb`; 1653/1653).
- **Pendência:** no "ver mais", o modelo chamou `crm_offer_similar_motos` (busca de alternativa) e a resposta trouxe **YS Fazer 250/XMax 250/CB 300** — fora da margem de 160. A **fila** (Factor 150/125, dentro da margem) não foi a única fonte.
- **Correção proposta (precisa de OK):** quando o cliente pedir "ver mais" e houver fila (`opcoes.pendentes`), a ferramenta `crm_offer_similar_motos` deve **deferir à fila** (não marcar `alternativa`, não buscar de novo) e o motor envia **só a fila** (as margens), ignorando `media_urls` do modelo nesse turno.

### Resultado (2026-10-23, deploy `b799273b`)
- **1ª** ("Quero uma 160 vermelha") → **CG 160 Fan + NMax 160** (principais) ✅
- **2ª** ("Quero ver mais opções") → **Factor 150 + Factor 125** (vermelhas, dentro de 160 ±30%), na ordem da **maior nota** ✅; sem 250/CB 300.
- Fila agora **ordenada pela nota** (`ordenarFila`/`pontuarPorCriterios`); `crm_offer_similar_motos` **defere à fila** no "ver mais".
- Suite completa: 9321 passed; 19 falhas de guarda/ambiente **idênticas sem a mudança** (confirmado com stash).

### Ajuste da contagem (2026-10-23, deploy `ed3651ab`)
- Prompt: **nunca citar quantidade** na abertura (o sistema manda 1 foto por moto).
- 1ª agora: *"…essa e em mais uma opção vermelha"* (2 fotos — bate) ✅
- 2ª: *"Separei mais 2 opções"* (2 fotos — bate) ✅
