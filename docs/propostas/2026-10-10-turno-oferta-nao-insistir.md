# Mudança — "Oferta só existe se a decisão liberar" (Camada 1)

- **Data:** 2026-10-10
- **Branch:** feat/fluxos-de-atendimento
- **Autor:** análise assistida (evidência de teste real)
- **Status:** PROPOSTO (não implementado até autorização)

## 1. Problema (provado em teste real)

Em atendimento real (contato +5512997700101, canal datafy `7cdcca02`), o turno
**trava e estoura o tempo** quando a vendedora (IA de redação) tenta oferecer
motos que a decisão do turno já havia negado.

Evidência (worker `deskcommcrm-worker-1`, 2026-10-10):

```
01:00:39  oferta.veredito_jev = false            → "não oferecer"
01:00:39  skill de catálogo removida — a Jev negou a oferta
01:01:49  oferta de motos do modelo bloqueada pela régua  motivo=jev_negou
01:02:12  llm: chamada falhou agent_turn  "This operation was aborted"   (90s)
01:02:22  breaker: same_tool_failure  tool=send_message  failures=3
01:02:47  breaker: same_tool_failure  tool=send_message  failures=5
01:02:53  agent_turn steps=7  input=130315 tokens  → "turno superado"
```

O mesmo padrão reapareceu no turno "Quais modelos você tem":

```
03:24:34  llm: chamada falhou agent_turn  "This operation was aborted"   (90s)
03:24:39  oferta de motos do modelo bloqueada pela régua  motivo=fluxo_de_atendimento_em_andamento
03:24:59  agent_turn (retry) steps=5  input=94435 tokens   → turno levou 163s
```

## 2. Causa-raiz (estrutural)

- A **régua** decide se pode oferecer (`decidirOfertaDoTurno`), mas a
  **ferramenta `send_message` continua expondo o parâmetro `motos`**.
- Quando a vendedora passa `motos`, a régua **bloqueia** e devolve um **erro
  retentável** (`oferta_prematura`). A IA interpreta como tropeço e **tenta de
  novo** — até o loop estourar `turn_model_timeout_ms` (90 s).
- Dois "decisores" divergem: a **Jev** (oferta) e a **régua** (fluxo ativo
  sobrepõe a oferta). Ex.: no turno "Quais modelos", a Jev disse *ofertar* e a
  régua bloqueou por *fluxo em andamento* → a vendedora foi mandada oferecer e
  proibida de enviar.

## 3. Conserto proposto (Camada 1 — mínima e alinhada à doutrina)

> **A ferramenta reflete a decisão.** `motos` só é exposto no `send_message`
> quando a MESMA decisão de oferta do turno liberar. Assim a ferramenta e a régua
> **concordam por construção** — sem veto tardio, sem re-tentativa, sem loop.

Princípio atendido: *"a Jev decide sempre; o motor só monta e envia"*. Não há
bypass novo: usa-se a decisão que já existe (`decidirOfertaDoTurno`).

### Mudança de comportamento
- **Antes:** `send_message` sempre aceita `motos`; se não autorizado → erro
  retentável → IA insiste → timeout.
- **Depois:** se a decisão do turno **não** libera oferta, `send_message` **não
  tem** o parâmetro `motos`; a IA escreve só o texto. Encerra o loop.
- Quando a decisão **libera** (cliente pediu catálogo/opções), nada muda.

## 4. Arquivos/linhas tocados

- `lib/agent-engine/agent/inbound-turn.ts`
  - ~`3734` (`const rawTools`): calcular `ofertaLiberada = preview || decidirOfertaDoTurno(mensagemDoJob ?? '').pode`.
  - ~`4322` (`send_message`): expor `motos` apenas se `ofertaLiberada`
    (via `inputSchema.omit({ motos: true })` quando não liberado).
  - ~`4375`: manter a régua como **rede de segurança**, mas o erro passa a ser
    **terminal** (o motor responde em texto; não realimenta a IA para re-tentar).
- **Sem** migration, **sem** mudança de banco, **sem** mudança de prompt/skill.

## 5. Critérios de aceite

1. Com decisão de oferta **negada**, o schema de `send_message` entregue ao
   modelo **não contém** `motos`.
2. Com decisão **liberada**, o schema continua contendo `motos`.
3. Num turno real onde a oferta é negada, **não** aparece
   `breaker: same_tool_failure` nem `llm: chamada falhou ... aborted`.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` verdes.

## 6. Plano de teste

- **Unit (antes de implementar, vermelho):**
  `lib/agent-engine/agent/oferta-nao-insistir.test.ts` — testa o helper puro
  `parametrosDeSendMessage(ofertaLiberada)` e o schema derivado.
- **Real monitorado (depois):** repetir o roteiro que travou
  (`Ola` → `Preciso de uma moto para o dia a dia` → `Até 20 mil` → `Quais modelos você tem`)
  e comparar: nº de `same_tool_failure`, nº de `aborted`, latência por turno.

## 6.1 Resultado do teste real (10/10, deploy `dcaf95ff`)

Mesmo roteiro (`Ola` → `Preciso de uma moto...` → `Até 20 mil` → `Quais modelos...`),
4 turnos, medido no worker:

| métrica (janela do teste) | ANTES | DEPOIS |
|---|---|---|
| `breaker: same_tool_failure` | 3–5 | **0** |
| `llm: chamada falhou` | várias | **0** |
| `This operation was aborted` (timeout 90s) | várias | **0** |
| `oferta de motos ... bloqueada pela régua` | várias | **0** |
| `turno superado por inbound` | várias | **0** |
| `handoff por lentidão` | 1 | **0** |
| `agent_turn` latência | 65–90s+ (aborto) | **12,7 / 18,3 / 21,3 / 36,9 s** |
| 1ª resposta por turno | até 163s | **41–53 s** |

**Conclusão:** o loop de oferta e o timeout desapareceram. Testes: `typecheck` ✓,
`lint` (0 erros) ✓, `vitest lib/agent-engine/agent` **407/407** ✓, teste novo ✓.

**Ainda fora deste conserto (observado, não resolvido):** a 2ª bolha / mensagens
duplicadas (2 por turno; 8 no turno de catálogo) — vem do `reescrita_avulso`
(Camada 2). Comportamento de venda não mudou quando a oferta É liberada.

## 7. Fora de escopo (fases seguintes)
- Rajada como pacote rotulado (Camada 0).
- Turno de sistema separado, sem cache, só regras inegociáveis (Camada 2-B).
- Fim da 2ª bolha/`reescrita_avulso`.
- Bloqueio por `media_urls` de catálogo (tratar depois).

## 8. Continuidade — Camada 2 (GUARDADA, não implementada)

Objetivo: fim da 2ª bolha e separação do "turno de sistema". Itens, em ordem:

1. **Fim da duplicação** — hoje `reescrita_avulso` reescreve e reenvia a mesma
   resposta (2 bolhas/turno; 8 no turno de catálogo). Plano: ou (a) usar o texto
   reescrito como a ÚNICA resposta, ou (b) eliminar o reenvio. Uma resposta por turno.
2. **Rajada como pacote rotulado (Camada 0)** — cada mensagem etiquetada
   (`pergunta`/`resposta-a-fluxo`/`escolha`/`dado`) e a decisão passa a ser sobre o
   pacote, com "o que falta responder" explicitado.
3. **Turno de sistema separado (Camada 2-B)** — mensagem causada por fluxo/regra
   sai em turno próprio: **sem cache**, **só as regras inegociáveis**, baseado no
   contexto total com **ênfase no pendente**, **unificando/reescrevendo** numa
   resposta natural. Não disputa espaço com a venda.
4. **Bloqueio de `media_urls` de catálogo** pela mesma decisão de oferta.

Critério de aceite da Camada 2: **1 resposta por turno** (sem 2ª bolha) e turno de
sistema sem carregar catálogo/skills de venda. Sem regressão nos 407 testes.
