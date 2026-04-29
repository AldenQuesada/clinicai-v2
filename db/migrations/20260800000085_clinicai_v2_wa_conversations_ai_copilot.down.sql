-- Rollback Sprint B · /conversas Copiloto AI

DROP INDEX IF EXISTS public.wa_conversations_ai_copilot_at_idx;

ALTER TABLE public.wa_conversations
  DROP COLUMN IF EXISTS ai_copilot,
  DROP COLUMN IF EXISTS ai_copilot_at;

NOTIFY pgrst, 'reload schema';
