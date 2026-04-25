-- Rollback migration 848 · drop em ordem reversa.

DROP VIEW IF EXISTS public.v_ai_budget_today;
DROP FUNCTION IF EXISTS public._ai_budget_record(uuid, uuid, text, text, bigint, bigint, numeric);
DROP FUNCTION IF EXISTS public._ai_budget_check(uuid, numeric);
DROP TABLE IF EXISTS public._ai_budget;

NOTIFY pgrst, 'reload schema';
