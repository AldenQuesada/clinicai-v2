-- ============================================================================
-- CRM_PHASE_2G.2 · SMOKE READ-ONLY · Cron 91 + UI bell data contract
-- ============================================================================
-- Read-only. Confirma criação do cron 91 (not_confirmed) + integridade da
-- tabela appointment_internal_alerts. Não dispara cron · não executa tick.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00 · Estado dos crons (5 + novo)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobid IN (12, 71, 72, 89, 90, 91)
ORDER BY jobid;
-- Expected:
--   12: active=true · daily-agenda-summary
--   71: active=false (gate inegociável)
--   72: active=true · min_before
--   89: active=true · d_zero
--   90: active=true · d_before
--   91: active=true · agenda-alert-not-confirmed-tick · '0 11 * * *'


-- ────────────────────────────────────────────────────────────────────────────
-- 01 · Job 91 detail
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'job_91_detail' AS check_id,
       jobid, jobname, schedule, command, active,
       (schedule = '0 11 * * *') AS schedule_ok,
       (command  = 'SELECT public._appointment_not_confirmed_alert_tick();') AS command_ok
FROM cron.job
WHERE jobid = 91;


-- ────────────────────────────────────────────────────────────────────────────
-- 02 · cron.job_run_details para 91 nas últimas 24h (esperado: 0 se ainda
--      não passou a janela 08:00 BRT diária)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'job_91_runs_24h' AS check_id,
       count(*) AS runs_count
FROM cron.job_run_details
WHERE jobid = 91 AND start_time >= now() - interval '24 hours';


-- ────────────────────────────────────────────────────────────────────────────
-- 03 · Tabela appointment_internal_alerts saudável
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'alerts_table_health' AS check_id, jsonb_build_object(
  'total', (SELECT count(*) FROM public.appointment_internal_alerts),
  'unread', (SELECT count(*) FROM public.appointment_internal_alerts WHERE is_read = false),
  'duplicate_by_uq_key', (SELECT count(*) FROM (SELECT appointment_id, alert_kind, target_role, count(*) n FROM public.appointment_internal_alerts GROUP BY appointment_id, alert_kind, target_role HAVING count(*) > 1) s),
  'orphan_appt', (SELECT count(*) FROM public.appointment_internal_alerts a WHERE NOT EXISTS (SELECT 1 FROM public.appointments x WHERE x.id = a.appointment_id))
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 04 · UI contract · simula o SELECT que o hook useAppointmentInternalAlerts
--      faz (read-only · sem modificar nada)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'ui_unread_top50' AS check_id, count(*) AS n
FROM (
  SELECT id, appointment_id, alert_kind, target_role, target_user_id, payload, is_read, read_at, created_at
  FROM public.appointment_internal_alerts
  WHERE is_read = false
  ORDER BY created_at DESC
  LIMIT 50
) s;


-- ────────────────────────────────────────────────────────────────────────────
-- 05 · Final flags
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_flags_2g2' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'cron_91_active', (SELECT active FROM cron.job WHERE jobid=91),
  'cron_91_schedule_ok', (SELECT schedule = '0 11 * * *' FROM cron.job WHERE jobid=91),
  'cron_91_command_ok', (SELECT command = 'SELECT public._appointment_not_confirmed_alert_tick();' FROM cron.job WHERE jobid=91),
  'alert_fns_complete', (
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_create')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_mark_read')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_not_confirmed_alert_tick')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert')
  ),
  'mark_read_exec_by_authenticated', has_function_privilege('authenticated','public.appointment_internal_alert_mark_read(uuid)','EXECUTE'),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'no_send_cron_active', NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%')
) AS data;
