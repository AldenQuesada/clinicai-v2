-- Rollback de mig 114 · drop RPCs + coluna last_auto_greeting_at.
-- Webhook volta a usar guard antiga (countInboundSince===1) com os 4 bugs originais.

BEGIN;

DROP FUNCTION IF EXISTS public.wa_secretaria_auto_greeting_unclaim(UUID);
DROP FUNCTION IF EXISTS public.wa_secretaria_auto_greeting_claim(UUID);
DROP INDEX IF EXISTS public.idx_wa_conversations_last_auto_greeting;

ALTER TABLE public.wa_conversations
  DROP COLUMN IF EXISTS last_auto_greeting_at;

NOTIFY pgrst, 'reload schema';

COMMIT;
