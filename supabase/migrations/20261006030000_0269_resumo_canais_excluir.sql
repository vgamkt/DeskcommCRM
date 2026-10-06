-- 0269 · Resumo: incluir por CANAL (número do sistema) e excluir por CLIENTE
--
-- ─── Por que (correção de rumo, 2026-10-06) ─────────────────────────────────
-- A 0268 tinha um único filtro por número de CLIENTE (só resumia esses). O dono
-- esclareceu: o foco principal é resumir TODAS as conversas que o bot recebe; ele
-- quer escolher os NÚMEROS DO SISTEMA (canais/provedores — Datafy, WAHA…) que
-- entram, e, à parte, EXCLUIR números de cliente que NÃO quer resumir.
--
-- Modelo final:
--   source_channel_session_ids (jsonb) → canais (channel_sessions.id) resumidos.
--                                        VAZIO = TODOS os canais.
--   exclude_numbers (jsonb)            → telefones de cliente que NÃO são resumidos.
--                                        VAZIO = nenhum excluído.
--
-- A coluna `source_numbers` (0268, recém-criada e nunca usada em produção) é
-- removida. Gatilho recriado com o novo critério. Aditivo/idempotente.

alter table public.conversation_summary_settings
  add column if not exists exclude_numbers jsonb not null default '[]'::jsonb;
alter table public.conversation_summary_settings
  add column if not exists source_channel_session_ids jsonb not null default '[]'::jsonb;

alter table public.conversation_summary_settings
  drop column if exists source_numbers;

comment on column public.conversation_summary_settings.source_channel_session_ids is
  'IDs de channel_sessions (números do sistema) cujas conversas são resumidas. Vazio = TODOS os canais.';
comment on column public.conversation_summary_settings.exclude_numbers is
  'Telefones de CLIENTE que NÃO são resumidos. Vazio = nenhum excluído.';

create or replace function public.fn_conversation_summary_touch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_enabled boolean;
  v_interval int;
  v_is_group boolean;
  v_dest_contact uuid;
  v_channels jsonb;
  v_exclude jsonb;
  v_phone text;
begin
  begin
    select enabled, interval_minutes, destination_contact_id, source_channel_session_ids, exclude_numbers
      into v_enabled, v_interval, v_dest_contact, v_channels, v_exclude
      from public.conversation_summary_settings
     where organization_id = NEW.organization_id;
    if not found or v_enabled is not true then
      return NEW;
    end if;

    -- CANAIS: lista não-vazia = só esses números do sistema entram.
    if v_channels is not null and jsonb_array_length(v_channels) > 0 then
      if NEW.channel_session_id is null
         or not exists (
           select 1 from jsonb_array_elements_text(v_channels) as t(sid)
            where t.sid = NEW.channel_session_id::text
         ) then
        return NEW;
      end if;
    end if;

    -- EXCLUSÃO por número de cliente.
    select regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g')
      into v_phone
      from public.contacts where id = NEW.contact_id;
    if v_exclude is not null and jsonb_array_length(v_exclude) > 0
       and exists (
         select 1 from jsonb_array_elements_text(v_exclude) as t(num)
          where regexp_replace(t.num, '[^0-9]', '', 'g') = v_phone
       ) then
      return NEW;
    end if;

    -- Guarda anti-laço: a conversa com o PRÓPRIO destino (o gerente) nunca entra.
    if v_dest_contact is not null and NEW.contact_id = v_dest_contact then
      return NEW;
    end if;

    select is_group into v_is_group from public.conversations where id = NEW.conversation_id;
    if coalesce(v_is_group, false) then
      return NEW; -- grupos ficam de fora nesta versão
    end if;

    if NEW.direction = 'inbound' then
      insert into public.conversation_summary_state
        (organization_id, conversation_id, contact_id, status, last_message_at, next_eval_at)
      values
        (NEW.organization_id, NEW.conversation_id, NEW.contact_id, 'active',
         NEW.sent_at, now() + make_interval(mins => v_interval))
      on conflict (organization_id, conversation_id) do update
        set last_message_at = greatest(public.conversation_summary_state.last_message_at, NEW.sent_at),
            next_eval_at = now() + make_interval(mins => v_interval),
            updated_at = now();
    else
      update public.conversation_summary_state
         set last_message_at = greatest(last_message_at, NEW.sent_at),
             next_eval_at = now() + make_interval(mins => v_interval),
             updated_at = now()
       where organization_id = NEW.organization_id
         and conversation_id = NEW.conversation_id;
    end if;
  exception when others then
    null;
  end;
  return NEW;
end;
$function$;

notify pgrst, 'reload schema';
