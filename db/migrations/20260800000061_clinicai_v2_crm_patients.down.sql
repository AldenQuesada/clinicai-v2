-- Rollback de 20260800000061_clinicai_v2_crm_patients.sql

BEGIN;

DROP TRIGGER IF EXISTS patients_normalize_phone ON public.patients;
DROP TRIGGER IF EXISTS patients_updated_at ON public.patients;

DROP POLICY IF EXISTS patients_select ON public.patients;
DROP POLICY IF EXISTS patients_insert ON public.patients;
DROP POLICY IF EXISTS patients_update ON public.patients;
DROP POLICY IF EXISTS patients_delete ON public.patients;

DROP TABLE IF EXISTS public.patients CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
