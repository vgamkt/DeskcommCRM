-- ============================================================================
-- 0254 — O ARQUIVO DO WEBHOOK ACEITA O CANAL DATAFY.
--
-- ─── O defeito, medido em produção ──────────────────────────────────────────
--
-- A 0235 criou o provider `datafy` e recriou `channel_sessions_provider_check`
-- para incluí-lo — mas esqueceu a SEGUNDA constraint de vocabulário de provider
-- do schema: `webhook_events_log_provider_check`, que a 0151 deixou com
-- ('waha','nuvemshop','generic','meta_cloud','zernio').
--
-- Efeito: todo webhook do Datafy era processado (a mensagem entrava no inbox),
-- mas `abrirArquivoDoWebhook` batia `23514` e o corpo CRU do payload nunca era
-- gravado. O log do contêiner registrava, a cada entrega:
--
--   [arquivo-webhook] não consegui abrir a linha
--   detail: new row for relation "webhook_events_log" violates check constraint
--           "webhook_events_log_provider_check"
--
-- O arquivo é justamente o instrumento que responde "o que o provedor mandou?"
-- quando um canal novo está sob investigação — e era o canal novo que não o
-- tinha. Medido: a mensagem de texto e o áudio de teste do parceiro entraram em
-- `messages` sem nenhuma linha correspondente em `webhook_events_log`.
--
-- ─── Por que é seguro ───────────────────────────────────────────────────────
--
-- Alargamento puro: aceitar MAIS valores não viola linha nenhuma que já passava
-- pelo CHECK antigo. Sem backfill, sem deduplicação. O bloco idempotente do
-- `baseline.sql` é o ÚNICO desta constraint (regra da issue #159) e já recebe
-- `datafy` na mesma versão.
-- ============================================================================

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;

alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check check (provider in (
    'waha', 'nuvemshop', 'generic', 'meta_cloud', 'zernio', 'datafy'
  ));
