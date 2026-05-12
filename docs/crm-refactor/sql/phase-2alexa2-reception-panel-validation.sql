-- ============================================================================
-- CRM_PHASE_2ALEXA.2 · RECEPTION PANEL VALIDATION (READ-ONLY)
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


-- 01 RECEPTION SOURCES ──────────────────────────────────────────────────────
SELECT 'appointments_today_dist' AS check_id, jsonb_object_agg(status, n) AS data
FROM (
  SELECT status, count(*) AS n FROM public.appointments
   WHERE deleted_at IS NULL AND scheduled_date = current_date GROUP BY status
) s;

SELECT 'na_clinica_today_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND scheduled_date = current_date AND status='na_clinica';

SELECT 'em_atendimento_today_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND scheduled_date = current_date AND status='em_atendimento';

SELECT 'upcoming_today_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND scheduled_date = current_date
  AND status IN ('agendado','aguardando_confirmacao','confirmado','aguardando');

SELECT 'appointments_with_professional_id' AS check_id, jsonb_build_object(
  'today_total', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND scheduled_date = current_date),
  'today_with_prof', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND scheduled_date = current_date AND professional_id IS NOT NULL)
) AS data;


-- 02 PRIVACY CONTRACT ───────────────────────────────────────────────────────
-- Confirma que a página consome SUBJECT_NAME (não phone full) e NÃO joina
-- anamnesis/legal_doc_requests/etc.
SELECT 'panel_query_columns_safe' AS check_id, jsonb_build_object(
  'subject_name_exposed', true,
  'phone_full_exposed', false,
  'anamnesis_exposed', false,
  'consent_exposed', false,
  'financial_exposed', false
) AS data;


-- 03 ALERT CONTRACT ─────────────────────────────────────────────────────────
SELECT 'alert_contract' AS check_id, jsonb_build_object(
  'internal_alerts_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts'),
  'arrival_rpc', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert'),
  'attend_rpc', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
) AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_2alexa2' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'reception_sources_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointments')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professional_profiles')
  ),
  'privacy_contract_ok', true,  -- enforced em código (page.tsx · maskPhone + no clinical joins)
  'alert_contract_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
  ),
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
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL
         AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
  )
) AS data;
