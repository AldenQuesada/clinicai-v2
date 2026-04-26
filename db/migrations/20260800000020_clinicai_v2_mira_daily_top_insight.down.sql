-- Down 800-20 · clinicai-v2 · mira-daily-top-insight cron seed
--
-- Remove o seed do cron job. Tabela mira_cron_jobs em si pertence a mig 800-15.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'mira_cron_jobs'
  ) THEN
    DELETE FROM public.mira_cron_jobs
     WHERE job_name = 'mira-daily-top-insight';
    RAISE NOTICE '[mig 800-20.down] cron mira-daily-top-insight removido';
  END IF;
END
$$;
