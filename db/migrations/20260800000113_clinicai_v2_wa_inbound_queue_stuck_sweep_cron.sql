-- ============================================================================
-- pg_cron · wa_inbound_queue_stuck_sweep · libera jobs órfãos a cada 5min
-- ============================================================================
--
-- Pré-requisito: mig 112 (RPC wa_inbound_queue_requeue_stuck existe).
--
-- Por que: worker que pega um job (status=processing) pode crashar antes de
-- chamar complete()/fail(). Sem esse sweep o job fica preso em processing
-- pra sempre · novos workers nunca pegam (pick filtra status='pending').
--
-- Schedule: */5 * * * *  (cada 5min · alinhado com TTL default de 5min do
-- requeue_stuck) · 12 invocações/h · custo desprezível.
--
-- Idempotente · unschedule primeiro se já existir (re-rodável sem errors).
--
-- Pattern alinhado com b2b_scout_worker (cron a cada 2min · ativo) e
-- b2b_panel_rate_limits_cleanup (cron a cada 10min · cleanup).

BEGIN;

-- 1. Pré-condição · RPC requeue_stuck deve existir (mig 112)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='wa_inbound_queue_requeue_stuck'
  ) THEN
    RAISE EXCEPTION 'mig 113 ABORT · wa_inbound_queue_requeue_stuck() não existe · aplicar mig 112 primeiro';
  END IF;
END $$;

-- 2. Unschedule se já existir (idempotente)
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname='wa_inbound_queue_stuck_sweep';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
    RAISE NOTICE 'mig 113 · unscheduled previous wa_inbound_queue_stuck_sweep (jobid=%)', v_job_id;
  END IF;
END $$;

-- 3. Schedule novo · 5min interval
SELECT cron.schedule(
  'wa_inbound_queue_stuck_sweep',
  '*/5 * * * *',
  $$SELECT public.wa_inbound_queue_requeue_stuck(5);$$
);

-- 4. Sanity check
DO $$
DECLARE
  v_count INT;
  v_active BOOLEAN;
BEGIN
  SELECT count(*), bool_and(active) INTO v_count, v_active
  FROM cron.job WHERE jobname='wa_inbound_queue_stuck_sweep';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'mig 113 · esperado 1 job, encontrou %', v_count;
  END IF;
  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'mig 113 · job criado mas não está active';
  END IF;
  RAISE NOTICE 'mig 113 · cron wa_inbound_queue_stuck_sweep agendado · */5 * * * * · active';
END $$;

COMMIT;
