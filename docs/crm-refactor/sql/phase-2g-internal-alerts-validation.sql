-- ============================================================================
-- CRM_PHASE_2G · VALIDATION SQL · INTERNAL APPOINTMENT ALERTS
-- ============================================================================
-- READ-ONLY. Zero INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE.
-- Companion: docs/crm-refactor/47-phase-2g-internal-alerts-secretaria-mirian.md
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00_safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90);
-- Expected: 71 active=false (gate); 12/72/89/90 active=true

SELECT 'worker71_off' AS check_id,
       (SELECT NOT active FROM cron.job WHERE jobid=71) AS worker71_off;
-- Expected: true (gate inegociável)

SELECT 'no_send_cron_active' AS check_id,
       NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%') AS data;
-- Expected: true (sem worker de envio ativo)

SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe_count;
-- Expected: 0


-- ────────────────────────────────────────────────────────────────────────────
-- 01_internal_alert_schema
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'table_exists' AS check_id,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts') AS data;

SELECT 'columns' AS check_id, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='appointment_internal_alerts'
ORDER BY ordinal_position;

SELECT 'constraints' AS check_id, conname, contype, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='appointment_internal_alerts'
ORDER BY conname;

SELECT 'indexes' AS check_id, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='appointment_internal_alerts'
ORDER BY indexname;

SELECT 'rls_enabled' AS check_id,
       (SELECT relrowsecurity FROM pg_class WHERE oid='public.appointment_internal_alerts'::regclass) AS data;
-- Expected: true

SELECT 'rls_policies' AS check_id, polname AS policy_name, polcmd AS cmd, polroles::regrole[] AS roles
FROM pg_policy
WHERE polrelid = 'public.appointment_internal_alerts'::regclass;


-- ────────────────────────────────────────────────────────────────────────────
-- 02_alert_functions
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'fn_inventory' AS check_id,
       p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_function_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS returns
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('appointment_internal_alert_create','appointment_internal_alert_mark_read','_appointment_not_confirmed_alert_tick','appointment_arrival_internal_alert')
ORDER BY p.proname;
-- Expected: 4 rows · all DEFINER

SELECT 'fn_grants_authenticated' AS check_id,
       has_function_privilege('authenticated', 'public.appointment_internal_alert_create(uuid, text, text, uuid, jsonb)', 'EXECUTE') AS create_exec,
       has_function_privilege('authenticated', 'public.appointment_internal_alert_mark_read(uuid)', 'EXECUTE') AS mark_read_exec,
       has_function_privilege('authenticated', 'public.appointment_arrival_internal_alert(uuid)', 'EXECUTE') AS arrival_exec;
-- Expected: all true (tick fn é service_role only)


-- ────────────────────────────────────────────────────────────────────────────
-- 03_not_confirmed_candidates
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'not_confirmed_today_count' AS check_id,
       count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND scheduled_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND status IN ('agendado','aguardando_confirmacao');

SELECT 'not_confirmed_tomorrow_count' AS check_id,
       count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND scheduled_date = ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1)
  AND status IN ('agendado','aguardando_confirmacao');

SELECT 'not_confirmed_sample' AS check_id,
       id, subject_name, scheduled_date, start_time, status,
       (lead_id IS NOT NULL) AS has_lead,
       (subject_phone IS NOT NULL AND length(trim(subject_phone))>0) AS has_phone
FROM public.appointments
WHERE deleted_at IS NULL
  AND scheduled_date IN ((now() AT TIME ZONE 'America/Sao_Paulo')::date, (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1)
  AND status IN ('agendado','aguardando_confirmacao')
ORDER BY scheduled_date, start_time
LIMIT 20;


-- ────────────────────────────────────────────────────────────────────────────
-- 04_arrival_candidates
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'arrival_status_count' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status IN ('aguardando','na_clinica','em_atendimento','em_consulta')
GROUP BY status;

SELECT 'arrival_existing_alerts' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts
WHERE alert_kind = 'arrival';


-- ────────────────────────────────────────────────────────────────────────────
-- 05_notification_health
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'alerts_total' AS check_id, count(*) AS n FROM public.appointment_internal_alerts;

SELECT 'alerts_by_kind' AS check_id,
       jsonb_object_agg(alert_kind, n) AS data
FROM (SELECT alert_kind, count(*) n FROM public.appointment_internal_alerts GROUP BY alert_kind) s;

SELECT 'alerts_by_target' AS check_id,
       jsonb_object_agg(target_role, n) AS data
FROM (SELECT target_role, count(*) n FROM public.appointment_internal_alerts GROUP BY target_role) s;

SELECT 'alerts_unread_total' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts WHERE is_read = false;

SELECT 'duplicates_check' AS check_id, appointment_id, alert_kind, target_role, count(*) AS n
FROM public.appointment_internal_alerts
GROUP BY appointment_id, alert_kind, target_role
HAVING count(*) > 1;
-- Expected: 0 rows (UNIQUE constraint protege)

SELECT 'orphan_appointment_check' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts a
WHERE NOT EXISTS (SELECT 1 FROM public.appointments x WHERE x.id = a.appointment_id);
-- Expected: 0 (ON DELETE CASCADE protege)


-- ────────────────────────────────────────────────────────────────────────────
-- 06_ui_contract (counts pra unread badge)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'unread_by_target_role' AS check_id,
       target_role,
       count(*) FILTER (WHERE is_read = false) AS unread,
       count(*) AS total
FROM public.appointment_internal_alerts
GROUP BY target_role
ORDER BY unread DESC;

SELECT 'unread_last_24h' AS check_id,
       count(*) AS n
FROM public.appointment_internal_alerts
WHERE is_read = false AND created_at >= now() - interval '24 hours';


-- ────────────────────────────────────────────────────────────────────────────
-- 99_final_flags
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_flags' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'no_send_cron_active', NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%'),
  'internal_alert_table_exists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts'),
  'create_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_create'),
  'mark_read_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_mark_read'),
  'not_confirmed_tick_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_not_confirmed_alert_tick'),
  'arrival_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert'),
  'duplicate_alert_count', (SELECT count(*) FROM (SELECT appointment_id, alert_kind, target_role, count(*) n FROM public.appointment_internal_alerts GROUP BY appointment_id, alert_kind, target_role HAVING count(*)>1) s),
  'orphan_alert_count', (SELECT count(*) FROM public.appointment_internal_alerts a WHERE NOT EXISTS (SELECT 1 FROM public.appointments x WHERE x.id = a.appointment_id)),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'provider_call_count_or_zero', 0,
  'can_continue_to_next_phase', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts')
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
  ),
  'tracker_mig_161', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000161')
) AS data;
