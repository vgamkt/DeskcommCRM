-- 0270 · CADEIA DE TRANSCRIÇÃO do áudio do cliente (tabela própria, ordenada)
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
-- A transcrição de áudio era um ponto FIXO do produto: o card "Para transcrever
-- o áudio do cliente" não deixava editar, e o PUT do painel recusava o ponto
-- com `ponto_fixo`. O operador não escolhia quem ouve o áudio do cliente nem a
-- ordem de fallback. Pior: não havia como usar Deepgram.
--
-- Uma escolha ORDENADA (principal, reserva, …) não cabe em um binding por
-- purpose — por isso uma tabela própria, com `position`. Mesmo padrão do
-- `ai_budgets`: coisa que manda em gasto/comportamento tem tabela, RLS e audit.
--
-- Tabela tenant-aware: RLS por organização (mesmo padrão de `negotiation_state`),
-- trigger de `updated_at` reusando `fn_set_updated_at()`.

create table if not exists public.ai_transcription_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position integer not null,
  provider text not null,
  model_id text not null,
  credential_id uuid null references public.ai_provider_credentials(id) on delete set null,
  base_url text null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_transcription_targets_position_check check (position >= 0),
  constraint ai_transcription_targets_unico unique (organization_id, position)
);

create index if not exists ai_transcription_targets_org_idx
  on public.ai_transcription_targets (organization_id, position);

alter table public.ai_transcription_targets enable row level security;

drop policy if exists tenant_isolation_ai_transcription_targets_all on public.ai_transcription_targets;
create policy tenant_isolation_ai_transcription_targets_all on public.ai_transcription_targets
  using (organization_id in (select public.fn_user_org_ids()))
  with check (organization_id in (select public.fn_user_org_ids()));

drop trigger if exists ai_transcription_targets_updated_at on public.ai_transcription_targets;
create trigger ai_transcription_targets_updated_at
  before update on public.ai_transcription_targets
  for each row execute function public.fn_set_updated_at();

-- ─── A gravação ATÔMICA da cadeia ───────────────────────────────────────────
-- Substituir a lista inteira (delete + insert) precisa ser uma transação: sem
-- isto, uma falha no insert deixaria a organização SEM transcrição nenhuma —
-- pior que a configuração anterior. `security invoker` de propósito: roda com as
-- permissões/RLS do chamador (o admin autenticado), e a checagem de membership
-- é explícita para devolver erro em vez de apagar em silêncio.
create or replace function public.fn_guardar_cadeia_de_transcricao(
  p_organization_id uuid,
  p_alvos jsonb
)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if p_organization_id is null
     or p_organization_id not in (select public.fn_user_org_ids()) then
    raise exception 'organization_not_allowed';
  end if;

  delete from public.ai_transcription_targets
   where organization_id = p_organization_id;

  insert into public.ai_transcription_targets
    (organization_id, position, provider, model_id, credential_id, base_url, is_enabled)
  select
    p_organization_id,
    coalesce((item->>'position')::int, (ordinality - 1)::int),
    item->>'provider',
    item->>'model_id',
    nullif(item->>'credential_id', '')::uuid,
    nullif(item->>'base_url', ''),
    coalesce((item->>'is_enabled')::boolean, true)
  from jsonb_array_elements(coalesce(p_alvos, '[]'::jsonb)) with ordinality as t(item, ordinality);
end;
$function$;

-- Duas origens de EXECUTE (a lição da 0108): revogar de `public` E de `anon`.
revoke execute on function public.fn_guardar_cadeia_de_transcricao(uuid, jsonb) from public, anon;
grant execute on function public.fn_guardar_cadeia_de_transcricao(uuid, jsonb)
  to authenticated, service_role;

-- ─── Catálogo: modelos de transcrição que faltavam ──────────────────────────
-- `ai_models` só tinha os Whisper da Groq (0253), então o seletor de modelo do
-- OpenAI abria VAZIO e o do Deepgram não existia. Preço por segundo/minuto de
-- áudio, não por token ⇒ colunas de preço 0 (mesma decisão dos Whisper da Groq).
insert into public.ai_models
  (provider, model_id, display_name, description,
   input_price_per_million_cents, output_price_per_million_cents, supports_tools)
values
  ('openai', 'whisper-1', 'Whisper (OpenAI)',
   'Transcrição de áudio da OpenAI. Endpoint histórico da transcrição.', 0, 0, false),
  ('deepgram', 'nova-3', 'Nova-3 (Deepgram)',
   'Transcrição de áudio rápida e muito precisa (Deepgram). Ótima para os áudios do WhatsApp.', 0, 0, false),
  ('deepgram', 'nova-2', 'Nova-2 (Deepgram)',
   'Transcrição de áudio Deepgram da geração anterior; boa e econômica.', 0, 0, false)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  supports_tools = excluded.supports_tools;

notify pgrst, 'reload schema';
