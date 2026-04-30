-- Rollback 800-90 · re-quebra as 91 RPCs legacy (use só se necessário).

BEGIN;
DROP FUNCTION IF EXISTS public._sdr_clinic_id();
COMMIT;
NOTIFY pgrst, 'reload schema';
