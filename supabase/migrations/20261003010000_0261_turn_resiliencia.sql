-- 0261 · Resiliência do turno: timeout por tentativa + nº de tentativas do modelo.
--
-- ─── O que entra ────────────────────────────────────────────────────────────
-- Trava ANTI-TRAVAMENTO: se o modelo do turno empaca, o turno não pode segurar a
-- fila (nem os outros clientes). Estas duas colunas na VERSÃO do agente definem
-- quanto esperar por tentativa e quantas tentativas antes de liberar a fila e
-- avisar o humano. Ficam configuráveis pela tela do agente.
--
-- Aditiva: defaults preservam o comportamento de quem não configurar (as colunas
-- nascem preenchidas e o motor sempre as usa).

alter table public.ai_agent_versions
  add column if not exists turn_model_timeout_ms integer not null default 45000,
  add column if not exists turn_model_max_tentativas integer not null default 2;

alter table public.ai_agent_versions
  drop constraint if exists ai_agent_versions_turn_timeout_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_turn_timeout_check
    check (turn_model_timeout_ms between 1000 and 600000);

alter table public.ai_agent_versions
  drop constraint if exists ai_agent_versions_turn_tent_check;
alter table public.ai_agent_versions
  add constraint ai_agent_versions_turn_tent_check
    check (turn_model_max_tentativas between 1 and 20);

notify pgrst, 'reload schema';
