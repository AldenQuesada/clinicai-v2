-- Rollback Mig 173 · drop recovery action RPCs
BEGIN;

DROP FUNCTION IF EXISTS public.recovery_perdido_mark_discarded(uuid, text);
DROP FUNCTION IF EXISTS public.recovery_perdido_add_note(uuid, text);

NOTIFY pgrst, 'reload schema';

COMMIT;
