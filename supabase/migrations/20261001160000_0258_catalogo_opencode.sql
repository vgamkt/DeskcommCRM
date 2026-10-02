-- ============================================================================
-- 0258 — catálogo: modelos da OpenCode (Zen) — família Chat Completions.
--
-- A OpenCode é um gateway: serve GPT (Responses), Claude (Messages), Gemini
-- (Google) e um conjunto de modelos ABERTOS via `/chat/completions`. Aqui entram
-- só os da família Chat Completions — os abertos e os gratuitos —, que são o que
-- o CRM consome e cujos ids NÃO colidem com o catálogo dos provedores próprios
-- (a chave de `ai_pricing` é só `model`, e ids como `claude-sonnet-5` se
-- repetiriam com preço diferente).
--
-- O registry (`lib/agent-engine/edge/llm/providers.ts`, provider `opencode`)
-- fala OpenAI-compatível no `https://opencode.ai/zen/v1` com Bearer.
--
-- Preços da tabela da doc (`/console/models#pricing`), convertidos de USD/1M
-- tokens para CENTAVOS/1M tokens (×100). Gratuitos = 0.
--
-- `supports_tools`: verdadeiro nos pagos (modelos de agente); falso nos
-- gratuitos "stealth" (não afirmamos tool calling não verificado).
-- Sem `is_default_for_provider` de propósito (o gate exige 1 default só para
-- anthropic/google/openai). Idempotente: `on conflict do update`.
-- ============================================================================

insert into public.ai_models
  (provider, model_id, display_name, description,
   input_price_per_million_cents, output_price_per_million_cents, supports_tools)
values
  ('opencode', 'kimi-k2.5', 'Kimi K2.5 (OpenCode)',
   'Modelo aberto Kimi pela OpenCode.', 60, 300, true),
  ('opencode', 'kimi-k2.6', 'Kimi K2.6 (OpenCode)',
   'Modelo aberto Kimi pela OpenCode.', 95, 400, true),
  ('opencode', 'kimi-k2.7-code', 'Kimi K2.7 Code (OpenCode)',
   'Kimi focado em código pela OpenCode.', 95, 400, true),
  ('opencode', 'glm-5.1', 'GLM 5.1 (OpenCode)',
   'Modelo aberto GLM pela OpenCode.', 140, 440, true),
  ('opencode', 'glm-5.3-flash', 'GLM 5.3 Flash (OpenCode)',
   'GLM rápido e barato pela OpenCode.', 15, 50, true),
  ('opencode', 'minimax-m2.7', 'MiniMax M2.7 (OpenCode)',
   'Modelo aberto MiniMax pela OpenCode.', 30, 120, true),
  ('opencode', 'minimax-m3', 'MiniMax M3 (OpenCode)',
   'Modelo aberto MiniMax pela OpenCode.', 30, 120, true),
  ('opencode', 'deepseek-v4-flash', 'DeepSeek V4 Flash (OpenCode)',
   'DeepSeek rápido e barato pela OpenCode.', 14, 28, true),
  ('opencode', 'deepseek-v4.1-flash', 'DeepSeek V4.1 Flash (OpenCode)',
   'DeepSeek mais novo e rápido pela OpenCode.', 30, 120, true),
  ('opencode', 'deepseek-v4-pro', 'DeepSeek V4 Pro (OpenCode)',
   'DeepSeek maior pela OpenCode.', 174, 348, true),
  ('opencode', 'qwen3.8-max', 'Qwen 3.8 Max (OpenCode)',
   'Qwen pela família Chat Completions da OpenCode.', 200, 600, true),
  ('opencode', 'big-pickle', 'Big Pickle (OpenCode, grátis)',
   'Modelo "stealth" gratuito por tempo limitado na OpenCode.', 0, 0, false),
  ('opencode', 'space-bunny-free', 'Space Bunny (OpenCode, grátis)',
   'Modelo gratuito por tempo limitado na OpenCode.', 0, 0, false),
  ('opencode', 'mimo-v2.6-flash-free', 'MiMo V2.6 Flash (OpenCode, grátis)',
   'Modelo gratuito por tempo limitado na OpenCode.', 0, 0, false),
  ('opencode', 'longcat-2.5-preview-free', 'LongCat 2.5 Preview (OpenCode, grátis)',
   'Modelo gratuito por tempo limitado na OpenCode.', 0, 0, false)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  input_price_per_million_cents = excluded.input_price_per_million_cents,
  output_price_per_million_cents = excluded.output_price_per_million_cents,
  supports_tools = excluded.supports_tools;

-- O orçamento lê `ai_pricing`; sem estas linhas o gasto da OpenCode seria somado
-- como zero. Mesmos valores do catálogo, `notes` marcando a origem.
insert into public.ai_pricing
  (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
values
  ('kimi-k2.5', 60, 300, 'catálogo 0258'),
  ('kimi-k2.6', 95, 400, 'catálogo 0258'),
  ('kimi-k2.7-code', 95, 400, 'catálogo 0258'),
  ('glm-5.1', 140, 440, 'catálogo 0258'),
  ('glm-5.3-flash', 15, 50, 'catálogo 0258'),
  ('minimax-m2.7', 30, 120, 'catálogo 0258'),
  ('minimax-m3', 30, 120, 'catálogo 0258'),
  ('deepseek-v4-flash', 14, 28, 'catálogo 0258'),
  ('deepseek-v4.1-flash', 30, 120, 'catálogo 0258'),
  ('deepseek-v4-pro', 174, 348, 'catálogo 0258'),
  ('qwen3.8-max', 200, 600, 'catálogo 0258'),
  ('big-pickle', 0, 0, 'catálogo 0258'),
  ('space-bunny-free', 0, 0, 'catálogo 0258'),
  ('mimo-v2.6-flash-free', 0, 0, 'catálogo 0258'),
  ('longcat-2.5-preview-free', 0, 0, 'catálogo 0258')
on conflict (model) do update set
  prompt_cents_per_million_tokens = excluded.prompt_cents_per_million_tokens,
  completion_cents_per_million_tokens = excluded.completion_cents_per_million_tokens,
  notes = excluded.notes;
