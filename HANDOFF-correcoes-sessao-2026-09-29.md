# HANDOFF — correções de atendimento (sessão 2026-09-29)

> Arquivo de memória da sessão. Serve para retomar o trabalho: o que já foi
> feito, o que está pendente e como subir. **Não contém segredos.**

## Objetivo da sessão
Corrigir, no sistema de atendimento:
1. Áudio (não transcrevia).
2. Nome (perguntava o nome mesmo já sabendo).
3. Catálogo (despejava motos indiscriminadamente).
4. CNH reperguntada.
5. `flow_start` falhando em loop.
6. Processos encadeados ("troca e financiar").
7. Provedor **Groq** (chave gerenciável).

## Feito e validado
1. **Áudio — cadeia de transcrição**: `TRANSCRIPTION_*` → **Groq** → **OpenRouter** → OpenAI.
   - `lib/messaging/media/transcription.ts` (`transcricaoEmCadeia`), `workers/media-derive-worker.ts`.
   - Testado ao vivo: transcreveu "Olá, boa noite, tudo bem? Você tem uma CB250?".
2. **Nome — `display_name`**: `lib/followup/atendimento.ts` (`valoresConhecidosDoContato`); o contexto do turno já resolve `name = display_name ?? name`.
3. **Trava do catálogo**: `lib/agent-engine/agent/turno-de-catalogo.ts` — só é turno de catálogo com sinal de moto; pedido de PROCESSO (financiar/troca/consignar/vender) não despeja motos.
4. **CNH durável**: `persistirDadosDoContato` ao finalizar o fluxo; backfill feito no contato do Vander.
5. **`flow_start`**: nome tolerante (acento/caixa/parcial) + fallback por gatilho quando omisso.
6. **Fila de fluxos**: `lib/followup/atendimento.ts` (`fluxos_pendentes` em `conversations.metadata`); "troca e financiar" → inicia um, enfileira o outro.
7. **Groq**: provedor BYOK em `lib/ai/pontos/provedores.ts`, validador em `lib/ai/provider-validators.ts`, registry em `lib/agent-engine/edge/llm/providers.ts`, ensaio em `lib/ai/runtime/agent.ts`.
8. **Registro de ponto `flow_intent`** em `lib/ai/pontos/registro.ts` (destrava `pontos-de-ia-completude`).
9. **Descrição da moto EM FOCO** (apresentação e objeções): `colunaDescricao` (`lib/external-db/catalogo.ts`) + `carregarDescricaoDaMoto` (`lib/agent-engine/agent/catalogo-do-banco.ts`) + linha no bloco "Estado do atendimento" (`estado-do-atendimento.ts`) + fiação em `inbound-turn.ts` (detecta a escolha já pela mensagem do cliente). Traz só a descrição da moto em foco, nunca de várias.
10. **Correções do teste ao vivo (2026-09-30):**
    - **Busca da descrição pela identidade CRUA** (`nome`+`versao` dos `valores`), não pelo nome composto — o composto não casava a coluna `nome` ("CB 300"). Confirmado: CB 300 F Twister 60ch, CB 300 R Flex 586ch.
    - **Citação vai ao modelo**: bloco `## O cliente respondeu a esta mensagem sua` no sufixo (antes o modelo não sabia a qual moto "Gostei dessa" se referia e chutava).
    - **Escolha já identificada**: bloco `## Escolha do cliente (já identificada)` quando o motor resolve pela citação/mensagem.
    - **Fotos da moto escolhida vencem o `media_urls` do modelo**: a checagem de escolha passou a vir ANTES do `fotosDeclaradas` no `planoAutomatico` (o modelo mandava foto da moto errada).
    - **Moto EM FOCO persistida e injetada todo turno**: `renderBlocoDeEstado` ganhou `motoEmFoco` (escolhida ?? referência) — não depende do modelo lembrar; substituível quando o cliente demonstra interesse em outra.

## Verificação
- `tsc --noEmit` limpo.
- `eslint .` → 0 erros (366 warnings pré-existentes).
- 907 testes verdes nas áreas afetadas (followup, agent-engine, mídia, env, pontos, provedores).

## Estado do ambiente (VPS)
- Worker roda a imagem **local de teste** `deskcomm-worker:test-nome-audio` (override por shell — **NÃO** persistido no `.env`).
- Scheduler **restaurado**.
- Credencial **Groq** gravada em `ai_provider_credentials` (label "Groq (áudio)", `validated_at` preenchido; id `9bed4f39-7200-4308-8d20-e2d11e1f2c27`).
- `.env` **sem** `TRANSCRIPTION_*` (a fonte é a credencial).
- App roda a imagem **antiga** (não conhece "groq") → o card "Groq" na tela só aparece após deploy do app.

## Pendente
- [x] Modificação "descrição da moto em foco" — implementada e testada.
- [x] **Commit de release** `fe66efa0` + tag `v1.30.0` (push feito) + `.changes/correcoes-atendimento-audio-fluxos-garantia.md`.
- [x] **Imagens buildadas localmente** `ghcr.io/vgamkt/{deskcommcrm,deskcomm-worker,deskcomm-scheduler}:1.30.0` e `:latest`.
- [x] **Deploy na VPS** com as imagens locais (`pull_policy=never`) — app/worker/scheduler healthy.
- [ ] **Publicar no GHCR** — BLOQUEADO: os tokens da VPS não têm `write:packages`; o CI recusa tag fora da `main`. Falta um PAT com `write:packages` (ou merge na `main`). As imagens já estão prontas localmente; é só `docker login ghcr.io` + `docker push`.
- [ ] (Fino) App responde `version:"local"` — no release oficial, definir `APP_VERSION`.

## Scripts do processo
- `scripts/release-local.sh <versao>` — verifica, commita, push, swap temporário, build e push GHCR.
- `scripts/deploy-vps.sh` — pull + up de app/worker/scheduler.
- ⚠️ Deploy LOCAL usa `*_PULL_POLICY=never` para NÃO puxar a `:latest` antiga do GHCR.

## Armadilha do deploy
`docker compose up` **sem override** volta para `ghcr.io/vgamkt/deskcomm-worker:latest`
(antigo). No deploy, **fixar** `WORKER_IMAGE`/`APP_IMAGE` (no `.env` ou num override).

## Arquivos alterados NESTA sessão (minhas mudanças)
- `lib/messaging/media/transcription.ts`, `workers/media-derive-worker.ts`
- `lib/followup/atendimento.ts`, `lib/followup/atendimento.test.ts`, `lib/followup/captura-do-fluxo.test.ts`
- `lib/agent-engine/agent/inbound-turn.ts`, `turno-de-catalogo.ts`, `turno-de-catalogo.test.ts`, `estado-do-atendimento.ts`, `selecao-por-intencao.ts`
- `lib/agent-engine/edge/llm/providers.ts`
- `lib/ai/pontos/provedores.ts`, `lib/ai/pontos/registro.ts`, `lib/ai/provider-validators.ts`, `lib/ai/runtime/agent.ts`
- `lib/env.ts`, `.env.example`
- `tests/unit/media-transcription.test.ts`, `tests/unit/media-derive-worker.test.ts`

## WIP do usuário (JÁ estava na árvore, não é desta sessão)
- Catálogo: `lib/agent-engine/agent/catalog-config.*`, `catalogo-da-conversa.*`, `extrair-criterios.*`, `lib/external-db/catalogo.*`, `app/app/ai/agents/[id]/_components/CatalogoDoAgente.tsx`, `app/app/integracao-dados/[id]/_components/ConfigurarCatalogo.tsx`, `lib/i18n/dicionario.ts`, `lib/waha/ingest.ts`
- `lib/agent-engine/agent/flow-intent.ts` (+test), `lib/waha/citacao.ts` (+test)
- `scripts/aplicar-fotos-nos-fluxos.ts`, `scripts/aplicar-venda-consignacao.ts`, `tmp-catalogo.json`
