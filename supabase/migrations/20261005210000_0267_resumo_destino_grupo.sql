-- 0267 · Resumo de conversas: destino NÚMERO e GRUPO independentes
--
-- ─── Por que ────────────────────────────────────────────────────────────────
-- O informante tinha UM destino (número OU grupo, via `destination_is_group`).
-- O dono quer poder mandar o resumo para um NÚMERO, para um GRUPO, ou para os
-- DOIS ao mesmo tempo. Cada destino pode sair por um canal diferente (o número
-- pelo canal oficial; o grupo só por um número por QR).
--
-- Aditivo e idempotente. O par `destination` + `destination_is_group` continua
-- valendo como o destino de NÚMERO (e, se `destination_is_group` = true, como o
-- grupo LEGADO). As colunas novas são o destino de grupo explícito.

alter table public.conversation_summary_settings
  add column if not exists destination_group text;

alter table public.conversation_summary_settings
  add column if not exists channel_session_id_group uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'conversation_summary_settings_channel_session_id_group_fkey'
  ) then
    alter table public.conversation_summary_settings
      add constraint conversation_summary_settings_channel_session_id_group_fkey
      foreign key (channel_session_id_group)
      references public.channel_sessions(id) on delete set null;
  end if;
end $$;

comment on column public.conversation_summary_settings.destination_group is
  'JID do grupo de WhatsApp (@g.us) que recebe o resumo. Null = não envia a grupo. Coexiste com `destination` (número).';
comment on column public.conversation_summary_settings.channel_session_id_group is
  'Canal (sessão) que ENVIA o resumo ao grupo. Null = usa o `channel_session_id` do número. Só faz sentido num canal por QR.';

notify pgrst, 'reload schema';
