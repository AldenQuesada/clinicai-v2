-- Rollback de 20260800000060_clinicai_v2_crm_leads.sql
-- ATENCAO: dropa a tabela inteira. Use APENAS em ambientes nao-prod.

BEGIN;

DROP TRIGGER IF EXISTS leads_normalize_phone ON public.leads;
DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;

DROP POLICY IF EXISTS leads_select ON public.leads;
DROP POLICY IF EXISTS leads_insert ON public.leads;
DROP POLICY IF EXISTS leads_update ON public.leads;
DROP POLICY IF EXISTS leads_delete ON public.leads;

DROP TABLE IF EXISTS public.leads CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
