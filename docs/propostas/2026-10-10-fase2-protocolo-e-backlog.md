# Fase 2 — Protocolo de controle + Backlog (um por vez)

- **Data:** 2026-10-10
- **Objetivo:** tirar os "overrides" do motor e passar a decisão para a Jev
  (um decisor só), **um item por vez**, com teste antes e validação em cenário real.
- **Regra de ouro:** o motor monta e envia; **quem decide é a Jev**. Regex só fallback.

## Protocolo de cada item (ciclo fechado)

1. **DESCREVER** — citar `arquivo:linha` do override e o efeito atual.
2. **TESTE (vermelho)** — escrever o teste que descreve o comportamento desejado;
   rodar ANTES e confirmar que falha.
3. **MUDANÇA MÍNIMA atrás de FLAG** — a mudança fica atrás de um env
   (ex.: `TURNO_DECISOR_<item>=1`), **default OFF = comportamento de hoje**.
4. **DEPLOY** com a flag OFF → produção idêntica (risco zero).
5. **TESTE REAL** — ligar SÓ essa flag e rodar o roteiro real (nº de teste).
6. **MEDIR** — antes/depois (latência, tokens, msgs, loop, contradições).
7. **DECIDIR** —
   - bom → **promover** (default ON) e remover a flag/caminho antigo;
   - ruim → flag OFF (sem redeploy de código).
8. **Nunca** ligar 2 flags no mesmo teste. Um item por vez.

## Backlog ordenado (do menor risco ao maior)

Cada item remove UM ponto onde o motor decide por cima (ou do LLM, ou da Jev).

| # | Override | Onde | Efeito hoje | Risco |
|---|---|---|---|---|
| 2.1 | C-107 troca o texto do modelo por `PERGUNTA_DE_ORCAMENTO` | `inbound-turn.ts:3465, 5347` | preço sem valor → motor envia pergunta fixa | baixo |
| 2.2 | Jev `perguntar` → `PERGUNTA_DE_NECESSIDADE` fixa | `inbound-turn.ts:3482, 655` | pedido vago → pergunta fixa | baixo |
| 2.3 | Remoção da skill de catálogo pelo motor | `inbound-turn.ts:3618, 3641` | motor tira skill quando Jev nega/objeção | médio |
| 2.4 | Negociação tem prioridade sobre oferta | `inbound-turn.ts:3428` | ação de negociação ignora veredito da Jev | médio |
| 2.5 | Fluxo tem prioridade sobre oferta | `inbound-turn.ts:3420` | fluxo ativo bloqueia oferta mesmo se Jev libera | médio |
| 2.6 | Trava da pergunta do fluxo (motor reenvia) | `inbound-turn.ts:7151-7257` | motor reenvia a pergunta do fluxo se o modelo não a incluiu | médio |
| 2.7 | Trava de escolha/moto em foco | `inbound-turn.ts:6719` | motor proíbe listar outras motos | médio |
| 2.8 | Bloqueios de fotos do catálogo por `media_urls` | `inbound-turn.ts:4409, 4570` | motor remove fotos de catálogo do modelo | médio |
| 2.9 | Pré-escolha determinística da moto | `inbound-turn.ts:6382` | motor resolve a escolha antes do modelo | alto |

> Nota: o objetivo NÃO é apagar a regra, e sim **mover a decisão para a Jev**.
> Onde a regra nasceu de bug medido, o teste real da Fase 2.1 confirmará se a
> instrução da Jev já segura sozinha.

## Ordem de trabalho recomendada
1. **2.1** (C-107) — mais isolado: só decide o texto enviado num caso estreito
   (preço sem valor). Fácil de isolar e medir.
2. Depois 2.2, 2.3…
3. Fechada a Fase 2 → Fase 3 (turno de sistema + fim da 2ª bolha).

## Critérios de aceite da Fase 2 (por item)
- Teste do item: vermelho → verde.
- Suíte `lib/agent-engine/agent`: 407/407 verdes.
- `typecheck` e `lint` sem novos erros.
- Cenário real: sem contradição Jev×motor, sem loop/timeout, sem regressão visível.
