-- Rollback mig 72 · drop RPC + matriz IMMUTABLE.
-- Se houver callers ativos no app, eles vao receber 404 da PostgREST.

BEGIN;

DROP FUNCTION IF EXISTS public.appointment_change_status(uuid, text, text);
DROP FUNCTION IF EXISTS public._appointment_status_transition_allowed(text, text);

NOTIFY pgrst, 'reload schema';

COMMIT;
