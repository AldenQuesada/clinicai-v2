-- Rollback · CRM_PARITY_R1 · Migration 188

BEGIN;

DROP INDEX IF EXISTS public.idx_prof_profiles_ferias_gin;

ALTER TABLE public.professional_profiles
  DROP CONSTRAINT IF EXISTS chk_prof_profiles_ferias_array;

ALTER TABLE public.professional_profiles
  DROP COLUMN IF EXISTS ferias;

COMMIT;
