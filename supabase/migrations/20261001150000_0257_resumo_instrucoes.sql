-- ============================================================================
-- 0257 — RESUMO DE CONVERSAS: instruções do dono para o resumo.
--
-- O texto que pede o resumo à IA era fixo no código (lib/conversas/resumo.ts).
-- Esta coluna deixa o dono da operação ajustar o que o resumo deve destacar —
-- por organização e pela tela, sem deploy. O valor é ANEXADO ao system do ponto
-- `resumo_de_conversas`; vazio/ausente = comportamento atual, sem mudança.
--
-- Alargamento puro: coluna nova, nullable, sem backfill.
-- ============================================================================

alter table public.conversation_summary_settings
  add column if not exists instructions text;

comment on column public.conversation_summary_settings.instructions is
  'Migration 0257: instruções livres do dono da operação anexadas ao system do resumo '
  '(ex.: "fale em 3 bullets", "destaque o valor que o cliente quer"). Vazio = prompt padrão.';
