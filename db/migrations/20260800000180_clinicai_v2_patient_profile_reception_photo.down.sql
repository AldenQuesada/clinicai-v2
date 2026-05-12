-- Rollback Mig 180 · CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE
BEGIN;

DROP TRIGGER IF EXISTS pp_extended_set_updated_at ON public.patient_profiles_extended;
DROP TABLE IF EXISTS public.patient_profiles_extended CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
