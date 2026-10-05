-- 0265 · Referências à credencial viram ações declarativas da FK.
--
-- ─── Por que ────────────────────────────────────────────────────────────────
-- Excluir uma credencial exigia "soltar" ANTES as referências, tabela por tabela,
-- dentro da rota (`ai_agent_versions` + `ai_purpose_bindings`) — e a versão
-- ainda esbarrava no trigger de imutabilidade. Cada referência nova quebraria de
-- novo. A regra certa é DECLARATIVA, na FK:
--
--   * `ai_agent_versions.credential_id`  -> ON DELETE SET NULL
--       a versão histórica perde a referência a uma chave que sumiu e cai no
--       padrão da organização; nenhum conteúdo muda (a trigger 0264 permite o
--       desvincular).
--   * `ai_purpose_bindings.credential_id` -> ON DELETE CASCADE
--       um binding de ponto é a ESCOLHA de modelo atrelada àquela chave; sem a
--       chave ele é config morta, então sai junto.
--
-- Assim a rota de DELETE só precisa da regra de PRODUTO (não apagar a chave do
-- agente PUBLICADO -> 409) e do `delete` — o resto o banco resolve.
--
-- Aditiva e idempotente.

alter table public.ai_agent_versions
  drop constraint if exists ai_agent_versions_credential_id_fkey;

alter table public.ai_agent_versions
  add constraint ai_agent_versions_credential_id_fkey
  foreign key (credential_id) references public.ai_provider_credentials(id) on delete set null;

alter table public.ai_purpose_bindings
  drop constraint if exists ai_purpose_bindings_credential_id_fkey;

alter table public.ai_purpose_bindings
  add constraint ai_purpose_bindings_credential_id_fkey
  foreign key (credential_id) references public.ai_provider_credentials(id) on delete cascade;

notify pgrst, 'reload schema';
