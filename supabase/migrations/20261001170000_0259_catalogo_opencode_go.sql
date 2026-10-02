-- ============================================================================
-- 0259 — catálogo: modelos do OpenCode Go (assinatura).
--
-- Mesma API do Zen (`/zen/go/v1`, OpenAI-compatível, Bearer), família Chat
-- Completions — os modelos abertos. Provider PRÓPRIO (`opencode_go`) para o
-- operador escolher a assinatura em vez dos créditos do Console.
--
-- ⚠️ Preços: `ai_pricing` é chaveado só por `model`. Onde o id coincide com o do
-- Zen (0258), usamos o MESMO valor — senão o gate
-- `tests/invariants/catalogo-de-modelos.test.ts` ("preço da tela = conta")
-- reprova. Os dois DeepSeek têm preço dinâmico no Go (peak/off-peak); fica o
-- valor único já usado no Zen. Onde o id é novo, entra o valor do Go.
--
-- `supports_tools`: verdadeiro nos pagos, falso nos gratuitos. Sem
-- `is_default_for_provider` (o gate exige 1 default só para anthropic/google/openai).
-- Idempotente: `on conflict do update`.
-- ============================================================================

insert into public.ai_models
  (provider, model_id, display_name, description,
   input_price_per_million_cents, output_price_per_million_cents, supports_tools)
values
  ('opencode_go', 'glm-5.3-flash', 'GLM 5.3 Flash (OpenCode Go)',
   'GLM rápido e barato pela assinatura OpenCode Go.', 15, 50, true),
  ('opencode_go', 'glm-5.3', 'GLM 5.3 (OpenCode Go)',
   'GLM pela assinatura OpenCode Go.', 140, 440, true),
  ('opencode_go', 'glm-5.2', 'GLM 5.2 (OpenCode Go)',
   'GLM pela assinatura OpenCode Go.', 140, 440, true),
  ('opencode_go', 'kimi-k3', 'Kimi K3 (OpenCode Go)',
   'Kimi K3 pela assinatura OpenCode Go.', 300, 1500, true),
  ('opencode_go', 'kimi-k2.7-code', 'Kimi K2.7 Code (OpenCode Go)',
   'Kimi focado em código pela assinatura OpenCode Go.', 95, 400, true),
  ('opencode_go', 'kimi-k2.6', 'Kimi K2.6 (OpenCode Go)',
   'Kimi pela assinatura OpenCode Go.', 95, 400, true),
  ('opencode_go', 'longcat-2.0', 'LongCat 2.0 (OpenCode Go)',
   'Modelo LongCat pela assinatura OpenCode Go.', 30, 120, true),
  ('opencode_go', 'deepseek-v4.1-flash', 'DeepSeek V4.1 Flash (OpenCode Go)',
   'DeepSeek pela assinatura OpenCode Go.', 30, 120, true),
  ('opencode_go', 'deepseek-v4-pro', 'DeepSeek V4 Pro (OpenCode Go)',
   'DeepSeek maior pela assinatura OpenCode Go.', 174, 348, true),
  ('opencode_go', 'deepseek-v4-flash', 'DeepSeek V4 Flash (OpenCode Go)',
   'DeepSeek rápido pela assinatura OpenCode Go.', 14, 28, true),
  ('opencode_go', 'deepseek-v4-flash-vision-exp', 'DeepSeek V4 Flash Vision (OpenCode Go)',
   'DeepSeek com visão (experimental) pela assinatura OpenCode Go.', 30, 120, true),
  ('opencode_go', 'mimo-v2.6-flash', 'MiMo V2.6 Flash (OpenCode Go)',
   'Modelo MiMo pela assinatura OpenCode Go.', 14, 28, true),
  ('opencode_go', 'mimo-v2.6-pro', 'MiMo V2.6 Pro (OpenCode Go)',
   'Modelo MiMo maior pela assinatura OpenCode Go.', 44, 87, true),
  ('opencode_go', 'mimo-v2.5', 'MiMo V2.5 (OpenCode Go)',
   'Modelo MiMo pela assinatura OpenCode Go.', 14, 28, true),
  ('opencode_go', 'mimo-v2.5-pro', 'MiMo V2.5 Pro (OpenCode Go)',
   'Modelo MiMo maior pela assinatura OpenCode Go.', 44, 87, true),
  ('opencode_go', 'hy4-preview', 'Hy4 Preview (OpenCode Go)',
   'Modelo Hy pela assinatura OpenCode Go.', 83, 250, true),
  ('opencode_go', 'hy3', 'Hy3 (OpenCode Go)',
   'Modelo Hy pela assinatura OpenCode Go.', 14, 58, true),
  ('opencode_go', 'space-bunny-free', 'Space Bunny (OpenCode Go, grátis)',
   'Modelo gratuito por tempo limitado na OpenCode Go.', 0, 0, false),
  ('opencode_go', 'longcat-2.5-preview-free', 'LongCat 2.5 Preview (OpenCode Go, grátis)',
   'Modelo gratuito por tempo limitado na OpenCode Go.', 0, 0, false)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  input_price_per_million_cents = excluded.input_price_per_million_cents,
  output_price_per_million_cents = excluded.output_price_per_million_cents,
  supports_tools = excluded.supports_tools;

insert into public.ai_pricing
  (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
values
  ('glm-5.3-flash', 15, 50, 'catálogo 0259'),
  ('glm-5.3', 140, 440, 'catálogo 0259'),
  ('glm-5.2', 140, 440, 'catálogo 0259'),
  ('kimi-k3', 300, 1500, 'catálogo 0259'),
  ('kimi-k2.7-code', 95, 400, 'catálogo 0259'),
  ('kimi-k2.6', 95, 400, 'catálogo 0259'),
  ('longcat-2.0', 30, 120, 'catálogo 0259'),
  ('deepseek-v4.1-flash', 30, 120, 'catálogo 0259'),
  ('deepseek-v4-pro', 174, 348, 'catálogo 0259'),
  ('deepseek-v4-flash', 14, 28, 'catálogo 0259'),
  ('deepseek-v4-flash-vision-exp', 30, 120, 'catálogo 0259'),
  ('mimo-v2.6-flash', 14, 28, 'catálogo 0259'),
  ('mimo-v2.6-pro', 44, 87, 'catálogo 0259'),
  ('mimo-v2.5', 14, 28, 'catálogo 0259'),
  ('mimo-v2.5-pro', 44, 87, 'catálogo 0259'),
  ('hy4-preview', 83, 250, 'catálogo 0259'),
  ('hy3', 14, 58, 'catálogo 0259'),
  ('space-bunny-free', 0, 0, 'catálogo 0259'),
  ('longcat-2.5-preview-free', 0, 0, 'catálogo 0259')
on conflict (model) do update set
  prompt_cents_per_million_tokens = excluded.prompt_cents_per_million_tokens,
  completion_cents_per_million_tokens = excluded.completion_cents_per_million_tokens,
  notes = excluded.notes;
