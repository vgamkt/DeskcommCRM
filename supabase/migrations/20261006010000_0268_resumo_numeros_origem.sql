-- 0268 · Resumo de conversas: só números ESPECIFICADOS (lista de origem)
--
-- ─── Por que ────────────────────────────────────────────────────────────────
-- O informante resumia TODAS as conversas da organização. O dono quer escolher
-- QUAIS números de cliente entram no resumo (pode ser mais de um), configurável na
-- tela "Resumo de conversas". Só as conversas cujo CONTATO está na lista são
-- rastreadas e resumidas; lista vazia = não resume ninguém.
--
-- Aditivo e idempotente. Guarda os telefones em `source_numbers` (jsonb array de
-- strings). O gatilho `fn_conversation_summary_touch` passa a ignorar contatos fora
-- da lista (e todos quando a lista está vazia), evitando até criar estado.

alter table public.conversation_summary_settings
  add column if not exists source_numbers jsonb not null default '[]'::jsonb;

comment on column public.conversation_summary_settings.source_numbers is
  'Telefones de CLIENTE (strings) cujas conversas são resumidas. Vazio = não resume ninguém. Pode ter mais de um.';

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
  v_source jsonb;
  v_phone text;
begin
  begin
    select enabled, interval_minutes, destination_contact_id, source_numbers
      into v_enabled, v_interval, v_dest_contact, v_source
      from public.conversation_summary_settings
     where organization_id = NEW.organization_id;
    if not found or v_enabled is not true then
      return NEW;
    end if;

    -- Só números ESPECIFICADOS. Lista vazia = não resume ninguém.
    if v_source is null or jsonb_array_length(v_source) = 0 then
      return NEW;
    end if;
    select regexp_replace(coalesce(phone_number, ''), '[^0-9]', '', 'g')
      into v_phone
      from public.contacts where id = NEW.contact_id;
    if not exists (
      select 1 from jsonb_array_elements_text(v_source) as t(num)
       where regexp_replace(t.num, '[^0-9]', '', 'g') = v_phone
    ) then
      return NEW;
    end if;

    -- Guarda anti-laço: a conversa com o PRÓPRIO destino (o gerente) nunca entra
    -- no rastreamento — senão o informante resumiria a conversa dele e mandaria
    -- de volta para ele.
    if v_dest_contact is not null and NEW.contact_id = v_dest_contact then
      return NEW;
    end if;

    select is_group into v_is_group from public.conversations where id = NEW.conversation_id;
    if coalesce(v_is_group, false) then
      return NEW; -- grupos ficam de fora nesta versão
    end if;

    if NEW.direction = 'inbound' then
      -- Primeira mensagem do CLIENTE cria/entra no rastreamento; qualquer
      -- mensagem posterior (inbound ou outbound) reinicia o relógio.
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
      -- Saída só mexe em conversa JÁ rastreada (o cliente falou antes). Sem
      -- isto, uma conversa que só tem mensagens nossas viraria informante.
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
