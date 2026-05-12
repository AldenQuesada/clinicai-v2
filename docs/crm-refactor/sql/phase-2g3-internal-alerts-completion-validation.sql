-- ============================================================================
-- CRM_PHASE_2G.3 · VALIDATION SQL · INTERNAL ALERTS COMPLETION
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE.
-- Companion: docs/crm-refactor/51-phase-2g3-internal-alerts-completion.md
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00 · Safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);
-- Expected: 71 active=false (gate) · 12/72/89/90/91/92 active=true · 93/94 active=true se criados

SELECT 'worker71_off' AS check_id,
       (SELECT NOT active FROM cron.job WHERE jobid=71) AS worker71_off;

SELECT 'no_send_cron_active' AS check_id,
       NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%') AS data;

SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe_count;


-- ────────────────────────────────────────────────────────────────────────────
-- 01 · Funções tick novas
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'fn_next_patient' AS check_id,
       p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_function_result(p.oid) AS returns,
       has_function_privilege('service_role','public._appointment_next_patient_internal_alert_tick()','EXECUTE') AS service_role_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='_appointment_next_patient_internal_alert_tick';

SELECT 'fn_attention_required' AS check_id,
       p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_function_result(p.oid) AS returns,
       has_function_privilege('service_role','public._appointment_attention_required_alert_tick()','EXECUTE') AS service_role_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='_appointment_attention_required_alert_tick';


-- ────────────────────────────────────────────────────────────────────────────
-- 02 · Helper mig 161 intacto
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'helper_create_fn' AS check_id,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='appointment_internal_alert_create') AS helper_exists;

SELECT 'table_internal_alerts' AS check_id,
       EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='appointment_internal_alerts') AS table_exists;

SELECT 'enum_constraint' AS check_id,
       pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='appointment_internal_alerts' AND c.conname='chk_app_alerts_kind';
-- Expected: deve conter 'next_patient' e 'attention_required'


-- ────────────────────────────────────────────────────────────────────────────
-- 03 · Cron novos (93 + 94)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_93_inventory' AS check_id, jobid, jobname, schedule, command, active
FROM cron.job
WHERE command ILIKE '%_appointment_next_patient_internal_alert_tick%';

SELECT 'cron_94_inventory' AS check_id, jobid, jobname, schedule, command, active
FROM cron.job
WHERE command ILIKE '%_appointment_attention_required_alert_tick%';

SELECT 'cron_93_duplicates' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%_appointment_next_patient_internal_alert_tick%';
-- Expected: 0 ou 1

SELECT 'cron_94_duplicates' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%_appointment_attention_required_alert_tick%';
-- Expected: 0 ou 1


-- ────────────────────────────────────────────────────────────────────────────
-- 04 · Eligible candidates (next_patient window)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'eligible_next_patient_now' AS check_id,
       count(a.id) AS eligible_count,
       count(a.id) FILTER (WHERE a.professional_id IS NOT NULL) AS with_professional
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND a.status IN ('agendado','aguardando_confirmacao','confirmado','aguardando')
  AND ((a.scheduled_date::text || ' ' || a.start_time::text)::timestamp
       AT TIME ZONE 'America/Sao_Paulo')
      BETWEEN now() + interval '25 minutes' AND now() + interval '35 minutes';


-- ────────────────────────────────────────────────────────────────────────────
-- 05 · Eligible candidates (attention_required 7d window)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'eligible_attention_required_7d' AS check_id,
       count(a.id) AS total_eligible,
       count(a.id) FILTER (WHERE coalesce(a.subject_phone,'')='') AS would_flag_no_phone,
       count(a.id) FILTER (WHERE a.lead_id IS NULL AND a.patient_id IS NULL) AS would_flag_no_subject_link,
       count(a.id) FILTER (WHERE a.professional_id IS NULL OR coalesce(a.professional_name,'')='') AS would_flag_no_professional
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND a.scheduled_date BETWEEN ((now() AT TIME ZONE 'America/Sao_Paulo')::date)
                          AND ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7)
  AND a.status IN ('agendado','aguardando_confirmacao','confirmado');


-- ────────────────────────────────────────────────────────────────────────────
-- 06 · Existing internal alerts inventory
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'internal_alerts_by_kind' AS check_id,
       alert_kind, target_role, count(*) AS n
FROM public.appointment_internal_alerts
GROUP BY alert_kind, target_role
ORDER BY alert_kind, target_role;

SELECT 'internal_alerts_duplicates' AS check_id,
       appointment_id, alert_kind, target_role, count(*) AS n
FROM public.appointment_internal_alerts
GROUP BY appointment_id, alert_kind, target_role
HAVING count(*) > 1;
-- Expected: 0 rows (UNIQUE protege)


-- ────────────────────────────────────────────────────────────────────────────
-- 99 · Final flags
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_flags_2g3' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'next_patient_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_next_patient_internal_alert_tick'),
  'attention_required_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_attention_required_alert_tick'),
  'helper_create_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_create'),
  'table_exists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts'),
  'cron_93_active', EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_appointment_next_patient_internal_alert_tick%'),
  'cron_94_active', EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_appointment_attention_required_alert_tick%'),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'duplicate_alerts_count', (SELECT count(*) FROM (SELECT appointment_id, alert_kind, target_role, count(*) n FROM public.appointment_internal_alerts GROUP BY appointment_id, alert_kind, target_role HAVING count(*)>1) s),
  'tracker_mig_163', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000163'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_next_patient_internal_alert_tick')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_attention_required_alert_tick')
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
  )
) AS data;
