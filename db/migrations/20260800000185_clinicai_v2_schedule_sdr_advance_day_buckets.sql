-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-185 · clinicai-v2 · schedule sdr_advance_day_buckets       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Versiona o pg_cron job que avança diariamente o pipeline `seven_days`    ║
-- ║ chamando public.sdr_advance_day_buckets() (mig V1 20260514 + recreated    ║
-- ║ em V1 20260581).                                                          ║
-- ║                                                                          ║
-- ║ Esta migration é a ÚLTIMA peça pendente do Kanban 7 Dias V2 (BLOCO 3.5C  ║
-- ║ commit 0de2f06). Sem este cron, /crm/kanban/seven-days roda 100% no      ║
-- ║ fallback calculado por created_at · positions persistidas em             ║
-- ║ lead_pipeline_positions ficam dormentes.                                  ║
-- ║                                                                          ║
-- ║ Schedule: 0 3 * * * UTC = 00:00 BRT (UTC-3) · noite operacional.         ║
-- ║                                                                          ║
-- ║ ⚠️ TIMEZONE: pg_cron sempre opera em UTC. 03:00 UTC = 00:00 BRT no       ║
-- ║ horário operacional atual da clínica (America/Sao_Paulo, UTC-3, sem      ║
-- ║ horário de verão · vigente desde 2019). Se voltar horário de verão       ║
-- ║ no futuro, revisar pra 0 2 * * *.                                        ║
-- ║                                                                          ║
-- ║ Idempotente · usa cron.alter_job se job já existir, senão cron.schedule. ║
-- ║ Padrão extraído de mig 800-134 (wa_chat_mirror_sync_mih).                ║
-- ║                                                                          ║
-- ║ Rollback: SELECT cron.unschedule('sdr-advance-day-buckets');             ║
-- ║                                                                          ║
-- ║ Pré-requisitos (devem estar OK em prod · 10+ migrations V1 já usam):    ║
-- ║   1. Extensão pg_cron habilitada                                         ║
-- ║   2. Schema cron acessível pra role aplicador                            ║
-- ║   3. public.sdr_advance_day_buckets() existe                             ║
-- ║                                                                          ║
-- ║ Esta migration NÃO executa a função durante o apply.                     ║
-- ║ Esta migration NÃO toca leads / lead_pipeline_positions / day_bucket.    ║
-- ║ Esta migration NÃO chama WhatsApp / Evolution / provider.                ║
-- ║                                                                          ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · zero secret · zero    ║
-- ║ execução de função durante apply · padrão V2 mig 134.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Verificar que a função alvo existe (defesa em profundidade)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regprocedure('public.sdr_advance_day_buckets()') IS NULL THEN
    RAISE EXCEPTION
      '[mig 185] public.sdr_advance_day_buckets() não existe · aplicar V1 mig 20260514 + 20260581 antes';
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. GRANT EXECUTE · service_role + postgres (cron roda como postgres)
-- ═══════════════════════════════════════════════════════════════════════════
-- Função criada com SECURITY DEFINER + SET search_path (mig V1 20260514:24).
-- Garantimos que só roles internos possam executar. REVOKE de anon/
-- authenticated é defesa em profundidade · public.* não deve ser invocável
-- por client end-user.

REVOKE EXECUTE ON FUNCTION public.sdr_advance_day_buckets()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sdr_advance_day_buckets()
  TO service_role, postgres;

COMMENT ON FUNCTION public.sdr_advance_day_buckets() IS
  'Advances CRM seven_days lead pipeline buckets daily. Scheduled via pg_cron job sdr-advance-day-buckets (mig 800-185). See V1 mig 20260514 + 20260581 for the function body.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Schedule cron · idempotente (alter_job se existir, schedule se novo)
-- ═══════════════════════════════════════════════════════════════════════════

DO $cron$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname = 'sdr-advance-day-buckets';

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id   := v_jobid,
      schedule := '0 3 * * *',
      command  := 'SELECT public.sdr_advance_day_buckets();'
    );
    RAISE NOTICE '[mig 185] cron sdr-advance-day-buckets (jobid=%) alterado · schedule=0 3 * * * UTC (00:00 BRT)', v_jobid;
  ELSE
    PERFORM cron.schedule(
      job_name := 'sdr-advance-day-buckets',
      schedule := '0 3 * * *',
      command  := 'SELECT public.sdr_advance_day_buckets();'
    );
    RAISE NOTICE '[mig 185] cron sdr-advance-day-buckets criado · schedule=0 3 * * * UTC (00:00 BRT)';
  END IF;
END
$cron$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Sanity check final (regra GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════════
-- Aborta o apply se:
--   - cron job não foi criado/alterado
--   - schedule diferente de '0 3 * * *'
--   - active != true
--   - command não chama sdr_advance_day_buckets
-- Não executa a função · apenas inspeciona cron.job.

DO $sanity$
DECLARE
  v_cmd      text;
  v_sched    text;
  v_active   boolean;
  v_fn_grants int;
BEGIN
  SELECT command, schedule, active
    INTO v_cmd, v_sched, v_active
    FROM cron.job
   WHERE jobname = 'sdr-advance-day-buckets';

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION '[mig 185 sanity] cron sdr-advance-day-buckets não criado';
  END IF;

  IF v_sched IS DISTINCT FROM '0 3 * * *' THEN
    RAISE EXCEPTION '[mig 185 sanity] schedule inesperado: % (esperado: 0 3 * * *)', v_sched;
  END IF;

  IF v_cmd !~ 'sdr_advance_day_buckets' THEN
    RAISE EXCEPTION '[mig 185 sanity] cron command inesperado: %', v_cmd;
  END IF;

  IF v_active IS DISTINCT FROM true THEN
    RAISE WARNING '[mig 185 sanity] cron criado mas active=% · investigar antes de declarar OK', v_active;
  END IF;

  -- Confirma GRANT de service_role explícito (postgres já tem por default em Supabase)
  SELECT COUNT(*) INTO v_fn_grants
    FROM information_schema.routine_privileges
   WHERE routine_schema  = 'public'
     AND routine_name    = 'sdr_advance_day_buckets'
     AND grantee         = 'service_role'
     AND privilege_type  = 'EXECUTE';

  IF v_fn_grants < 1 THEN
    RAISE EXCEPTION '[mig 185 sanity] GRANT EXECUTE TO service_role ausente · cron pode falhar em runtime';
  END IF;

  RAISE NOTICE '[mig 185] sanity OK · jobname=sdr-advance-day-buckets · schedule=% · command=% · active=%', v_sched, v_cmd, v_active;
END
$sanity$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- POST-APPLY VALIDATION (rodar separado · NÃO faz parte do BEGIN/COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   -- 1. Confirmar job ativo
--   SELECT jobid, jobname, schedule, command, active
--     FROM cron.job
--    WHERE jobname = 'sdr-advance-day-buckets';
--
--   -- 2. Esperar até depois das 03:00 UTC e checar execução
--   SELECT jobid, status, return_message, start_time, end_time
--     FROM cron.job_run_details
--    WHERE command ILIKE '%sdr_advance_day_buckets%'
--    ORDER BY start_time DESC
--    LIMIT 5;
--
--   -- 3. Confirmar positions populadas (após 1+ execução do cron)
--   SELECT pipeline_slug, stage_slug, COUNT(*) AS total
--     FROM public.lead_pipeline_positions
--    WHERE pipeline_slug = 'seven_days'
--    GROUP BY pipeline_slug, stage_slug
--    ORDER BY stage_slug;
--
-- ═══════════════════════════════════════════════════════════════════════════
