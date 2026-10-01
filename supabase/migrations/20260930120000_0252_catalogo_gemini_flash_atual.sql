-- 0252 — catálogo: Gemini 3.x direto no provedor Google
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
-- A tela de agente só oferecia, para o provedor `google` (chave direta), até
-- `gemini-3.5-flash`. Os Flash seguintes (3.5 Flash-Lite, 3.6/3.7/3.8 Flash) e o
-- 3.1 Flash-Lite só existiam no catálogo do `openrouter` — então quem aponta a
-- API do Google direto (para usar cache nativo e fugir da taxa do gateway) NÃO
-- consegue escolher um modelo mais novo/barato, e o `fn_publish` recusa porque o
-- modelo não está em `ai_models` para aquele provider.
--
-- ─── Preços (Google, por 1M tokens, em CENTAVOS) ────────────────────────────
--   gemini-3.6/3.7/3.8-flash : $0,75 entrada / $3,75 saída (promo até 31/12/2026)
--   gemini-3.5-flash-lite    : $0,30 / $2,50
--   gemini-3.1-flash-lite    : $0,25 / $1,50
-- São os MESMOS valores já registrados no catálogo do openrouter (linhas
-- `google/gemini-3.6-flash` etc.), conferidos contra a tabela pública do Google.
-- Preço errado no catálogo vira orçamento errado na tela do dono.
--
-- Idempotente: `on conflict do update`, seguro em re-aplicação.

insert into public.ai_models
  (provider, model_id, display_name, description,
   input_price_per_million_cents, output_price_per_million_cents, supports_tools)
values
  ('google', 'gemini-3.8-flash',      'Gemini 3.8 Flash',
   'Flash mais recente. Mesma classe dos anteriores; preço promocional até 31/12/2026.', 75, 375, true),
  ('google', 'gemini-3.7-flash',      'Gemini 3.7 Flash',
   'Flash de alto desempenho; preço promocional até 31/12/2026.', 75, 375, true),
  ('google', 'gemini-3.6-flash',      'Gemini 3.6 Flash',
   'Flash equilibrado; preço promocional até 31/12/2026.', 75, 375, true),
  ('google', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite',
   'Linha Lite: mais barato, para atendimento de alto volume.', 30, 250, true),
  ('google', 'gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite',
   'Lite da geração 3.1 — o mais barato para tarefas simples.', 25, 150, true)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  input_price_per_million_cents = excluded.input_price_per_million_cents,
  output_price_per_million_cents = excluded.output_price_per_million_cents,
  supports_tools = excluded.supports_tools;

-- Contabilidade de custo — a MESMA lista, senão o gasto não é calculado por esse
-- modelo (some do orçamento).
insert into public.ai_pricing
  (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
values
  ('gemini-3.8-flash',       75, 375, 'catálogo 0252 — promo até 31/12/2026; dobra em 2027'),
  ('gemini-3.7-flash',       75, 375, 'catálogo 0252 — promo até 31/12/2026; dobra em 2027'),
  ('gemini-3.6-flash',       75, 375, 'catálogo 0252 — promo até 31/12/2026; dobra em 2027'),
  ('gemini-3.5-flash-lite',  30, 250, 'catálogo 0252'),
  ('gemini-3.1-flash-lite',  25, 150, 'catálogo 0252')
on conflict (model) do update set
  prompt_cents_per_million_tokens = excluded.prompt_cents_per_million_tokens,
  completion_cents_per_million_tokens = excluded.completion_cents_per_million_tokens,
  notes = excluded.notes,
  superseded_at = null;
