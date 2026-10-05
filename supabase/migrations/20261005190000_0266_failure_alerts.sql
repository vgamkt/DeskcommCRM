-- 0266 · Avisos de falha por agente (número que envia + número que recebe)
--
-- ─── Por que ────────────────────────────────────────────────────────────────
-- O `ai_agent_versions.handoff_notification_number` nasceu na resiliência do
-- turno e ficou MISTURADO com o card do agente "Passar para uma pessoa" (que no
-- original só tem o interruptor + palavras-chave). O dono quer o aviso de falha
-- num lugar só, junto do informante ("Resumo de conversas"), com POR AGENTE:
-- cada agente pode avisar num número diferente (e por um número que envia
-- diferente).
--
-- Guardamos as regras em `conversation_summary_settings.failure_alerts` (jsonb,
-- sem tabela nova nem RLS nova):
--   [{ "agent_id": uuid, "channel_session_id": uuid|null,
--      "destination": "5511...", "enabled": true }]
--
-- Aditiva e idempotente.

alter table public.conversation_summary_settings
  add column if not exists failure_alerts jsonb not null default '[]'::jsonb;

comment on column public.conversation_summary_settings.failure_alerts is
  'Regras de aviso de falha por agente: [{agent_id, channel_session_id, destination, enabled}]. Vazio = não avisa.';

notify pgrst, 'reload schema';
