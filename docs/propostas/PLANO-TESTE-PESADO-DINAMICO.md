# PLANO — achados do teste pesado dinâmico (WAHA 0101 → bot 2501)

- **Data:** 2026-10-16 · **Org de teste:** `e40dc035-…` · **Cliente:** 0101 · **Bot:** 2501 (datafy)
- **Método:** conversa real, adaptativa (li cada resposta e conduzi a próxima), cobrindo catálogo,
  escolha, objeções (preço/ano/km), objeções persistentes, fluxos (financiamento, troca), **fluxo
  duplo** (troca + financiamento), multi-intenção, "ver mais", modelo inexistente (Lander→categoria),
  handoff. Estado final do contato conferido no banco.

---

## §1 — O que PASSOU (comportamento correto)

| Cenário | Resultado |
|---|---|
| Saudação + catálogo aberto | ✅ apresentação + pergunta + fotos |
| Fluxo FINANCIAMENTO (cidade→CNH→CPF/nascimento→entrada→parcelas) | ✅ **concluiu** (dados gravados) |
| **Fluxo DUPLO** ("dar a moto na troca e financiar o restante") | ✅ reconheceu os 2, perguntou a troca e seguiu |
| Objeção de ANO/KM ("é de 2011, 104 mil km") | ✅ persuadiu |
| Objeção de PREÇO persistente (2ª/3ª) | ✅ negociação (`motivo:preco`, `acao:mostrar_opcoes`) |
| "ver mais opções" | ✅ estendeu a fila |
| Modelo inexistente (Lander 250) | ✅ **só trail** (XTZ/Himalayan/CB 500 X/BMW GS/XRE 190) |
| Multi-intenção ("financiam? cartão? endereço?") | ✅ respondeu as 3 |
| Handoff humano | ✅ `force_human=true` |
| Captura de dados (contato) | ✅ nome, cidade, CNH, CPF, nascimento, entrada, parcelas, moto_interesse, troca |

## §2 — INCONSISTÊNCIAS encontradas

### A) Objeção de preço PERDIDA quando vem junto de uma ESCOLHA (principal)
Mensagem: **"Gostei da CB 300 R 2011, mas achei um pouco caro."**
- Verdicto do ponto `objecao`: **`eh_objecao: False`** (fonte Jev).
- O motor **travou a escolha** e pulou direto para a pergunta de **aquisição** — **não tratou a
  objeção** (não persuadiu). Só objeções mais "fortes" ("tá muito caro mesmo, não cabe") ativaram a
  negociação (`preco`/`mostrar_opcoes`).
- **Impacto:** o cliente reclama do preço na mesma frase em que escolhe a moto e o bot ignora — parece
  que só quer vender a qualquer custo.
- **Onde:** ponto `objecao` (`lib/ai/jev/pontos/objecao.ts` + `objecao-jev.ts`) — o prompt não lê a
  objeção quando há escolha no mesmo turno; e a ORDEM motor (escolha trava ANTES de a objeção ser
  tratada) contribui.

### B) Texto da apresentação x motos (contagem) — conhecido, sem fix seguro
O modelo escreve o texto ANTES de o motor escolher as motos → pode "chutar" a contagem
("vou te mandar duas" e manda uma). O fix tentado (intro determinística) **foi revertido** porque
**removia a saudação/apresentação** do 1º turno (regressão medida). Continua em aberto uma correção
que preserve a saudação E acerte a contagem.

## §3 — PLANO (proposto; JEV PRIMEIRO, sem tocar na engrenagem)

- **P1 — Objeção mista (escolha + preço) — [alta].**
  - Reproduzir no ponto `objecao`: mensagem com escolha E objeção → a Jev deve marcar `eh_objecao:true`
    (motivo `preco`) e o motor deve **persuadir E conduzir**, não só travar a escolha.
  - Conserto no **prompt** do `objecao` (não em regex): "se houver reclamação de preço/ano/km JUNTO de
    uma escolha, isso É objeção".
  - Teste de caracterização + sonda ANTES/DEPOIS. *Sem tocar em gates.*
- **P2 — Contagem natural do texto — [média].**
  - Dar a LISTA exata de motos ao modelo SEM remover o mapping/estilo (testar o prefetch incluindo
    AMBOS os blocos), preservando a saudação; medir tokens × acerto. Só promover se não regredir.
- **P3 — Regressão deste teste — [média].**
  - Virar casos de caracterização: "escolha+objeção de preço", "fluxo duplo troca+financiamento",
    "multi-intenção (financiamento+cartão+endereço)", "Lander→categoria", "objeção persistente→negociação".

## §4 — Não é escopo (config/dado)
- Catálogo Google (mortos) — resolvido no 0272.
- Sessões duplicadas (WORKING+STOPPED) — config da tela.
