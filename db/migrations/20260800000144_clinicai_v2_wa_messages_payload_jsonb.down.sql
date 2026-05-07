-- Mig 144 · DOWN · remove wa_messages.payload jsonb
-- Reverte mig 144 (payload jsonb pra mensagens ricas).
-- Drop do índice antes da coluna · ordem inversa do up.

BEGIN;

DROP INDEX IF EXISTS public.idx_wa_messages_payload_kind;

ALTER TABLE public.wa_messages
  DROP COLUMN IF EXISTS payload;

NOTIFY pgrst, 'reload schema';

COMMIT;
