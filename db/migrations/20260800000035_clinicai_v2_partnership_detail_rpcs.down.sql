-- Down migration · 800-35

BEGIN;

DROP FUNCTION IF EXISTS public.b2b_attribution_leads(uuid, int);
DROP FUNCTION IF EXISTS public.b2b_attribution_roi(uuid);
DROP FUNCTION IF EXISTS public.b2b_partnership_content_list(uuid);
DROP FUNCTION IF EXISTS public.b2b_partnership_events_list(uuid);
DROP FUNCTION IF EXISTS public.b2b_partnership_targets_list(uuid);
DROP FUNCTION IF EXISTS public.b2b_consent_get(uuid);
DROP FUNCTION IF EXISTS public.b2b_consent_set(uuid, text, boolean, text, text);
DROP FUNCTION IF EXISTS public.b2b_partnership_export_data(uuid);
DROP FUNCTION IF EXISTS public.b2b_partnership_anonymize(uuid, text);
DROP FUNCTION IF EXISTS public.b2b_partnership_audit_timeline(uuid, int);
DROP FUNCTION IF EXISTS public.b2b_health_trend(uuid, int);
DROP FUNCTION IF EXISTS public.b2b_partnership_cost(uuid);
DROP FUNCTION IF EXISTS public.b2b_partnership_impact_score(uuid);
DROP FUNCTION IF EXISTS public.b2b_partnership_health_snapshot(uuid);

DROP TRIGGER IF EXISTS trg_b2b_health_history ON public.b2b_partnerships;
DROP FUNCTION IF EXISTS public._b2b_health_history_log();

DROP TABLE IF EXISTS public.b2b_partnership_alerts;
DROP TABLE IF EXISTS public.b2b_nps_responses;
DROP TABLE IF EXISTS public.b2b_group_exposures;
DROP TABLE IF EXISTS public.b2b_consent_log;
DROP TABLE IF EXISTS public.b2b_audit_log;
DROP TABLE IF EXISTS public.b2b_health_history;

COMMIT;
