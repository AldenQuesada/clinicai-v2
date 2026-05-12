-- ============================================================================
-- CRM_PHASE_2ALEXA.1 · VALIDATION (READ-ONLY)
-- ============================================================================

-- 00 SAFETY ──────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_object_agg(jobid, jsonb_build_object('active', active, 'name', jobname)) AS data
FROM cron.job WHERE jobid IN (12,71,72,89,90,91,92,93,94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

SELECT 'wa_outbox_safety' AS check_id, jsonb_build_object(
  'queued',  (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe',  (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;

SELECT 'cron_with_provider_call' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%';


-- 01 ALERT CONTRACT ──────────────────────────────────────────────────────────
SELECT 'internal_alerts_table' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts') AS data;

SELECT 'internal_alerts_columns' AS check_id, jsonb_build_object(
  'has_alert_kind', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointment_internal_alerts' AND column_name='alert_kind'),
  'has_target_role', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointment_internal_alerts' AND column_name='target_role'),
  'has_payload', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointment_internal_alerts' AND column_name='payload'),
  'has_appointment_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointment_internal_alerts' AND column_name='appointment_id'),
  'has_is_read', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointment_internal_alerts' AND column_name='is_read')
) AS data;

SELECT 'arrival_path_rpcs' AS check_id, jsonb_build_object(
  'appointment_arrival_internal_alert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert'),
  'appointment_internal_alert_mark_read', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_mark_read'),
  'appointment_attend', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
) AS data;

SELECT 'internal_alerts_total' AS check_id, count(*) AS n FROM public.appointment_internal_alerts;

SELECT 'internal_alerts_by_kind' AS check_id, jsonb_object_agg(alert_kind, n) AS data
FROM (SELECT alert_kind, count(*) AS n FROM public.appointment_internal_alerts GROUP BY alert_kind) s;

SELECT 'arrival_unread_count' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts WHERE alert_kind='arrival' AND is_read=false;

SELECT 'unread_alerts_total' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts WHERE is_read=false;


-- 02 APPOINTMENT CONTRACT ────────────────────────────────────────────────────
SELECT 'na_clinica_status_valid' AS check_id, EXISTS (
  SELECT 1 FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  WHERE c.contype = 'c' AND r.relname = 'appointments'
    AND pg_get_constraintdef(c.oid) ILIKE '%na_clinica%'
) AS data;

SELECT 'em_atendimento_status_valid' AS check_id, EXISTS (
  SELECT 1 FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  WHERE c.contype = 'c' AND r.relname = 'appointments'
    AND pg_get_constraintdef(c.oid) ILIKE '%em_atendimento%'
) AS data;

SELECT 'invalid_appointment_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');


-- 03 PROVIDER SAFETY ────────────────────────────────────────────────────────
SELECT 'alexa_authenticated_grants' AS check_id, count(*) AS n
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name ILIKE '%alexa%'
  AND grantee='authenticated' AND privilege_type='EXECUTE';
-- Esperado: 0 (CONTROL.2 revogou)

SELECT 'alexa_rpcs_remaining' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname ILIKE '%alexa%';
-- Esperado: 2 (get_alexa_config + upsert_alexa_config)


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_2alexa1' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'alert_contract_ready', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts'),
  'arrival_path_ready', (
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_mark_read')
  ),
  'appointment_attend_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend'),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL
      AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')
  ),
  'cron_with_provider_call', (
    SELECT count(*) FROM cron.job
    WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'
  ),
  'alexa_authenticated_grants', (
    SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND routine_name ILIKE '%alexa%'
      AND grantee='authenticated' AND privilege_type='EXECUTE'
  ),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL
         AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
  )
) AS data;
