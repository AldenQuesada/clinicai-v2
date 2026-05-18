-- Rollback · CRM_PARITY_R1 · Migration 189

BEGIN;

DROP INDEX IF EXISTS public.idx_prof_profiles_sala_id;

ALTER TABLE public.professional_profiles
  DROP COLUMN IF EXISTS sala_id;

COMMIT;
