-- Rollback de mig 116 · drop trigger + function v2.
-- Volta a depender exclusivamente de repos.conversations.updateLastMessage no app.

BEGIN;

DROP TRIGGER IF EXISTS trg_sync_wa_conversation_preview_v2 ON public.wa_messages;
DROP FUNCTION IF EXISTS public._sync_wa_conversation_preview_v2();

NOTIFY pgrst, 'reload schema';

COMMIT;
