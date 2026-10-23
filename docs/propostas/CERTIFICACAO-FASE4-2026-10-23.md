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
