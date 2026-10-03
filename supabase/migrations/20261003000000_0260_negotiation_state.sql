-- 0260 · `negotiation_state`: estado ESTRUTURADO da negociação de objeção por contato.
--
-- ─── O que entra ────────────────────────────────────────────────────────────
-- A negociação ("achei caro", "muito rodada"…) precisa sobreviver à conversa e ao
-- tempo: se o cliente voltar a falar DIAS depois, o sistema reconhece em que
-- tentativa está e se já foi encaminhado. Hoje esse estado vivia solto em
-- `conversations.metadata.agent_catalogo` (jsonb) — sem consulta estruturada nem
-- reconhecimento entre conversas. Esta tabela é a FONTE.
--
-- Chave do estado: `topic` = assunto negociado (`objecao:<motivo>:<moto>`). A
-- contagem é POR assunto; mudou o assunto → nova linha (reinicia).
--
-- Tabela tenant-aware: RLS por organização (mesmo padrão de
-- `conversation_summary_settings`), trigger de `updated_at` reusando
-- `fn_set_updated_at()`.

create table if not exists public.negotiation_state (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  conversation_id uuid null,
  topic text not null,
  motivo text not null,
  attempts integer not null default 0,
  valor_proposta_cents bigint null,
  status text not null default 'negociando',
  awaiting_confirmation boolean not null default false,
  encaminhado_at timestamptz null,
  ultima_msg_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint negotiation_state_status_check
    check (status in ('negociando','aguardando_confirmacao','encaminhado','encerrado')),
  constraint negotiation_state_motivo_check
    check (motivo in ('preco','km','ano','outro')),
  constraint negotiation_state_unico unique (organization_id, contact_id, topic)
);

create index if not exists negotiation_state_lookup_idx
  on public.negotiation_state (organization_id, contact_id, status);

alter table public.negotiation_state enable row level security;

drop policy if exists tenant_isolation_negotiation_state_all on public.negotiation_state;
create policy tenant_isolation_negotiation_state_all on public.negotiation_state
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop trigger if exists negotiation_state_updated_at on public.negotiation_state;
create trigger negotiation_state_updated_at
  before update on public.negotiation_state
  for each row execute function public.fn_set_updated_at();

notify pgrst, 'reload schema';
