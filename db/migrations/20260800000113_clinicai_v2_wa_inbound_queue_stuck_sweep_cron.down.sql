-- Rollback de mig 113 · unschedule pg_cron job.

BEGIN;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname='wa_inbound_queue_stuck_sweep';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
    RAISE NOTICE 'rollback mig 113 · unscheduled wa_inbound_queue_stuck_sweep (jobid=%)', v_job_id;
  ELSE
    RAISE NOTICE 'rollback mig 113 · job não estava scheduled · noop';
  END IF;
END $$;

COMMIT;
