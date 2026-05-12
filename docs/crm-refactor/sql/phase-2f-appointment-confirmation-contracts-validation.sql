-- ============================================================================
-- CRM_PHASE_2F · VALIDATION SQL · APPOINTMENT CONFIRMATION CONTRACTS
-- ============================================================================
-- READ-ONLY. Zero INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/TRUNCATE.
-- Rode após apply da mig 160 (ou antes para baseline).
-- Companion file: docs/crm-refactor/42-phase-2f-appointment-confirmation-contracts.md
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00_safety_snapshot
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active, 'schedule', schedule)
                 ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 73, 74);
-- Expected: 12 active=true · 71 active=false (KEEP OFF) · 72 active=true
--           73 / 74 may not exist yet (nenhum cron criado nesta fase)

SELECT 'wa_outbox_health' AS check_id, jsonb_build_object(
  'pending_total', (SELECT count(*) FROM public.wa_outbox WHERE status IN ('queued','pending','retry')),
  'empty_content', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content=''),
  'empty_phone',   (SELECT count(*) FROM public.wa_outbox WHERE phone IS NULL OR phone=''),
  'missing_lead_id', (SELECT count(*) FROM public.wa_outbox WHERE lead_id IS NULL),
  'created_last_5min', (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '5 minutes')
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 01_rules_d_before
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'rules_d_before_inventory' AS check_id,
       id, name, is_active, recipient_type, channel,
       trigger_config,
       (length(coalesce(content_template,'')) > 0) AS has_content_template,
       (length(coalesce(alert_title,'')) > 0) AS has_alert_title
FROM public.wa_agenda_automations
WHERE trigger_type = 'd_before'
ORDER BY is_active DESC, name;

SELECT 'rules_d_before_active_whatsapp_count' AS check_id, count(*) AS n
FROM public.wa_agenda_automations
WHERE trigger_type='d_before' AND is_active=true
  AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%');


-- ────────────────────────────────────────────────────────────────────────────
-- 02_rules_d_zero
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'rules_d_zero_inventory' AS check_id,
       id, name, is_active, recipient_type, channel,
       trigger_config,
       (length(coalesce(content_template,'')) > 0) AS has_content_template,
       (length(coalesce(alert_title,'')) > 0) AS has_alert_title
FROM public.wa_agenda_automations
WHERE trigger_type = 'd_zero'
ORDER BY is_active DESC, name;

SELECT 'rules_d_zero_active_whatsapp_count' AS check_id, count(*) AS n
FROM public.wa_agenda_automations
WHERE trigger_type='d_zero' AND is_active=true
  AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%');


-- ────────────────────────────────────────────────────────────────────────────
-- 03_eligible_appointments_d_before
-- ────────────────────────────────────────────────────────────────────────────
-- Considera regras d_before ativas · listing por days · target = today_SP + days
SELECT 'eligible_d_before_by_days' AS check_id,
       (r.trigger_config->>'days')::int AS days_before,
       count(a.id) AS eligible_count,
       count(a.id) FILTER (WHERE coalesce(a.subject_phone,'') <> '') AS with_phone_count
FROM public.wa_agenda_automations r
LEFT JOIN public.appointments a
  ON a.deleted_at IS NULL
  AND a.clinic_id = r.clinic_id
  AND a.scheduled_date = ((now() AT TIME ZONE 'America/Sao_Paulo')::date + (r.trigger_config->>'days')::int)
  AND a.status IN ('agendado','aguardando_confirmacao','confirmado')
  AND a.lead_id IS NOT NULL
WHERE r.trigger_type = 'd_before'
  AND r.is_active = true
  AND (r.channel ILIKE '%alert%' OR r.channel ILIKE '%whatsapp%')
GROUP BY (r.trigger_config->>'days')::int;


-- ────────────────────────────────────────────────────────────────────────────
-- 04_eligible_appointments_d_zero
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'eligible_d_zero_today' AS check_id, jsonb_build_object(
  'today_sp', (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  'total_today', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND scheduled_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date),
  'eligible_today', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND scheduled_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND status IN ('agendado','aguardando_confirmacao','confirmado')
      AND lead_id IS NOT NULL),
  'eligible_today_with_phone', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND scheduled_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND status IN ('agendado','aguardando_confirmacao','confirmado')
      AND lead_id IS NOT NULL
      AND coalesce(subject_phone,'') <> '')
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 05_existing_logs (agenda_alerts_log)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'agenda_alerts_log_kind_dist' AS check_id, alert_kind, count(*) AS n
FROM public.agenda_alerts_log
GROUP BY alert_kind
ORDER BY n DESC;

SELECT 'agenda_alerts_log_potential_duplicates' AS check_id, appt_id, alert_kind, count(*) AS n
FROM public.agenda_alerts_log
GROUP BY appt_id, alert_kind
HAVING count(*) > 1;
-- Expected: 0 rows (UNIQUE constraint must prevent)


-- ────────────────────────────────────────────────────────────────────────────
-- 06_existing_outbox por agenda
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'wa_outbox_from_agenda_by_status' AS check_id, status, count(*) AS n
FROM public.wa_outbox
WHERE rule_id IS NOT NULL
GROUP BY status
ORDER BY n DESC;

SELECT 'wa_outbox_recent_from_agenda' AS check_id, count(*) AS recent_count
FROM public.wa_outbox
WHERE rule_id IS NOT NULL
  AND created_at >= now() - interval '24 hours';


-- ────────────────────────────────────────────────────────────────────────────
-- 07_invalid_data
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'invalid_appointments_summary' AS check_id, jsonb_build_object(
  'future_no_lead_id', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND scheduled_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND lead_id IS NULL),
  'future_no_phone', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND scheduled_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND (subject_phone IS NULL OR length(trim(subject_phone)) = 0)),
  'future_invalid_status', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND scheduled_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND status NOT IN (
        'agendado','aguardando_confirmacao','confirmado','aguardando',
        'na_clinica','em_atendimento','finalizado','remarcado',
        'cancelado','no_show','bloqueado')),
  'future_terminal_in_eligible_window', (
    -- terminais (cancelado/no_show/finalizado/remarcado/bloqueado) que apareceriam
    -- se filtro de status estivesse errado · esperado: tick não pega
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND scheduled_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND status IN ('cancelado','no_show','finalizado','remarcado','bloqueado'))
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 08_helpers_present_check
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'helpers_present' AS check_id, jsonb_build_object(
  'enqueue_agenda_alert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_enqueue_agenda_alert'),
  'render_appt_template', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_render_appt_template'),
  'appt_professional_phone', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appt_professional_phone'),
  'tick_d_before_present', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_d_before_tick'),
  'tick_d_zero_present', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_d_zero_tick')
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 99_final_flags
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_verdict_flags' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT active = false FROM cron.job WHERE jobid=71),
  'd_before_rules_count', (SELECT count(*) FROM public.wa_agenda_automations WHERE trigger_type='d_before' AND is_active=true AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%')),
  'd_zero_rules_count',   (SELECT count(*) FROM public.wa_agenda_automations WHERE trigger_type='d_zero' AND is_active=true AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%')),
  'invalid_template_count', (
    SELECT count(*) FROM public.wa_agenda_automations
    WHERE trigger_type IN ('d_before','d_zero')
      AND is_active=true
      AND (length(coalesce(content_template,'')) = 0 AND length(coalesce(alert_title,'')) = 0)
      AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%')),
  'unsafe_outbox_count', (
    SELECT count(*) FROM public.wa_outbox
    WHERE content IS NULL OR content=''
       OR phone IS NULL OR phone=''
       OR lead_id IS NULL),
  'eligible_d_before_count', (
    SELECT count(DISTINCT a.id) FROM public.wa_agenda_automations r
    JOIN public.appointments a
      ON a.deleted_at IS NULL
      AND a.clinic_id = r.clinic_id
      AND a.scheduled_date = ((now() AT TIME ZONE 'America/Sao_Paulo')::date + (r.trigger_config->>'days')::int)
      AND a.status IN ('agendado','aguardando_confirmacao','confirmado')
      AND a.lead_id IS NOT NULL
      AND coalesce(a.subject_phone,'') <> ''
    WHERE r.trigger_type='d_before' AND r.is_active=true
      AND (r.channel ILIKE '%alert%' OR r.channel ILIKE '%whatsapp%')
      AND r.recipient_type IN ('patient','professional')),
  'eligible_d_zero_count', (
    SELECT count(DISTINCT a.id) FROM public.wa_agenda_automations r
    JOIN public.appointments a
      ON a.deleted_at IS NULL
      AND a.clinic_id = r.clinic_id
      AND a.scheduled_date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND a.status IN ('agendado','aguardando_confirmacao','confirmado')
      AND a.lead_id IS NOT NULL
      AND coalesce(a.subject_phone,'') <> ''
    WHERE r.trigger_type='d_zero' AND r.is_active=true
      AND (r.channel ILIKE '%alert%' OR r.channel ILIKE '%whatsapp%')
      AND r.recipient_type IN ('patient','professional'))
) AS data;
