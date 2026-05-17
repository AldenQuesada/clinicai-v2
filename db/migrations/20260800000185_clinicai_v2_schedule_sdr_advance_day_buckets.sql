-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-185 · clinicai-v2 · adopt pg_cron sdr-advance-day-buckets  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ ESTRATÉGIA: ADOPT EXISTING JOB · zero behavior change.                    ║
-- ║                                                                          ║
-- ║ Estado descoberto em prod (probe Management API · 2026-05-17):           ║
-- ║   - cron.job 'sdr-advance-day-buckets' JÁ EXISTE (jobid=1)                ║
-- ║   - schedule  = '0 0 * * *' UTC  (= 21:00 BRT)                            ║
-- ║   - command   = 'SELECT sdr_advance_day_buckets()'                        ║
-- ║   - active    = true                                                     ║
-- ║   - 5+ runs succeeded consecutivos (2026-05-13 → 2026-05-17)             ║
-- ║   - grants public.sdr_advance_day_buckets() = EXECUTE para               ║
-- ║     authenticated + postgres + service_role                              ║
-- ║                                                                          ║
-- ║ Provável origem: SELECT cron.schedule(...) rodado manualmente em Studio  ║
-- ║ em algum momento histórico, sem ser commitado em migration (R-025).      ║
-- ║                                                                          ║
-- ║ Objetivo desta migration:                                                ║
-- ║   1. VERSIONAR o estado real do cron job em código.                       ║
-- ║   2. Garantir que job existe (defensivo · cron.schedule se ausente).     ║
-- ║   3. Normalizar command pra forma explícita 'SELECT public.<fn>();'      ║
-- ║      (idempotente · cron.alter_job se já existe).                        ║
-- ║   4. Garantir GRANT EXECUTE pra service_role + postgres + authenticated  ║
-- ║      (preserva estado atual · NÃO faz REVOKE).                           ║
-- ║   5. COMMENT ON FUNCTION pra documentação in-DB.                         ║
-- ║   6. Sanity check final (read-only · valida cron.job + grants).          ║
-- ║                                                                          ║
-- ║ Esta migration NÃO:                                                      ║
-- ║   - muda schedule pra '0 3 * * *' UTC (decisão futura · mig separada)    ║
-- ║   - remove GRANT authenticated (decisão futura após audit de callers)    ║
-- ║   - executa public.sdr_advance_day_buckets()                              ║
-- ║   - chama sdr_init_lead_pipelines() / faz backfill                       ║
-- ║   - toca lead_pipeline_positions / leads.day_bucket                      ║
-- ║   - cria RPC nova                                                        ║
-- ║   - dropa função (mig V1 20260514 + 20260581 permanecem canônicas)       ║
-- ║   - dispara WhatsApp / provider / wa_outbox                              ║
-- ║                                                                          ║
-- ║ Pendência relacionada (bloco separado 3.5N):                             ║
-- ║   `lead_pipeline_positions` está com 0 rows global · 122 leads ativos    ║
-- ║   sem position seven_days. Cron roda mas não tem o que avançar           ║
-- ║   (leads_advanced=0 em todos runs). Backfill via                         ║
-- ║   `sdr_init_lead_pipelines(lead_id)` exige bloco controlado próprio.     ║
-- ║                                                                          ║
-- ║ Rollback: SELECT cron.unschedule(jobid) FROM cron.job                    ║
-- ║           WHERE jobname='sdr-advance-day-buckets';                       ║
-- ║                                                                          ║
-- ║ Idempotente · cron.alter_job se existe · cron.schedule se não.          ║
-- ║ Padrão V2 mig 800-134 (wa_chat_mirror_sync_mih).                         ║
-- ║                                                                          ║
-- ║ GOLD-STANDARD: zero behavior change · sanity check · zero secret · zero ║
-- ║ execução de função durante apply.                                        ║
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
-- 2. GRANT EXECUTE · preserva estado atual (authenticated + postgres + service_role)
-- ═══════════════════════════════════════════════════════════════════════════
-- Função criada com SECURITY DEFINER + SET search_path (mig V1 20260514).
-- Estado real em prod tem EXECUTE pra authenticated + postgres + service_role.
-- Esta migration NÃO faz REVOKE · só garante GRANTs explícitos pra todos os
-- 3 roles. Hardening de grants (remoção de authenticated) fica pra migration
-- futura separada após audit de callers TS/SQL.
--
-- GRANT é idempotente · safe pra re-run.

GRANT EXECUTE ON FUNCTION public.sdr_advance_day_buckets()
  TO authenticated, service_role, postgres;

COMMENT ON FUNCTION public.sdr_advance_day_buckets() IS
  'Advances CRM seven_days lead pipeline buckets daily via pg_cron job sdr-advance-day-buckets (mig 800-185 adopt). Function body in V1 mig 20260514 + recreated in 20260581. Schedule: 0 0 * * * UTC (= 21:00 BRT, operational since pre-2026-05-13).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Schedule cron · adopt existing · idempotente
-- ═══════════════════════════════════════════════════════════════════════════
-- Job 'sdr-advance-day-buckets' JÁ EXISTE em prod (jobid=1) com:
--   schedule = '0 0 * * *' UTC
--   command  = 'SELECT sdr_advance_day_buckets()' (sem prefix public.)
--   active   = true
--
-- Esta migration:
--   - Se job existe: cron.alter_job preserva schedule '0 0 * * *' e
--     normaliza command pra forma explícita 'SELECT public.sdr_advance_day_buckets();'
--     (mais defensivo contra mudança de search_path, sem alterar comportamento).
--   - Se job não existe (cenário hipotético · ex: ambiente staging): cron.schedule
--     cria com o mesmo schedule canônico.

DO $cron$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname = 'sdr-advance-day-buckets'
   LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id   := v_jobid,
      schedule := '0 0 * * *',
      command  := 'SELECT public.sdr_advance_day_buckets();',
      active   := true
    );
    RAISE NOTICE '[mig 185] adopt: cron sdr-advance-day-buckets (jobid=%) versionado · schedule=0 0 * * * UTC (preservado · 21:00 BRT)', v_jobid;
  ELSE
    PERFORM cron.schedule(
      job_name := 'sdr-advance-day-buckets',
      schedule := '0 0 * * *',
      command  := 'SELECT public.sdr_advance_day_buckets();'
    );
    RAISE NOTICE '[mig 185] criado: cron sdr-advance-day-buckets · schedule=0 0 * * * UTC (21:00 BRT)';
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
-- Valida o estado adotado · NÃO executa a função.
--
-- Critérios mínimos:
--   - exatamente 1 job com jobname='sdr-advance-day-buckets'
--   - schedule = '0 0 * * *' (preservado)
--   - active = true
--   - command contém 'sdr_advance_day_buckets' (ILIKE · aceita com/sem prefix)
--   - GRANT EXECUTE existe pra service_role, postgres E authenticated

DO $sanity$
DECLARE
  v_cmd            text;
  v_sched          text;
  v_active         boolean;
  v_count          int;
  v_grant_sr       int;
  v_grant_pg       int;
  v_grant_auth     int;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM cron.job
   WHERE jobname = 'sdr-advance-day-buckets';

  IF v_count = 0 THEN
    RAISE EXCEPTION '[mig 185 sanity] cron sdr-advance-day-buckets não criado';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION '[mig 185 sanity] múltiplos jobs com jobname=sdr-advance-day-buckets (count=%) · investigar', v_count;
  END IF;

  SELECT command, schedule, active
    INTO v_cmd, v_sched, v_active
    FROM cron.job
   WHERE jobname = 'sdr-advance-day-buckets';

  IF v_sched IS DISTINCT FROM '0 0 * * *' THEN
    RAISE EXCEPTION '[mig 185 sanity] schedule inesperado: % (esperado preservar: 0 0 * * *)', v_sched;
  END IF;

  IF v_cmd !~* 'sdr_advance_day_buckets' THEN
    RAISE EXCEPTION '[mig 185 sanity] cron command não contém sdr_advance_day_buckets: %', v_cmd;
  END IF;

  IF v_active IS DISTINCT FROM true THEN
    RAISE WARNING '[mig 185 sanity] cron criado mas active=% · investigar antes de declarar OK', v_active;
  END IF;

  -- Confirma GRANTs preservados (não exigimos REVOKE de authenticated · adoption strategy)
  SELECT COUNT(*) INTO v_grant_sr
    FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND routine_name='sdr_advance_day_buckets'
     AND grantee='service_role' AND privilege_type='EXECUTE';

  SELECT COUNT(*) INTO v_grant_pg
    FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND routine_name='sdr_advance_day_buckets'
     AND grantee='postgres' AND privilege_type='EXECUTE';

  SELECT COUNT(*) INTO v_grant_auth
    FROM information_schema.routine_privileges
   WHERE routine_schema='public' AND routine_name='sdr_advance_day_buckets'
     AND grantee='authenticated' AND privilege_type='EXECUTE';

  IF v_grant_sr < 1 THEN
    RAISE EXCEPTION '[mig 185 sanity] GRANT EXECUTE TO service_role ausente · cron pode falhar em runtime';
  END IF;
  IF v_grant_pg < 1 THEN
    RAISE EXCEPTION '[mig 185 sanity] GRANT EXECUTE TO postgres ausente';
  END IF;
  IF v_grant_auth < 1 THEN
    RAISE EXCEPTION '[mig 185 sanity] GRANT EXECUTE TO authenticated ausente · estado atual preservado deveria ter authenticated';
  END IF;

  RAISE NOTICE '[mig 185] sanity OK · adopt complete · jobname=sdr-advance-day-buckets · schedule=% · command=% · active=% · grants=service_role+postgres+authenticated', v_sched, v_cmd, v_active;
END
$sanity$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- DECISÕES FUTURAS (out of scope · mig separadas se Alden autorizar)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- (a) Mudar schedule '0 0 * * *' UTC (21:00 BRT) → '0 3 * * *' UTC (00:00 BRT)
--     se a operação quiser cron rodar mais tarde da noite no fuso BRT.
--     Mig futura: 800-186 ou superior · cron.alter_job apenas no schedule.
--
-- (b) REVOKE EXECUTE FROM authenticated se audit de callers TS/SQL provar
--     que nenhum cliente authenticated invoca a função (esperado: SECURITY
--     DEFINER + intent operacional · cron only). Mig futura separada após
--     grep cross-repo + análise de RLS.
--
-- (c) Backfill de lead_pipeline_positions pra 122 leads ativos sem position
--     seven_days. Bloco separado 3.5N · usa sdr_init_lead_pipelines em loop
--     controlado · não é responsabilidade desta migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POST-APPLY VALIDATION (rodar separado · NÃO faz parte do BEGIN/COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   -- 1. Confirmar job adopted
--   SELECT jobid, jobname, schedule, command, active
--     FROM cron.job
--    WHERE jobname = 'sdr-advance-day-buckets';
--
--   -- 2. Confirmar próxima execução continua acontecendo
--   SELECT jobid, status, return_message, start_time, end_time
--     FROM cron.job_run_details
--    WHERE command ILIKE '%sdr_advance_day_buckets%'
--    ORDER BY start_time DESC
--    LIMIT 5;
--
--   -- 3. Confirmar grants preservados
--   SELECT grantee, privilege_type
--     FROM information_schema.routine_privileges
--    WHERE routine_schema = 'public'
--      AND routine_name = 'sdr_advance_day_buckets'
--    ORDER BY grantee, privilege_type;
--   -- Esperado: authenticated, postgres, service_role com EXECUTE
--
-- ═══════════════════════════════════════════════════════════════════════════
