-- 0256 — catálogo: modelos de CHAT do provedor Groq.
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
-- A 0253 trouxe os dois modelos de ÁUDIO da Groq (Whisper) ao catálogo, mas não
-- os de conversa. O seletor de modelo da tela (que lê `ai_models`, não a lista
-- da credencial) então mostrava, para Groq, SÓ Whisper — inútil para qualquer
-- ponto de texto, como o "Resumir a conversa para o gerente". O provedor existe,
-- a credencial valida, e a tela não oferece um modelo que sirva.
--
-- Estes são os chat models que a conta Groq expõe (GET /models na validação).
-- `supports_tools`: gpt-oss e qwen declaram tool calling; allam não.
-- `supports_vision` fica false (nenhum destes é de visão).
--
-- Preço 0: a Groq é operada no plano gratuito/baixo custo, mesma decisão já
-- tomada para o Whisper na 0253 — sem preço inventado, o custo não é somado.
--
-- Idempotente: `on conflict do update`.

insert into public.ai_models
  (provider, model_id, display_name, description,
   input_price_per_million_cents, output_price_per_million_cents, supports_tools)
values
  ('groq', 'openai/gpt-oss-20b', 'GPT-OSS 20B (Groq)',
   'Modelo de conversa rápido e barato da Groq. Bom para resumos e classificações.', 0, 0, true),
  ('groq', 'openai/gpt-oss-120b', 'GPT-OSS 120B (Groq)',
   'Modelo de conversa maior da Groq. Melhor qualidade, um pouco mais lento.', 0, 0, true),
  ('groq', 'qwen/qwen3.8-27b', 'Qwen 3.8 27B (Groq)',
   'Modelo de conversa Qwen servido pela Groq.', 0, 0, true),
  ('groq', 'allam-2-7b', 'Allam 2 7B (Groq)',
   'Modelo de conversa pequeno e barato da Groq.', 0, 0, false)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  supports_tools = excluded.supports_tools;
