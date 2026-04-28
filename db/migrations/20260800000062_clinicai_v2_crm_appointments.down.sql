-- Rollback de 20260800000062_clinicai_v2_crm_appointments.sql

BEGIN;

DROP TRIGGER IF EXISTS appointments_normalize_phone ON public.appointments;
DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;

DROP POLICY IF EXISTS appointments_select ON public.appointments;
DROP POLICY IF EXISTS appointments_insert ON public.appointments;
DROP POLICY IF EXISTS appointments_update ON public.appointments;
DROP POLICY IF EXISTS appointments_delete ON public.appointments;

DROP TABLE IF EXISTS public.appointments CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
