-- 0264 · Permite DESVINCULAR a credencial de uma versão de agente (não-nulo -> null).
--
-- ─── O problema ─────────────────────────────────────────────────────────────
-- O trigger `fn_ai_agent_version_content_immutable` veta editar o conteúdo de uma
-- versão não-draft, e `credential_id` está na lista. Ao excluir uma credencial,
-- a FK (`ai_agent_versions.credential_id` -> `ai_provider_credentials.id`,
-- ON DELETE RESTRICT) exige soltar as versões que a referenciam. Mas versões
-- SUPERSEDED/ARCHIVED (histórico) eram imutáveis — dava para editar só rascunho.
--
-- Consequência medida (2026-10-05): uma credencial `opencode_go` defasada, presa
-- a 3 versões `superseded`, NÃO tinha como ser excluída pela tela — o UPDATE
-- para `credential_id = null` estourava a trigger e a rota devolvia 500.
--
-- ─── A regra ────────────────────────────────────────────────────────────────
-- Continua imutável TROCAR a credencial de uma versão não-draft. Só passa a ser
-- permitido DESVINCULAR (não-nulo -> null): a versão histórica perde a
-- referência a uma chave que deixou de existir, e nenhum conteúdo muda.
--
-- Aditiva e idempotente: recria a função com o corpo atual (0263) + o ramo novo.

create or replace function public.fn_ai_agent_version_content_immutable() returns trigger
language plpgsql as $fn$
begin
  if old.status <> 'draft' and (
       new.system_prompt                is distinct from old.system_prompt
    or new.provider                     is distinct from old.provider
    or new.model                        is distinct from old.model
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

  -- `credential_id`: permitido APENAS DESVINCULAR (não-nulo -> null). Possibilita
  -- excluir uma credencial defasada presa a versões superseded; TROCAR a chave de
  -- uma versão não-draft continua proibido.
  if old.status <> 'draft'
     and new.credential_id is distinct from old.credential_id
     and not (old.credential_id is not null and new.credential_id is null)
  then
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
