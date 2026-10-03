-- 0262 · Handoff (aviso ao humano) para um NÚMERO PRÓPRIO, configurável na tela.
--
-- ─── O que muda ─────────────────────────────────────────────────────────────
-- Até aqui o "handoff por lentidão" (modelo esgotou as tentativas) e o aviso de
-- erro reutilizavam `conversation_summary_settings.destination` — o número que
-- recebe RESUMOS de conversa. Eram coisas diferentes dividindo o mesmo campo: o
-- dono quer o resumo num número e o AVISO DE PROBLEMA em outro.
--
-- Nova coluna na VERSÃO do agente (mesmo lugar das outras configs de turno):
--   handoff_notification_number text  — telefone E.164 (só dígitos) que recebe o
--   aviso quando o agente não consegue responder. Vazio/NULL = não avisa.
--
-- Aditiva: a coluna nasce nula e o motor a lê como "sem aviso" (nada quebra).

alter table public.ai_agent_versions
  add column if not exists handoff_notification_number text;

comment on column public.ai_agent_versions.handoff_notification_number is
  'Telefone (somente dígitos, E.164) que recebe o aviso quando o agente não consegue responder (handoff/erro). Vazio/NULL = não avisa. Substitui o uso do destino de resumos.';

notify pgrst, 'reload schema';
