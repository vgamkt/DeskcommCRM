-- 0263 · Imutabilidade da versão publicada cobre as colunas novas de resiliência.
--
-- ─── O que entra ────────────────────────────────────────────────────────────
-- O trigger `fn_ai_agent_version_content_immutable` (0051) veta a edição de
-- CONTEÚDO de uma versão não-draft (draft→published→superseded→archived). A
-- lista era explícita; as colunas criadas depois dela ficaram de fora:
--
--   * `turn_model_timeout_ms` / `turn_model_max_tentativas` (0261)
--   * `handoff_notification_number` (0262)
--
-- Consequência medida: um UPDATE direto numa versão PUBLICADA podia mudar o
-- timeout ou o número de aviso — contrariando a regra "editar = versão draft
-- nova; rollback = revert". Esta migration traz a lista para o estado atual.
--
-- Aditiva e idempotente: recria a função com o corpo atual + as 3 colunas.

create or replace function public.fn_ai_agent_version_content_immutable() returns trigger
language plpgsql as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt                is distinct from old.system_prompt
    or new.provider                     is distinct from old.provider
    or new.model                        is distinct from old.model
    or new.credential_id                is distinct from old.credential_id
    or new.tool_ids                     is distinct from old.tool_ids
    or new.trigger_config               is distinct from old.trigger_config
    or new.channel_session_id           is distinct from old.channel_session_id
    or new.max_steps                    is distinct from old.max_steps
    or new.turn_model_timeout_ms        is distinct from old.turn_model_timeout_ms
    or new.turn_model_max_tentativas    is distinct from old.turn_model_max_tentativas
    or new.handoff_notification_number  is distinct from old.handoff_notification_number
    or new.token_budget                 is distinct from old.token_budget
    or new.cost_budget_cents            is distinct from old.cost_budget_cents
    or new.history_message_window       is distinct from old.history_message_window
    or new.history_token_window         is distinct from old.history_token_window
    or new.handoff_keywords             is distinct from old.handoff_keywords
    or new.handoff_tool_enabled         is distinct from old.handoff_tool_enabled
    or new.followup                     is distinct from old.followup
    or new.multimodal_input             is distinct from old.multimodal_input
    or new.video_frames_enabled         is distinct from old.video_frames_enabled
    or new.split_messages               is distinct from old.split_messages
    or new.split_max_chars              is distinct from old.split_max_chars
    or new.cases_enabled                is distinct from old.cases_enabled
    or new.operator_enabled             is distinct from old.operator_enabled
    or new.operator_model               is distinct from old.operator_model
    or new.operator_tool_ids            is distinct from old.operator_tool_ids
    or new.pipeline_ids                 is distinct from old.pipeline_ids
    or new.knowledge_source_ids         is distinct from old.knowledge_source_ids
    or new.version_number               is distinct from old.version_number
    or new.agent_id                     is distinct from old.agent_id
    or new.organization_id              is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_ai_agent_versions_content_immutable on public.ai_agent_versions;
create trigger trg_ai_agent_versions_content_immutable
  before update on public.ai_agent_versions
  for each row execute function public.fn_ai_agent_version_content_immutable();

notify pgrst, 'reload schema';
