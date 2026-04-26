-- Rollback mig 800-25 · b2b_tier_configs
BEGIN;

DROP FUNCTION IF EXISTS public.b2b_tier_config_upsert(jsonb);
DROP FUNCTION IF EXISTS public.b2b_tier_config_list();

DROP POLICY IF EXISTS "b2b_tier_configs_tenant" ON public.b2b_tier_configs;
DROP TABLE IF EXISTS public.b2b_tier_configs;

COMMIT;
