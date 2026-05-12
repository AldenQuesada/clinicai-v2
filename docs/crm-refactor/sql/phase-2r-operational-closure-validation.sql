-- ============================================================================
-- CRM_PHASE_2R · OPERATIONAL CLOSURE · VALIDATION SQL
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE.
-- Companion: docs/crm-refactor/61-phase-2r-operational-closure-crm-agenda-whatsapp.md
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00 · Repo reference (esperado)
-- ────────────────────────────────────────────────────────────────────────────
-- HEAD esperado:  25c9cab (CRM_PHASE_2I · anamnesis + consent)
-- Branch:         main
-- Working tree:   clean


-- ────────────────────────────────────────────────────────────────────────────
-- 01 · Jobs safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'schedule', schedule, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS worker71_off;

SELECT 'no_send_cron_active' AS check_id,
       NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%') AS data;

SELECT 'no_provider_cron' AS check_id,
       (SELECT count(*) FROM cron.job WHERE active=true AND (command ILIKE '%evolution%' OR command ILIKE '%cloud_meta%' OR command ILIKE '%meta_api%' OR command ILIKE '%sendMessage%')) AS provider_call_count;

SELECT 'crons_touching_outbox' AS check_id, jobid, jobname, active, substring(command, 1, 80) AS cmd_snippet
FROM cron.job WHERE command ILIKE '%wa_outbox%'
ORDER BY jobid;
-- Esperado: jobid 9 (wa-outbox-cleanup · cleanup safe) + jobid 71 (OFF)


-- ────────────────────────────────────────────────────────────────────────────
-- 02 · Migrations tracker
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'migs_2f_to_2i_registered' AS check_id,
       jsonb_agg(version ORDER BY version) AS versions
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260800000160',  -- 2F · d_before/d_zero ticks
  '20260800000161',  -- 2G · appointment_internal_alerts
  '20260800000162',  -- 2K · d_after tick
  '20260800000163',  -- 2G.3 · next_patient + attention_required
  '20260800000166'   -- 2I · anamnesis + consent intra-consulta
);


-- ────────────────────────────────────────────────────────────────────────────
-- 03 · Functions inventory
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'fns_inventory' AS check_id, p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  '_agenda_alert_min_before_tick',
  '_agenda_alert_d_before_tick',
  '_agenda_alert_d_zero_tick',
  '_agenda_alert_d_after_tick',
  'appointment_internal_alert_create',
  'appointment_internal_alert_mark_read',
  '_appointment_not_confirmed_alert_tick',
  'appointment_arrival_internal_alert',
  '_appointment_next_patient_internal_alert_tick',
  '_appointment_attention_required_alert_tick',
  'appointment_finalize',
  'appointment_attend',
  'appointment_change_status',
  'appointment_anamnesis_upsert',
  'appointment_anamnesis_mark_complete',
  'appointment_consent_accept',
  'appointment_clinical_gate_status'
)
ORDER BY p.proname;


-- ────────────────────────────────────────────────────────────────────────────
-- 04 · wa_outbox health
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe;

SELECT 'wa_outbox_by_status' AS check_id, status, count(*) AS n
FROM public.wa_outbox GROUP BY status ORDER BY n DESC;

SELECT 'wa_outbox_pending_old_1h' AS check_id, count(*) AS n
FROM public.wa_outbox WHERE status IN ('queued','pending') AND created_at < now() - interval '1 hour';

SELECT 'wa_outbox_last_24h' AS check_id, count(*) AS n
FROM public.wa_outbox WHERE created_at >= now() - interval '24 hours';


-- ────────────────────────────────────────────────────────────────────────────
-- 05 · agenda_alerts_log health
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'agenda_alerts_log_total' AS check_id, count(*) AS n FROM public.agenda_alerts_log;

SELECT 'agenda_alerts_log_by_kind' AS check_id, alert_kind, count(*) AS n
FROM public.agenda_alerts_log GROUP BY alert_kind ORDER BY n DESC;

SELECT 'agenda_alerts_log_duplicates_24h' AS check_id, count(*) AS n
FROM (
  SELECT appt_id, alert_kind, count(*) c
  FROM public.agenda_alerts_log
  WHERE created_at >= now() - interval '24 hours'
  GROUP BY appt_id, alert_kind
  HAVING count(*) > 1
) s;


-- ────────────────────────────────────────────────────────────────────────────
-- 06 · appointment_internal_alerts health
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'internal_alerts_total' AS check_id, count(*) AS n FROM public.appointment_internal_alerts;

SELECT 'internal_alerts_unread' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts WHERE is_read = false;

SELECT 'internal_alerts_by_kind' AS check_id, alert_kind, count(*) AS n
FROM public.appointment_internal_alerts GROUP BY alert_kind ORDER BY n DESC;

SELECT 'internal_alerts_duplicates' AS check_id, count(*) AS n
FROM (
  SELECT appointment_id, alert_kind, target_role, count(*) c
  FROM public.appointment_internal_alerts
  GROUP BY appointment_id, alert_kind, target_role
  HAVING count(*) > 1
) s;

SELECT 'internal_alerts_orphan' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts a
LEFT JOIN public.appointments ap ON ap.id = a.appointment_id
WHERE ap.id IS NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 07 · Clinical tables health (mig 166)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'anamneses_total' AS check_id, count(*) AS n FROM public.appointment_anamneses;
SELECT 'anamneses_by_status' AS check_id, status, count(*) AS n
FROM public.appointment_anamneses GROUP BY status;

SELECT 'consents_total' AS check_id, count(*) AS n FROM public.appointment_informed_consents;
SELECT 'consents_accepted' AS check_id, count(*) AS n
FROM public.appointment_informed_consents WHERE accepted = true;

SELECT 'clinical_duplicates' AS check_id, jsonb_build_object(
  'anamnesis', (SELECT count(*) FROM (SELECT appointment_id, count(*) c FROM public.appointment_anamneses WHERE deleted_at IS NULL AND status <> 'archived' GROUP BY appointment_id HAVING count(*) > 1) s),
  'consent', (SELECT count(*) FROM (SELECT appointment_id, term_key, term_version, count(*) c FROM public.appointment_informed_consents WHERE deleted_at IS NULL AND revoked_at IS NULL GROUP BY appointment_id, term_key, term_version HAVING count(*) > 1) s)
) AS counts;

SELECT 'clinical_orphans' AS check_id, jsonb_build_object(
  'anamnesis', (SELECT count(*) FROM public.appointment_anamneses a LEFT JOIN public.appointments ap ON ap.id=a.appointment_id WHERE ap.id IS NULL),
  'consent', (SELECT count(*) FROM public.appointment_informed_consents c LEFT JOIN public.appointments ap ON ap.id=c.appointment_id WHERE ap.id IS NULL),
  'consent_accepted_without_ts', (SELECT count(*) FROM public.appointment_informed_consents WHERE accepted=true AND accepted_at IS NULL)
) AS counts;


-- ────────────────────────────────────────────────────────────────────────────
-- 08 · Cron runs (job_run_details last 48h, top 3 per job)
-- ────────────────────────────────────────────────────────────────────────────
SELECT jobid, start_time, end_time, status, substring(COALESCE(return_message, ''), 1, 100) AS msg
FROM (
  SELECT jobid, start_time, end_time, status, return_message,
         row_number() OVER (PARTITION BY jobid ORDER BY start_time DESC) AS rn
  FROM cron.job_run_details
  WHERE jobid IN (89, 90, 91, 92, 93, 94)
    AND start_time >= now() - interval '48 hours'
) s
WHERE rn <= 3
ORDER BY jobid, start_time DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- 09 · CRM state
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'appointments_by_status' AS check_id, status, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL GROUP BY status ORDER BY status;

SELECT 'appointments_invalid_status' AS check_id, count(*) AS n
FROM public.appointments
WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'leads_by_phase' AS check_id, COALESCE(phase, 'NULL') AS phase, count(*) AS n
FROM public.leads WHERE deleted_at IS NULL GROUP BY phase ORDER BY phase;

SELECT 'leads_by_lifecycle' AS check_id, lifecycle_status, count(*) AS n
FROM public.leads WHERE deleted_at IS NULL GROUP BY lifecycle_status ORDER BY lifecycle_status;

-- crm_operational_view buckets (se a view existir)
SELECT 'crm_view_buckets_exists' AS check_id,
       EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view') AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 10 · Legacy terms scan (pg_proc src)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'legacy_terms_in_fns' AS check_id,
       term,
       count(*) AS fn_count
FROM (
  SELECT 'em_consulta' AS term FROM pg_proc p WHERE prosrc ILIKE '%em_consulta%'
  UNION ALL
  SELECT 'pre_consulta' FROM pg_proc p WHERE prosrc ILIKE '%pre_consulta%'
  UNION ALL
  SELECT 'compareceu' FROM pg_proc p WHERE prosrc ILIKE '%compareceu%'
  UNION ALL
  SELECT 'reagendado' FROM pg_proc p WHERE prosrc ILIKE '%reagendado%'
) s
GROUP BY term;


-- ────────────────────────────────────────────────────────────────────────────
-- 99 · Final flags
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_flags_2r' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'no_provider_cron', (SELECT count(*) = 0 FROM cron.job WHERE active=true AND (command ILIKE '%evolution%' OR command ILIKE '%meta_api%' OR command ILIKE '%cloud_meta%' OR command ILIKE '%sendMessage%')),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'duplicate_internal_alert_count', (SELECT count(*) FROM (SELECT appointment_id, alert_kind, target_role, count(*) c FROM public.appointment_internal_alerts GROUP BY appointment_id, alert_kind, target_role HAVING count(*) > 1) s),
  'clinical_duplicate_count', (
    (SELECT count(*) FROM (SELECT appointment_id, count(*) c FROM public.appointment_anamneses WHERE deleted_at IS NULL AND status <> 'archived' GROUP BY appointment_id HAVING count(*) > 1) s)
    +
    (SELECT count(*) FROM (SELECT appointment_id, term_key, term_version, count(*) c FROM public.appointment_informed_consents WHERE deleted_at IS NULL AND revoked_at IS NULL GROUP BY appointment_id, term_key, term_version HAVING count(*) > 1) s)
  ),
  'invalid_appointment_status_count', (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')),
  'invalid_lead_phase_count', (SELECT count(*) FROM public.leads WHERE phase = 'perdido' AND lifecycle_status='ativo'),
  'migs_2f_2i_complete', (SELECT count(*) = 5 FROM supabase_migrations.schema_migrations WHERE version IN ('20260800000160','20260800000161','20260800000162','20260800000163','20260800000166')),
  'can_open_next_round', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
    AND (SELECT count(*) = 5 FROM supabase_migrations.schema_migrations WHERE version IN ('20260800000160','20260800000161','20260800000162','20260800000163','20260800000166'))
  )
) AS data;
