# STATUS E PENDÊNCIAS — simplificação do turno (handoff)

- **Data:** 2026-10-13 · **Repo:** `/root/DeskcommCRM` · **Branch:** `feat/fluxos-de-atendimento`
- **Prod:** deploy `bash /root/arquivos/scripts/validacao/subir-sem-testes.sh` (~13 min, falha transitória de fonte → retentar)
- **Org:** `e40dc035-b553-4383-8aac-311d29abcfdc` · **Agente:** `a069549c-278f-4d4d-9501-355c5f3f5e4e`
- **Bot (Marcela):** +5512981672501 (**datafy**) · **Auxiliar de teste:** +5512997700101 (waha)
- **Plano vivo:** `docs/propostas/PLANO-VIVO-simplificacao-turno.md` (fonte da verdade)

---

## 1) O que ESTÁVAMOS resolvendo (e o estado)

| Item | Status | Evidência |
|---|---|---|
| **G3.10** — pedido inequívoco de catálogo vence a Jev ("e uma lander?") | ✅ no ar | `pedidoDeCatalogoInequivoco` + `TERMO_DE_MOTO` estendido |
| **G3.11** — faixa de preço sozinha aciona a oferta ("até 15 mil") | ✅ no ar | `RE_FAIXA_DE_PRECO`; F2 → `cliente_citou_faixa`, 7 bolhas |
| **G3.11b** — "minha moto é uma CG 150…" NÃO dispara motos (falso-positivo) | ✅ no ar | `RE_MOTO_DO_CLIENTE`; F4 → `pode:false`, 1 bolha |
| **Fecho do turno de catálogo** — venda vence o fluxo; pergunta **DEPOIS das fotos** | ✅ no ar | `fecho-do-turno.ts`; formato intro → fotos → pergunta |
| **Junção não funde turno com MÍDIA** | ✅ no ar | evita pergunta antes das fotos / engolir fotos |
| **G3.5** — negociação não bloqueia mais a oferta | ✅ no ar | `pode:true` medido |
| **G3.7** — trava da pergunta → Jev | ✅ mantido (caminho raro) | `pergunta_do_fluxo__jev` |
| **Preço absurdo no catálogo** | ✅ corrigido via SQL | `motos.id=37` `950000→9500` |

**Testes:** `lib/agent-engine` + `lib/followup` = **1100 verdes** (2026-10-14); typecheck ✓; lint 0 erros.
**Plano de conformidade:** `docs/propostas/PLANO-JEV-AUTORIDADE.md` — **concluído** (A1–A3, B1, C/D/E revisados, F1–F6).

---

## 2) PENDÊNCIAS ABERTAS (o que fazer na próxima sessão)

### P1 — **Fluxo de Qualificação pede "cidade" repetidamente** — ✅ RESOLVIDO (2026-10-13)
- **Causa-raiz (confirmada):** **NÃO era o gatilho**. A cidade era **perguntada e nunca gravada**:
  `contact_flow_data` do contato de teste tinha **cidade `value NULL`, `attempts 3`** (teto).
  Em `validarRespostaDoFluxo` (`lib/agent-engine/agent/flow-validate.ts`), um **`return` antecipado**
  devolvia **só os campos DISCRETOS** que a Jev resolveu no turno (ex.: CNH) e **descartava os campos de
  TEXTO** que ela também marcou como respondidos — o valor do texto é escrito pelo extrator (chat), que nunca
  era chamado. "moro em São José dos Campos e tenho CNH" → gravava CNH e **perdia a cidade**.
- **Correção:** calcula o que sobra para o chat ANTES do atalho; só pula o chat quando não sobra campo de
  texto/número/data; se o chat falhar, preserva os discretos já resolvidos pela Jev. 3 testes; 1081 verdes.
- **Evidência (build `dcaf95ff` no ar):** probe no deployed → misto devolve `[cnh, cidade]`; **end-to-end real**
  (webhook → enrollment Qualificação + "moro em Campinas e tenho CNH") → **`contact_flow_data` gravou
  `cidade=Campinas`, `cnh=sim`**.
- **Nota:** o gatilho "quero uma moto" fica como está (decidido: a causa era a gravação, não o gatilho).

### P2 — **Regex/palavra-chave: inventário e migração** — ✅ RESOLVIDO (2026-10-14)
- **Inventário entregue:** `docs/propostas/INVENTARIO-regex-vs-jev.md` (todos os pontos, por arquivo:linha).
- **Auditoria de conformidade:** `docs/propostas/REVISAO-CONFORMIDADE-DOUTRINA.md` (violações + pontos descobertos).
- **Migração/ajuste (no `PLANO-JEV-AUTORIDADE.md`):**
  - **Entrada de fluxo:** `flow_start` sem nome agora consulta a Jev primeiro (regex só fallback); `melhorFluxoPorGatilho`/`fluxosPorGatilho` seguem como 3º recurso.
  - **Oferta = AUTORIDADE da Jev** (`decidirOfertaComAutoridadeDaJev`): `pedidoDeCatalogoInequivoco`/`pedidoExplicitoDeMaisOpcoes` viraram **fallback** (só sob veredito `null`) — B1.
  - **`TERMO_DE_MOTO`** sem genéricos (`categoria`/`cc`/`cilindrada`) — A1; **guarda de foco** — A2.
  - **Pontos "descobertos"** (`clienteCitouAno`, `desconto`) revisados: parse/input justificado (Fase C).
  - **Handoff regex/opt-out** mantidos [A] (segurança/legal, por decisão).
- **Resultado:** todo ponto de decisão passa pela **Jev (autoridade)**; determinístico só como **fallback sob `null`**.

### P3 — Observações menores do teste pesado — ✅ TRATADAS
- **B3** (modelo escreve fala de negociação quando a ação é oferta): **mitigado** — regra "Não faça pitch não
  solicitado" + "Não se repita" no brief (F1/F2) e fecho de catálogo determinístico (F3). Não determinístico por
  natureza (é fala do modelo), mas validado ao vivo.
- **B9** (ao concluir o fluxo às vezes não faz pergunta): **por design** — o bloco de fluxo CONCLUÍDO manda
  *"envie os PRÓXIMOS PASSOS e NÃO faça perguntas"* (`renderBlocoDeAtendimento`/`blocoDoFluxoCompacto`). Fechar o
  roteiro sem nova pergunta é decisão; se o dono quiser pergunta de seguimento, é mudança de produto.
- **C3** ("até 15 mil" após já ter mostrado motos): **resolvido por B1** — quem decide reofertar agora é a **Jev**
  (`offer_motos`), com o contexto (moto em foco/busca). Não há mais régua forçando reoferta.

### P4 — Latência (medida, não atacada) — [~] em observação
- Rajada: ~54–56s típico; outlier de **170s** (retry/abort de provedor). Não é bug; melhorias são otimização
  (prompt/tokens, debounce). Fora do escopo desta revisão.

### P5 — Fases do plano inicial — conforme decisão do dono
- **Fase 3** (turno de sistema separado) — parcial (a junção já dá 1 bolha). **Fase 5** (motor como servidor) —
  parcial. **Fase 4 (Camada 0)** — testada e **descartada**. **Grupo 4** (contenção) — **adiado** por decisão do dono.

---

## 3) Como testar (harness)

- **Runner de 1 turno:** `/tmp/opencode/one-turn.js` (foi apagado na limpeza — recriar conforme abaixo).
- Envia via WAHA `sendText` (sessão `org_e40dc035_088c53ac96424e2bb62c4a59cf3cc287`, chat `5512981672501@c.us`) e lê `messages`/`llm_calls`.
- Rodar dentro do worker: `docker cp <script> deskcommcrm-worker-1:/app/x.js && docker exec deskcommcrm-worker-1 sh -lc 'cd /app && node x.js'` (o container **não tem bash**, só `sh`; sem here-string `<<<`).
- **Limpar estado do lead** entre testes: apagar `messages`/`lead_notes`/`conversations` do contato + resetar `contacts.force_human=false` e `custom_fields='{}'`.
- **Contato de teste:** `703341ab-4aeb-4064-acd4-720e7eaed309` (Vander). O bot grava no contato `3a76c6ea…` (+5512981672501) quando o envio é do próprio bot.

## 4) Observações de infra
- Se o bot parar de responder, **conferir a sessão datafy do +5512981672501** (`channel_sessions` `7cdcca02…`) — se `FAILED`, o bot fica offline (renovar assinatura datafy).
- Catálogo externo: container `allma-db`, db `vgasistemas_n8n`, tabela `public.motos`. Acesso de escrita: `docker exec allma-db sh -lc 'psql -U postgres -d vgasistemas_n8n -c "…"'`.
