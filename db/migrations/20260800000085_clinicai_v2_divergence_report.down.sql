-- Reverte mig 800-85
BEGIN;
DROP FUNCTION IF EXISTS public.divergence_report();
COMMIT;
