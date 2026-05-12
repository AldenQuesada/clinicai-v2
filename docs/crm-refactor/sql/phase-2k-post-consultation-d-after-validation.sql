-- ============================================================================
-- CRM_PHASE_2K · VALIDATION SQL · POST-CONSULTATION D_AFTER
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE.
-- Companion: docs/crm-refactor/52-phase-2k-post-consultation-d-after-followup.md
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00 · Safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92);
-- Expected: 71 active=false (gate) · 12/72/89/90/91 active=true · 92 (d_after) active=true se criado

SELECT 'worker71_off' AS check_id,
       (SELECT NOT active FROM cron.job WHERE jobid=71) AS worker71_off;

SELECT 'no_send_cron_active' AS check_id,
       NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%') AS data;

SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe_count;


-- ────────────────────────────────────────────────────────────────────────────
-- 01 · Rules d_after
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'rules_d_after_full' AS check_id,
       id, name, is_active, recipient_type, channel,
       (trigger_config->>'days')::int AS days,
       (length(coalesce(content_template,''))>0) AS has_content,
       (length(coalesce(alert_title,''))>0) AS has_alert_title
FROM public.wa_agenda_automations
WHERE trigger_type = 'd_after'
ORDER BY (trigger_config->>'days')::int, name;

SELECT 'rules_d_after_whatsapp_active_count' AS check_id, count(*) AS n
FROM public.wa_agenda_automations
WHERE trigger_type='d_after' AND is_active=true
  AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%')
  AND recipient_type IN ('patient','professional');


-- ────────────────────────────────────────────────────────────────────────────
-- 02 · Eligible candidates por N days_after
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'eligible_d_after_by_days' AS check_id,
       (r.trigger_config->>'days')::int AS days_after,
       count(a.id) AS eligible_count,
       count(a.id) FILTER (WHERE coalesce(a.subject_phone,'') <> '') AS with_phone_count
FROM public.wa_agenda_automations r
LEFT JOIN public.appointments a
  ON a.deleted_at IS NULL
  AND a.clinic_id = r.clinic_id
  AND a.scheduled_date = ((now() AT TIME ZONE 'America/Sao_Paulo')::date - (r.trigger_config->>'days')::int)
  AND a.status = 'finalizado'
  AND a.lead_id IS NOT NULL
WHERE r.trigger_type = 'd_after'
  AND r.is_active = true
  AND (r.channel ILIKE '%alert%' OR r.channel ILIKE '%whatsapp%')
  AND r.recipient_type IN ('patient','professional')
GROUP BY (r.trigger_config->>'days')::int
ORDER BY days_after;


-- ────────────────────────────────────────────────────────────────────────────
-- 03 · Existing logs (agenda_alerts_log para day_plus_N)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'agenda_alerts_log_day_plus' AS check_id, alert_kind, count(*) AS n
FROM public.agenda_alerts_log
WHERE alert_kind LIKE 'day_plus_%'
GROUP BY alert_kind
ORDER BY alert_kind;

SELECT 'agenda_alerts_log_duplicates' AS check_id, appt_id, alert_kind, count(*) AS n
FROM public.agenda_alerts_log
WHERE alert_kind LIKE 'day_plus_%'
GROUP BY appt_id, alert_kind
HAVING count(*) > 1;
-- Expected: 0 rows (UNIQUE protege)


-- ────────────────────────────────────────────────────────────────────────────
-- 04 · Existing outbox dos rule_ids d_after
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'wa_outbox_d_after_24h' AS check_id, rule_id, status, count(*) AS n
FROM public.wa_outbox
WHERE rule_id IN (SELECT id FROM public.wa_agenda_automations WHERE trigger_type='d_after')
  AND created_at >= now() - interval '24 hours'
GROUP BY rule_id, status
ORDER BY n DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- 05 · Function d_after
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'fn_d_after' AS check_id,
       p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_function_result(p.oid) AS returns,
       has_function_privilege('service_role','public._agenda_alert_d_after_tick()','EXECUTE') AS service_role_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='_agenda_alert_d_after_tick';


-- ────────────────────────────────────────────────────────────────────────────
-- 06 · Cron d_after
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_d_after_inventory' AS check_id, jobid, jobname, schedule, command, active
FROM cron.job
WHERE command ILIKE '%_agenda_alert_d_after_tick%'
ORDER BY jobid;

SELECT 'cron_d_after_duplicates' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%_agenda_alert_d_after_tick%';
-- Expected: 0 ou 1


-- ────────────────────────────────────────────────────────────────────────────
-- 99 · Final flags
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_flags_2k' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'd_after_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_d_after_tick'),
  'd_after_rules_count', (SELECT count(*) FROM public.wa_agenda_automations WHERE trigger_type='d_after' AND is_active=true AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%') AND recipient_type IN ('patient','professional')),
  'd_after_cron_active', EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_agenda_alert_d_after_tick%'),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'duplicate_log_count', (SELECT count(*) FROM (SELECT appt_id, alert_kind, count(*) n FROM public.agenda_alerts_log WHERE alert_kind LIKE 'day_plus_%' GROUP BY appt_id, alert_kind HAVING count(*)>1) s),
  'tracker_mig_162', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000162'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_d_after_tick')
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
  )
) AS data;
