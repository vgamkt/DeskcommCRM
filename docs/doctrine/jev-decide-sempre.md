# Doutrina: a Jev decide sempre

> Lei de arquitetura da **decisão** no runtime do agente. Complementa
> [`separacao-fala-e-operacao.md`](./separacao-fala-e-operacao.md) e
> [`sistema-vivo.md`](./sistema-vivo.md); resumida em [`CLAUDE.md`](../../CLAUDE.md)
> (seção "Jev decide SEMPRE") e numa linha de [`AGENTS.md`](../../AGENTS.md).
> **Não é aspiração — é critério de aceite.**

A Jev é o **modelo de decisão estruturada** do sistema (ponto a ponto, binding
`<ponto>__jev` em `ai_purpose_bindings`). Ela decide **o quê** oferecer, a **fase** da
negociação, o **estágio**, a **intenção**, a **rota de conhecimento** e a **escolha de
motos**. O resto do motor (`GLM`/modelo de conversa) **redige** a partir dessa decisão.

| Se você quer… | Vá para |
|---|---|
| entender a ordem obrigatória das réguas | §A hierarquia |
| saber o que um teste/gate pode verificar | §Invariantes verificáveis |
| ver o que ainda viola a doutrina | §Violações pendentes |
| consertar um veredito ruim **sem** contornar a Jev | §Onde se conserta |

---

## O princípio-raiz

A pergunta que classifica qualquer ponto de decisão é:

> *"Se este veredito estiver errado, em qual arquivo alguém vai mexer para
> consertá-lo?"*

Se a resposta for **um regex no motor** (ou um `if` determinístico que "vence" a
Jev), o ponto está violando a doutrina. Se a resposta for **o prompt/contexto da
Jev** (`perguntaDe*`, o `state` que ela recebe), o ponto está correto.

A razão é empírica: quando regex e Jev decidem o mesmo ponto, nascem **duas réguas
que não se falam**. O regex silencia a Jev num caminho, a Jev decide noutro, e o
comportamento ao vivo vira a interseção imprevisível das duas — foi exatamente o
defeito que motivou a Jev (medido em produção, 2026-10-03/04).

---

## A hierarquia

**A mesma em todo ponto de decisão do turno. Não se reordena.**

1. **A Jev decide.** É a autora da decisão daquele ponto. É o caminho **principal**.
   O motor **sempre tenta** obter o veredito dela primeiro.
2. **Regex/determinístico é FALLBACK.** Acionado **apenas** quando a Jev está
   desligada/indisponível para o ponto (`alvosDeJevDaOrg(...)` vazio — binding
   ausente/desabilitado —, erro esgotado, ou o turno é `preview`). Ele **substitui**
   a Jev nesse caso; **nunca a antecede nem a corrige**.
3. **Se a Jev decide algo que parece errado, conserta-se o PROMPT/contexto dela.**
   É **PROIBIDO** contornar a Jev com um bypass de regex que "vence" o veredito —
   isso recria as várias réguas.

### O que conta como "a Jev respondeu"

Um veredito **não** é nulo quando a Jev está ligada e devolveu resposta — mesmo que
seja negativa (ex.: `oferecer:false`). O fallback determinístico **não** roda por
cima de um veredito negativo: negativa é uma decisão, não uma ausência de decisão.
Só `null` (ponto desligado/indisponível) libera o regex.

---

## Invariantes verificáveis

1. **Nenhum `if (regex(...)) return decisão` pode vir ANTES do veredito da Jev no
   mesmo ponto.** O regex entra depois, e apenas sob `veredito === null` /
   `alvos.length === 0`.
2. **O fallback regex só entra na ausência de veredito** — nunca para "melhorar",
   "salvar" ou "vence" um veredito existente.
3. **Um ponto novo de decisão nasce com binding `<ponto>__jev` + `perguntaDe*`** e
   um bridge `decidir*ComJev` que devolve `null` quando a Jev está off. Regex **não**
   é a implementação inicial de um ponto novo.
4. **A decisão da Jev é registrada no log** (`*: a Jev decidiu`) e, quando esgotada,
   enfileirada no outbox (`enfileirarDecisaoJev`) — a indisponibilidade não é muda.

Como verificar manualmente, para um ponto qualquer:

```bash
# A chamada da Jev tem que estar ANTES de qualquer regex que decida o mesmo ponto.
grep -n "decidir.*ComJev\|ehObjecaoValor\|podeOferecerMotos\|querMaisOpcoes" \
  lib/agent-engine/agent/inbound-turn.ts
```

A ordem aceitável é: `await decidir...ComJev(...)` → usa o veredito → `fallback
regex` sob o teste de `null`.

---

## Onde se conserta

Um veredito ruim **não** se conserta no motor. Os pontos de intervenção, em ordem:

| Sintoma | Onde mexer |
|---|---|
| Jev nega o que o cliente pediu | `perguntaDe*` do ponto (instruções + `criteria`) |
| Jev erra o tipo/estágio | o `state` enviado a ela (campos de contexto) |
| Jev "não responde" | binding `__jev` na tela de provedores (credencial/modelo) |
| Regex ainda decide sozinho | este documento — é uma **violação** |

Exemplo de correção legítima: para o caso "quero ver mais opções" (a Jev devolvia
`oferecer:false` para um pedido legítimo), o conserto foi **reforçar
`perguntaDeOfertaJev`** com a regra inegociável — **não** reintroduzir o bypass de
`pedidoExplicitoDeMaisOpcoes` no `inbound-turn.ts`.

---

## Violações pendentes

> Auditoria de 2026-10-05 (`lib/agent-engine/agent/inbound-turn.ts`).

**Nenhuma pendente.**

### Histórico de correções

- ✅ **`pedidoExplicitoDeMaisOpcoes` vencia a Jev na oferta** (`decidirOfertaDoTurno`).
  O bypass foi removido: a ordem passou a ser (1) negociação da Jev → (2) veredito
  de oferta da Jev → (3) fallback determinístico. O pedido explícito só tem
  prioridade **dentro do fallback**. Commit `e602d935`. Conserto do prompt:
  `perguntaDeOfertaJev` (`lib/ai/jev/pontos/oferta.ts`).
- ✅ **`ehObjecaoValor`/`motivoDaObjecao` decidiam a existência/tipo da objeção
  ANTES da Jev** (`inbound-turn.ts`, ~2897). Migrado para o ponto `objecao`
  (`lib/ai/jev/pontos/objecao.ts` + `lib/agent-engine/agent/objecao-jev.ts`): a Jev
  decide *é objeção?* e *qual o tipo*; o regex só entra como fallback quando o
  veredito é `null`.

---

## Pontos de decisão em vigor

Todos os pontos abaixo **têm a Jev como autora**; o regex listado é apenas fallback.

| Ponto (binding `__jev`) | Bridge | Fallback determinístico |
|---|---|---|
| `offer_motos` | `decidirOfertaComJev` | `podeOferecerMotos` / `pedidoExplicitoDeMaisOpcoes` |
| `negociacao` | `decidirNegociacaoComJev` | `faseDoTurno` |
| `objecao` | `decidirObjecaoComJev` | `ehObjecaoValor` / `motivoDaObjecao` |
| `moto_escolhida` | `motoEscolhidaPeloClienteComJev` | — |
| `stage_classifier` | `classifyStage` | — |
| `jailbreak_detect` | `classifyJailbreak` | — |
| `knowledge_route` | `rotearConhecimentoComJev` | — |
| `flow_intent` | (ponto `flow_intent`) | — |
| `skill_select` | `selecionarSkillsComJev` | `matchSkills` |
| `catalog_criteria` | (ponto `catalog_criteria`) | `extrairCriterios` |

> A lista é viva: um ponto novo entra aqui **junto** com o binding e o `perguntaDe*`,
> nunca com regex próprio antes do veredito.
