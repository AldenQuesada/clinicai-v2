-- Down 800-23 · clinicai-v2 · voucher bulk scheduled dispatch
--
-- Reverte:
--   1. Remove seed do worker no mira_cron_jobs registry
--   2. Restaura COMMENT original (mig 800-06) em scheduled_at
--
-- Nao mexe em schema (nao foi alterado).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'mira_cron_jobs'
  ) THEN
    DELETE FROM public.mira_cron_jobs
     WHERE job_name = 'b2b-voucher-dispatch-worker';
    RAISE NOTICE '[mig 800-23.down] cron b2b-voucher-dispatch-worker removido do registry';
  END IF;
END
$$;

-- Restaura comment original mig 800-06 (sem o adendo bulk UI)
COMMENT ON COLUMN public.b2b_voucher_dispatch_queue.scheduled_at IS NULL;

NOTIFY pgrst, 'reload schema';
