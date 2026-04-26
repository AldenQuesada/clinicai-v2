-- Down 800-15 · clinicai-v2 · mira_cron_registry

DROP FUNCTION IF EXISTS public.mira_cron_runs_recent(text, int);
DROP FUNCTION IF EXISTS public.mira_cron_run_finish(uuid, text, int, text, jsonb);
DROP FUNCTION IF EXISTS public.mira_cron_run_start(text, uuid);
DROP FUNCTION IF EXISTS public.mira_cron_set_enabled(text, boolean, text);
DROP FUNCTION IF EXISTS public.mira_cron_jobs_list();

DROP TRIGGER  IF EXISTS trg_mira_cron_jobs_updated_at ON public.mira_cron_jobs;
DROP FUNCTION IF EXISTS public._mira_cron_jobs_set_updated_at();

DROP TABLE IF EXISTS public.mira_cron_runs;
DROP TABLE IF EXISTS public.mira_cron_jobs;
