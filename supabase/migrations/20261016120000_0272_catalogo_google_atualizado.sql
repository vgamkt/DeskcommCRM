-- ============================================================================
-- 0272 — catálogo: Google com modelos VIVOS (e os mortos marcados).
--
-- O Google descontinuou `gemini-2.0-flash` e a família `gemini-2.5-*` para novos
-- usuários (HTTP 404: "This model … is no longer available to new users"). A tela
-- os oferecia normalmente; quem escolhia um deles para VER a imagem via a visão
-- "não funcionar" mesmo com a chave boa — medido ao vivo em 2026-10-16 (o erro do
-- `media-derive` era 404 do Google, não falta de crédito).
--
--   • os modelos MORTOS ganham `deprecated_at` (a tela de provedores filtra
--     `deprecated_at is null`, então saem do seletor);
--   • os Gemini VIVOS passam a declarar `supports_vision` (eles VEEM imagem — o
--     catálogo dizia `false` e a tela não sinalizava quem serve para visão).
--
-- Aditiva e idempotente (`where …` recorta o que muda).
-- ============================================================================

update public.ai_models set deprecated_at = now()
 where provider = 'google'
   and model_id in ('gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro')
   and deprecated_at is null;

update public.ai_models set supports_vision = true
 where provider = 'google'
   and model_id in (
     'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.5-flash',
     'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'
   )
   and supports_vision = false;
