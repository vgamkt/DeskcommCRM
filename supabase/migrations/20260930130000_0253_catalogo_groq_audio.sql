-- 0253 — catálogo: modelos de ÁUDIO (Whisper) do provedor Groq
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
-- `groq` é um provedor suportado (`lib/ai/pontos/provedores.ts`) e é o padrão de
-- fato da transcrição de áudio (primeiro da cadeia, plano gratuito). Mas o
-- catálogo `ai_models` não tinha NENHUM modelo da Groq — então o card "Para
-- transcrever o áudio do cliente", na tela do agente, abria com a lista de
-- modelos VAZIA e não dava para salvar. Provedor sem catálogo é opção que a tela
-- oferece e não entrega.
--
-- Preço: transcrição é cobrada por SEGUNDO de áudio, não por token — por isso as
-- colunas de preço por milhão ficam 0 (mesma decisão do `gemini-embedding-001`).
--
-- Idempotente: `on conflict do update`.

insert into public.ai_models
  (provider, model_id, display_name, description,
   input_price_per_million_cents, output_price_per_million_cents, supports_tools)
values
  ('groq', 'whisper-large-v3-turbo', 'Whisper Large v3 Turbo (Groq)',
   'Transcrição de áudio rápida e barata (plano gratuito). Recomendado para os áudios do WhatsApp.', 0, 0, false),
  ('groq', 'whisper-large-v3', 'Whisper Large v3 (Groq)',
   'Transcrição de áudio com mais qualidade; um pouco mais lenta.', 0, 0, false)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  supports_tools = excluded.supports_tools;
