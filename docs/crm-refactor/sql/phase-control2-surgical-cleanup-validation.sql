-- ============================================================================
-- CRM_PHASE_CONTROL.2 · VALIDATION (READ-ONLY)
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


-- 01 ZOMBIE FUNCTIONS BEFORE/AFTER ──────────────────────────────────────────
SELECT 'zumbi_function_count' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.prosrc ILIKE '%em_consulta%' OR p.prosrc ILIKE '%pre_consulta%'
       OR p.prosrc ILIKE '%compareceu%' OR p.prosrc ILIKE '%reagendado%');
-- Expected: 15 (era 18 · -3 orphan triggers dropados em mig 178)

SELECT 'orphan_trigger_functions_dropped' AS check_id, jsonb_build_object(
  '_b2b_trigger_voucher_attended', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_b2b_trigger_voucher_attended'),
  '_trg_agenda_alert_on_status_change', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_trg_agenda_alert_on_status_change'),
  '_vpi_appt_revert_on_cancel', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_vpi_appt_revert_on_cancel')
) AS data;
-- Expected: all false


-- 02 ALEXA RPCS BEFORE/AFTER ────────────────────────────────────────────────
SELECT 'alexa_rpc_count' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname ILIKE '%alexa%';
-- Expected: 2 (era 9 · -7 broken dropados em mig 179)

SELECT 'alexa_broken_dropped' AS check_id, jsonb_build_object(
  'alexa_log_announce', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alexa_log_announce'),
  'alexa_log_update', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alexa_log_update'),
  'alexa_metrics', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alexa_metrics'),
  'alexa_pending_queue', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alexa_pending_queue'),
  'delete_alexa_device', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_alexa_device'),
  'get_alexa_devices', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_alexa_devices'),
  'upsert_alexa_device', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_alexa_device')
) AS data;
-- Expected: all false

SELECT 'alexa_config_rpcs_present' AS check_id, jsonb_build_object(
  'get_alexa_config', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_alexa_config'),
  'upsert_alexa_config', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_alexa_config')
) AS data;
-- Expected: both true (preserved · só REVOKE)

SELECT 'alexa_authenticated_grants_count' AS check_id, count(*) AS n
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name ILIKE '%alexa%'
  AND grantee='authenticated' AND privilege_type='EXECUTE';
-- Expected: 0

SELECT 'alexa_service_role_grants_count' AS check_id, count(*) AS n
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name ILIKE '%alexa%'
  AND grantee='service_role' AND privilege_type='EXECUTE';
-- Expected: 2 (get_alexa_config + upsert_alexa_config preserved for emergency)


-- 03 APPOINTMENTS PROFESSIONAL DEBT ─────────────────────────────────────────
SELECT 'appointments_without_professional' AS check_id, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL AND professional_id IS NULL;

SELECT 'appointments_invalid_professional' AS check_id, count(*) AS n
FROM public.appointments a WHERE a.deleted_at IS NULL
  AND a.professional_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id);


-- 04 PERDIDO CONTRACT ───────────────────────────────────────────────────────
SELECT 'phase_perdido_count' AS check_id, count(*) AS n FROM public.leads WHERE phase='perdido';
-- Expected: 0

SELECT 'lifecycle_perdido_count' AS check_id, count(*) AS n FROM public.leads WHERE lifecycle_status='perdido';

SELECT 'perdidos_mirror_count' AS check_id, count(*) AS n FROM public.perdidos WHERE deleted_at IS NULL;

SELECT 'lead_lost_rpc_exists' AS check_id,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost') AS data;


-- 05 CORE CONTRACTS ──────────────────────────────────────────────────────────
SELECT 'core_contracts' AS check_id, jsonb_build_object(
  'appointment_attend', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend'),
  'appointment_finalize', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'appointment_change_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_change_status'),
  'lead_lost', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost'),
  'lead_recover', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_recover'),
  'appointment_clinical_gate_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'commercial_recovery_workflow_view', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view'),
  'crm_operational_view', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view'),
  '_agenda_alert_min_before_tick', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_min_before_tick'),
  '_b2b_attribution_convert_on_voucher_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_b2b_attribution_convert_on_voucher_status'),
  'appointment_arrival_internal_alert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert')
) AS data;
-- Expected: all true


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_control2' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'cron_with_provider_call', (
    SELECT count(*) FROM cron.job
    WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'
  ),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL
      AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')
  ),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'invalid_professional_count', (
    SELECT count(*) FROM public.appointments a WHERE a.deleted_at IS NULL
      AND a.professional_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id)
  ),
  'appointments_without_professional_count', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND professional_id IS NULL),
  'zumbi_function_count_after_cleanup', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (p.prosrc ILIKE '%em_consulta%' OR p.prosrc ILIKE '%pre_consulta%'
           OR p.prosrc ILIKE '%compareceu%' OR p.prosrc ILIKE '%reagendado%')
  ),
  'alexa_rpcs_after_cleanup', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname ILIKE '%alexa%'
  ),
  'alexa_executable_grants_after_cleanup', (
    SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND routine_name ILIKE '%alexa%'
      AND grantee='authenticated' AND privilege_type='EXECUTE'
  ),
  'tracker_178', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000178'),
  'tracker_179', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000179'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL
         AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('_b2b_trigger_voucher_attended','_trg_agenda_alert_on_status_change','_vpi_appt_revert_on_cancel')) = 0
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_b2b_attribution_convert_on_voucher_status')
  )
) AS data;
