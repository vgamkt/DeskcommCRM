-- ============================================================================
-- 0255 — RESUMO DE CONVERSAS: o informante de follow-up para o gerente.
--
-- ─── O que entra ────────────────────────────────────────────────────────────
--
-- Uma feature de monitoramento: a cada X minutos de SILÊNCIO numa conversa, o
-- sistema resume o que houve (cliente + bot + operador) e manda o composto para
-- um número de WhatsApp cadastrado — um "informante" para o gerente saber quem
-- espera o quê, sem abrir o inbox.
--
-- Duas tabelas:
--
--   conversation_summary_settings — a configuração por ORGANIZAÇÃO (ligada,
--     destino, cadência, tamanho do lote). Uma linha por org.
--
--   conversation_summary_state — o estado por CONVERSA: o resumo atual, até
--     qual mensagem ele resume, e `next_eval_at` (o alvo do debounce). É esta
--     tabela que o cron reclama; NUNCA se varre `conversations` inteira.
--
-- ─── Por que um TRIGGER, e não um handler de event_log ──────────────────────
--
-- A regra "qualquer mensagem (cliente, bot ou operador) reinicia o relógio"
-- precisaria reagir a `message.received` E a `message.sent`. Mas `message.sent`
-- nunca teve handler: medido no banco, 2458 eventos `message.sent` e 2401
-- `message.outbound` estão `pending`. Registrar um handler para eles faria o
-- drain varrer esse backlog de uma vez e disparar um resumo para cada conversa
-- antiga — uma tempestade no dia do deploy.
--
-- O trigger AFTER INSERT em `messages` resolve os DOIS lados sem tocar no
-- event_log e sem depender de canal: a ingestão de waha/meta/datafy/zernio já
-- grava em `messages`, então o gatilho vale para todos. O corpo engole exceção
-- de propósito: uma falha do resumo NUNCA pode derrubar a gravação da mensagem.
--
-- ─── Por que o debounce é `next_eval_at = agora + intervalo` ────────────────
--
-- Cada mensagem nova EMPURRA o alvo. Só quando passa o intervalo SEM mensagem
-- nova é que `next_eval_at <= now()` e o cron reclama a linha. O cron lê só as
-- linhas vencidas (índice parcial), nunca a base inteira.
--
-- `next_eval_at` NULL = nada pendente (a conversa já foi resumida e está quieta).
--
-- ─── Vocabulário de destino ─────────────────────────────────────────────────
--
-- `destination` é o telefone E.164 (só dígitos) OU o id de grupo — como o
-- usuário o digita. `destination_is_group` diz qual dos dois. Nesta versão o
-- envio a grupo só funciona no canal por QR (WAHA); no oficial/parceiro o
-- adapter recusa grupo e a falha sobe como erro tratado.
-- ============================================================================

create table if not exists public.conversation_summary_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  -- De qual número a mensagem sai. NULL = nenhuma conexão escolhida (a feature
  -- fica inerte, e a tela pede para escolher).
  channel_session_id uuid references public.channel_sessions(id) on delete set null,
  -- Telefone E.164 em dígitos (ex.: 5531999998888) ou id de grupo (ex.: ...@g.us).
  destination text,
  destination_is_group boolean not null default false,
  -- Contato do DESTINO, resolvido no primeiro envio. É a chave EXATA da guarda
  -- anti-laço: a conversa com o próprio gerente não pode virar informante (senão
  -- o resumo da conversa dele chegaria para ele mesmo). Comparar por id evita o
  -- problema das variantes do nono dígito na comparação por telefone.
  destination_contact_id uuid references public.contacts(id) on delete set null,
  interval_minutes int not null default 15 check (interval_minutes between 1 and 1440),
  batch_size int not null default 20 check (batch_size between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Instalações que já têm a tabela (a coluna nasceu depois) precisam do ALTER:
-- `create table if not exists` não acrescenta coluna em tabela existente.
alter table public.conversation_summary_settings
  add column if not exists destination_contact_id uuid references public.contacts(id) on delete set null;

create table if not exists public.conversation_summary_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused')),
  -- O resumo ATUAL — é ele que a próxima rodada recebe para ATUALIZAR em vez de
  -- resumir do zero. Um resumo por conversa, sempre o mais recente.
  current_summary text,
  -- Atividade mais recente vista pelo gatilho (debounce).
  last_message_at timestamptz,
  -- Mensagens com `sent_at` <= este valor já entram no resumo. É o corte da
  -- leitura incremental: a rodada seguinte só lê o que veio DEPOIS disto.
  last_summarized_message_at timestamptz,
  last_summarized_at timestamptz,
  -- Alvo do debounce. NULL = quieta, nada a fazer.
  next_eval_at timestamptz,
  attempts int not null default 0,
  last_error text,
  -- Lease do claim atômico (mesmo desenho do follow-up). Enquanto ocupada,
  -- outro worker não pega a mesma linha.
  claimed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_summary_state_conv_unique unique (organization_id, conversation_id)
);

create index if not exists conversation_summary_state_org_idx
  on public.conversation_summary_state (organization_id);

-- O caminho do cron: só as linhas vencidas e ativas, por §next_eval_at.
create index if not exists conversation_summary_state_due_idx
  on public.conversation_summary_state (next_eval_at)
  where status = 'active' and next_eval_at is not null;

alter table public.conversation_summary_settings enable row level security;
alter table public.conversation_summary_state enable row level security;

drop policy if exists tenant_isolation_conversation_summary_settings_all on public.conversation_summary_settings;
create policy tenant_isolation_conversation_summary_settings_all on public.conversation_summary_settings
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_conversation_summary_state_all on public.conversation_summary_state;
create policy tenant_isolation_conversation_summary_state_all on public.conversation_summary_state
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop trigger if exists conversation_summary_settings_updated_at on public.conversation_summary_settings;
create trigger conversation_summary_settings_updated_at
  before update on public.conversation_summary_settings
  for each row execute function public.fn_set_updated_at();

drop trigger if exists conversation_summary_state_updated_at on public.conversation_summary_state;
create trigger conversation_summary_state_updated_at
  before update on public.conversation_summary_state
  for each row execute function public.fn_set_updated_at();

-- ─── O gatilho do debounce ──────────────────────────────────────────────────
--
-- Um lookup por PK (settings por org) e, quando ligado, um upsert barato. O
-- bloco `exception when others then null` é a regra que não se negocia: o
-- informante é acessório e não pode impedir que a mensagem do cliente entre.
create or replace function public.fn_conversation_summary_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_interval int;
  v_is_group boolean;
  v_dest_contact uuid;
begin
  begin
    select enabled, interval_minutes, destination_contact_id
      into v_enabled, v_interval, v_dest_contact
      from public.conversation_summary_settings
     where organization_id = NEW.organization_id;
    if not found or v_enabled is not true then
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
$$;

drop trigger if exists trg_conversation_summary_touch on public.messages;
create trigger trg_conversation_summary_touch
  after insert on public.messages
  for each row execute function public.fn_conversation_summary_touch();

-- ─── Claim atômico do cron (SKIP LOCKED) — service role only ────────────────
create or replace function public.fn_claim_due_conversation_summaries(p_limit int, p_lease_seconds int)
returns setof public.conversation_summary_state
language sql
security definer
set search_path = public
as $$
  update public.conversation_summary_state s
     set claimed_until = now() + make_interval(secs => p_lease_seconds),
         attempts = s.attempts + 1,
         updated_at = now()
   where s.id in (
     select id from public.conversation_summary_state
      where status = 'active'
        and next_eval_at is not null
        and next_eval_at <= now()
        and (claimed_until is null or claimed_until < now())
      order by next_eval_at
      limit p_limit
      for update skip locked
   )
  returning s.*;
$$;
revoke all on function public.fn_claim_due_conversation_summaries(int, int) from public, anon, authenticated;

comment on table public.conversation_summary_settings is
  'Migration 0255: configuração do informante "Resumo de Conversas" por organização '
  '(ligado, número que envia, destino, cadência de silêncio e tamanho do lote).';
comment on table public.conversation_summary_state is
  'Migration 0255: estado por conversa do informante — resumo atual, corte da leitura '
  'incremental (last_summarized_message_at) e alvo do debounce (next_eval_at). O cron lê só '
  'as linhas vencidas; a varredura de conversations inteira não existe.';
