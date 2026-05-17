-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DOWN · Migration 800-185 · clinicai-v2 · unschedule sdr-advance-day-... ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Remove o cron job sdr-advance-day-buckets criado pela migration 800-185. ║
-- ║                                                                          ║
-- ║ Idempotente · só faz unschedule se o job existir.                       ║
-- ║                                                                          ║
-- ║ ⚠️ Após o rollback:                                                      ║
-- ║   - Avanços diários do pipeline seven_days param.                        ║
-- ║   - lead_pipeline_positions existentes ficam congeladas no estágio      ║
-- ║     atual (não revertem · não há histórico de transição).               ║
-- ║   - leads.day_bucket fica com o último valor sincronizado.              ║
-- ║   - /crm/kanban/seven-days volta a depender 100% do fallback             ║
-- ║     calculado por created_at (BLOCO 3.5B).                              ║
-- ║                                                                          ║
-- ║ Não dropa GRANT EXECUTE · função pode continuar sendo chamada            ║
-- ║ manualmente por service_role/postgres (ex: durante UAT controlado).     ║
-- ║                                                                          ║
-- ║ Não dropa a função sdr_advance_day_buckets() · é da mig V1 20260514.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

DO $cron$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname = 'sdr-advance-day-buckets';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
    RAISE NOTICE '[mig 185 DOWN] cron sdr-advance-day-buckets (jobid=%) removido', v_jobid;
  ELSE
    RAISE NOTICE '[mig 185 DOWN] cron sdr-advance-day-buckets já ausente · nada a fazer';
  END IF;
END
$cron$;

-- Sanity: confirmar remoção
DO $sanity$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sdr-advance-day-buckets') THEN
    RAISE EXCEPTION '[mig 185 DOWN sanity] cron ainda existe após unschedule · investigar';
  END IF;
  RAISE NOTICE '[mig 185 DOWN] sanity OK · cron removido';
END
$sanity$;

COMMIT;
