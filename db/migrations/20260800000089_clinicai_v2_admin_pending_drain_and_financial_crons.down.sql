-- Rollback 800-89 · dropa RPCs admin-pending + financial text builders.
-- Nao toca em b2b_pending_dispatches (mig 800-88 cuida).

BEGIN;

DROP FUNCTION IF EXISTS public.mira_financial_ai_cost_text(uuid);
DROP FUNCTION IF EXISTS public.mira_financial_churn_alert_text(uuid, int);
DROP FUNCTION IF EXISTS public.mira_financial_monthly_goal_text(uuid);
DROP FUNCTION IF EXISTS public.mira_financial_daily_revenue_text(uuid);
DROP FUNCTION IF EXISTS public.b2b_admin_pending_complete(uuid, text, text);
DROP FUNCTION IF EXISTS public.b2b_admin_pending_pick(int);

COMMIT;
NOTIFY pgrst, 'reload schema';
