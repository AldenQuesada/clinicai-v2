-- Rollback: 20260800000003_clinicai_v2_b2b_auto_whitelist

DROP TRIGGER IF EXISTS trg_b2b_on_partnership_active ON public.b2b_partnerships;
DROP FUNCTION IF EXISTS public._b2b_on_partnership_active_whitelist();

NOTIFY pgrst, 'reload schema';
