-- Rollback Mig 91 · inbox_role + handoff secretaria
-- Order: triggers/functions/RPC primeiro · colunas depois.

BEGIN;

DROP TRIGGER IF EXISTS trg_wa_conversations_inbox_role_sync
  ON public.wa_conversations;

DROP FUNCTION IF EXISTS public.fn_wa_conversations_inbox_role_sync();

DROP FUNCTION IF EXISTS public.wa_conversation_handoff_secretaria(uuid, text);

DROP INDEX IF EXISTS public.idx_wa_conversations_handoff_secretaria;
DROP INDEX IF EXISTS public.idx_wa_conversations_inbox_role_active;
DROP INDEX IF EXISTS public.idx_wa_numbers_inbox_role_active;

ALTER TABLE public.wa_conversations
  DROP CONSTRAINT IF EXISTS wa_conversations_inbox_role_check;

ALTER TABLE public.wa_numbers
  DROP CONSTRAINT IF EXISTS wa_numbers_inbox_role_check;

ALTER TABLE public.wa_conversations
  DROP COLUMN IF EXISTS handoff_to_secretaria_by,
  DROP COLUMN IF EXISTS handoff_to_secretaria_at,
  DROP COLUMN IF EXISTS inbox_role;

ALTER TABLE public.wa_numbers
  DROP COLUMN IF EXISTS inbox_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
