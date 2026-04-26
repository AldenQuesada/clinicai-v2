-- Rollback mig 800-34 · drop tabelas + RPCs
BEGIN;

DROP FUNCTION IF EXISTS public.b2b_activity_delete(uuid);
DROP FUNCTION IF EXISTS public.b2b_activity_upsert(jsonb);
DROP FUNCTION IF EXISTS public.b2b_activities_list(uuid);
DROP FUNCTION IF EXISTS public.b2b_contract_delete(uuid);
DROP FUNCTION IF EXISTS public.b2b_contract_upsert(jsonb);
DROP FUNCTION IF EXISTS public.b2b_contract_get(uuid);

DROP TABLE IF EXISTS public.b2b_partnership_activities;
DROP TABLE IF EXISTS public.b2b_partnership_contracts;

COMMIT;
