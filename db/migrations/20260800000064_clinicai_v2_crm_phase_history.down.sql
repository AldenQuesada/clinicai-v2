-- Rollback de 20260800000064_clinicai_v2_crm_phase_history.sql

BEGIN;

DROP POLICY IF EXISTS phase_history_select ON public.phase_history;
DROP POLICY IF EXISTS phase_history_insert ON public.phase_history;

DROP TABLE IF EXISTS public.phase_history CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
