-- Rollback de 20260800000063_clinicai_v2_crm_orcamentos.sql

BEGIN;

DROP TRIGGER IF EXISTS orcamentos_updated_at ON public.orcamentos;

DROP POLICY IF EXISTS orcamentos_select ON public.orcamentos;
DROP POLICY IF EXISTS orcamentos_insert ON public.orcamentos;
DROP POLICY IF EXISTS orcamentos_update ON public.orcamentos;
DROP POLICY IF EXISTS orcamentos_delete ON public.orcamentos;

DROP TABLE IF EXISTS public.orcamentos CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
