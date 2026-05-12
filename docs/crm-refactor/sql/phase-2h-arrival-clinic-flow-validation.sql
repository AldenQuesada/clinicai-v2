-- ============================================================================
-- CRM_PHASE_2H · VALIDATION SQL · ARRIVAL + PATIENT IN CLINIC + START ATTENDANCE
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE.
-- Companion: docs/crm-refactor/55-phase-2h-arrival-patient-in-clinic-ui.md
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00 · Safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);
-- Expected: 71 active=false (gate) · 12/72/89/90/91/92/93/94 active=true

SELECT 'worker71_off' AS check_id,
       (SELECT NOT active FROM cron.job WHERE jobid=71) AS worker71_off;

SELECT 'no_send_cron_active' AS check_id,
       NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%') AS data;

SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe_count;


-- ────────────────────────────────────────────────────────────────────────────
-- 01 · Appointment status distribution
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'status_distribution' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY status;

-- Status fora do canon (deveria ser zero · CHECK constraint protege)
SELECT 'invalid_status_rows' AS check_id, count(*) AS n
FROM public.appointments
WHERE status NOT IN (
  'agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica',
  'em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado'
);


-- ────────────────────────────────────────────────────────────────────────────
-- 02 · Arrival + start-attendance RPCs
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'fn_appointment_attend' AS check_id,
       p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_function_result(p.oid) AS returns,
       has_function_privilege('authenticated','public.appointment_attend(uuid, text)','EXECUTE') AS auth_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_attend';

SELECT 'fn_appointment_change_status' AS check_id,
       p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_function_result(p.oid) AS returns,
       has_function_privilege('authenticated','public.appointment_change_status(uuid, text, text)','EXECUTE') AS auth_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_change_status';

SELECT 'fn_appointment_arrival_internal_alert' AS check_id,
       p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_function_result(p.oid) AS returns,
       has_function_privilege('authenticated','public.appointment_arrival_internal_alert(uuid)','EXECUTE') AS auth_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert';

SELECT 'fn_transition_allowed' AS check_id,
       public._appointment_status_transition_allowed('confirmado','na_clinica') AS via_attend_legacy,
       public._appointment_status_transition_allowed('aguardando','na_clinica') AS aguardando_na_clinica,
       public._appointment_status_transition_allowed('na_clinica','em_atendimento') AS na_clinica_em_atendimento,
       public._appointment_status_transition_allowed('em_atendimento','finalizado') AS em_atendimento_finalizado,
       public._appointment_status_transition_allowed('cancelado','na_clinica') AS cancelado_na_clinica,
       public._appointment_status_transition_allowed('finalizado','em_atendimento') AS finalizado_em_atendimento,
       public._appointment_status_transition_allowed('no_show','na_clinica') AS no_show_na_clinica;
-- Expected: true, true, true, true, false, false, false


-- ────────────────────────────────────────────────────────────────────────────
-- 03 · Arrival candidates (status pode marcar chegada)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'arrival_candidates' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status IN ('agendado','aguardando_confirmacao','confirmado','aguardando')
  AND scheduled_date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)
  AND scheduled_date <= ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 30)
GROUP BY status
ORDER BY status;


-- ────────────────────────────────────────────────────────────────────────────
-- 04 · Start attendance candidates (status na_clinica)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'start_attendance_candidates' AS check_id,
       count(*) AS n,
       count(*) FILTER (WHERE professional_id IS NOT NULL) AS with_professional
FROM public.appointments
WHERE deleted_at IS NULL
  AND status = 'na_clinica';


-- ────────────────────────────────────────────────────────────────────────────
-- 05 · Internal alert health (patient_arrived = arrival)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'arrival_alerts_by_role' AS check_id, target_role, count(*) AS n
FROM public.appointment_internal_alerts
WHERE alert_kind = 'arrival'
GROUP BY target_role
ORDER BY target_role;

SELECT 'arrival_alerts_duplicates' AS check_id,
       (SELECT count(*) FROM (
         SELECT appointment_id, target_role, count(*) c
         FROM public.appointment_internal_alerts
         WHERE alert_kind='arrival'
         GROUP BY appointment_id, target_role
         HAVING count(*) > 1
       ) s) AS n;
-- Expected: 0 (UNIQUE protege)

SELECT 'arrival_alerts_orphan' AS check_id,
       (SELECT count(*) FROM public.appointment_internal_alerts a
         LEFT JOIN public.appointments ap ON ap.id = a.appointment_id
         WHERE a.alert_kind='arrival' AND ap.id IS NULL) AS n;
-- Expected: 0


-- ────────────────────────────────────────────────────────────────────────────
-- 06 · UI contract: status que mostram botoes
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'ui_contract' AS check_id, jsonb_build_object(
  'mark_arrived_visible_for', ARRAY['agendado','aguardando_confirmacao','confirmado','aguardando'],
  'start_attendance_visible_for', ARRAY['na_clinica'],
  'finalize_visible_for', ARRAY['na_clinica','em_atendimento'],
  'hidden_for_terminal', ARRAY['finalizado','cancelado','no_show']
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 99 · Final flags
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_flags_2h' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'attend_fn_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend'),
  'change_status_fn_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_change_status'),
  'arrival_alert_fn_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert'),
  'na_clinica_em_atendimento_allowed', public._appointment_status_transition_allowed('na_clinica','em_atendimento'),
  'cancelado_blocked_to_na_clinica', NOT public._appointment_status_transition_allowed('cancelado','na_clinica'),
  'finalizado_blocked_to_em_atendimento', NOT public._appointment_status_transition_allowed('finalizado','em_atendimento'),
  'duplicate_arrival_alert_count', (SELECT count(*) FROM (SELECT appointment_id, target_role, count(*) c FROM public.appointment_internal_alerts WHERE alert_kind='arrival' GROUP BY appointment_id, target_role HAVING count(*)>1) s),
  'orphan_arrival_alert_count', (SELECT count(*) FROM public.appointment_internal_alerts a LEFT JOIN public.appointments ap ON ap.id=a.appointment_id WHERE a.alert_kind='arrival' AND ap.id IS NULL),
  'invalid_status_rows', (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_change_status')
    AND public._appointment_status_transition_allowed('na_clinica','em_atendimento')
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
  )
) AS data;
