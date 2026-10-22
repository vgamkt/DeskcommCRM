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

### Fase 1 — valor para TEXTO
- Alteração: `experimental`/pure em `catalog-criteria.ts` — para colunas de texto exigidas e sem valor da JEV, casar a palavra da mensagem contra os valo- res distintos do estoque (tolerante a gênero/acento) e gravar `faixas[col] = [valor]`.
- A JEV continua decidindo se a coluna é critério (`exigidos_<col>`); o motor só descobre o valor no estoque.
- (preencher: testes, probe, resultado)

## 5. REGISTRO DEPOIS (validação)

- (preencher após Fase 1/2/3: matriz final, suíte, probes e commit)

## 6. Salvaguardas

- Só colunas `criterio: true` do mapeamento.
- Sem regex decidindo: JEV decide; o motor executa + fallback factual (palavra/número da mensagem).
- Cada fase: commit isolado → suíte verde → probe ao vivo → só então a próxima.
- Regressão em cenário que funcionava → `git revert` imediato.
- Preserva os caminhos atuais (faixas de preço/cc/potência, marca/categoria, modelo específico por tokens, "ver mais").
