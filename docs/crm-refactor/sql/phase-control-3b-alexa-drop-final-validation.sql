-- =============================================================================
-- CRM_PHASE_CONTROL.3B · Alexa drop final · VALIDATION (READ-ONLY · PRE-APPLY)
-- =============================================================================
-- Migration está LOCAL e NÃO foi aplicada. Esta validation confirma que o
-- remoto ainda contém os objetos candidatos · isso é esperado nesta fase.
-- Após CRM_PHASE_CONTROL.3B_APPLY, rerodar e os flags `*_exists_remote`
-- devem ficar false.
-- =============================================================================

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


-- 01 CANDIDATE OBJECTS · STILL EXIST REMOTELY (expected pre-apply) ──────────
SELECT 'clinic_alexa_log_state' AS check_id, jsonb_build_object(
  'exists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_alexa_log'),
  'rows', (SELECT count(*) FROM public.clinic_alexa_log),
  'policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.clinic_alexa_log'::regclass)
) AS data;

SELECT 'alexa_functions_state' AS check_id, jsonb_build_object(
  'get_alexa_config_exists', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_alexa_config'
  ),
  'upsert_alexa_config_exists', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='upsert_alexa_config'
  )
) AS data;

SELECT 'alexa_grants_unsafe' AS check_id, count(*) AS n
FROM information_schema.routine_privileges
WHERE routine_schema='public'
  AND routine_name ILIKE '%alexa%'
  AND grantee IN ('authenticated','anon','PUBLIC');
-- Expected: 0 (CONTROL.2 já tratou)


-- 02 PRESERVED OBJECTS · STILL ALIVE ────────────────────────────────────────
SELECT 'preserved_alexa_data' AS check_id, jsonb_build_object(
  'clinic_alexa_config_rows', (SELECT count(*) FROM public.clinic_alexa_config),
  'clinic_alexa_devices_rows', (SELECT count(*) FROM public.clinic_alexa_devices),
  'clinic_rooms_has_alexa_device_name', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_rooms' AND column_name='alexa_device_name'),
  'wa_agenda_automations_has_alexa_message', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_agenda_automations' AND column_name='alexa_message'),
  'wa_agenda_automations_has_alexa_target', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_agenda_automations' AND column_name='alexa_target')
) AS data;


-- 03 HARD GATE UNTOUCHED ────────────────────────────────────────────────────
SELECT 'hard_gate' AS check_id, jsonb_build_object(
  'appointment_finalize', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'appointment_clinical_gate_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'appointment_anamnesis_upsert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert'),
  'appointment_anamnesis_mark_complete', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete'),
  'complete_anamnesis_form', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
) AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_control3b' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments
    WHERE status IS NOT NULL
      AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')
  ),
  'cron_with_provider_call', (
    SELECT count(*) FROM cron.job
    WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'
  ),
  'hard_gate_untouched', (
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
  ),
  'clinic_alexa_log_exists_remote', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_alexa_log'),
  'clinic_alexa_log_rows', (SELECT count(*) FROM public.clinic_alexa_log),
  'get_alexa_config_exists_remote', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_alexa_config'),
  'upsert_alexa_config_exists_remote', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_alexa_config'),
  'alexa_authenticated_execute_grants', (
    SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND routine_name ILIKE '%alexa%' AND grantee = 'authenticated'
  ),
  'alexa_runtime_refs_expected_zero', (
    (SELECT count(*) FROM cron.job WHERE command ILIKE '%get_alexa_config%' OR command ILIKE '%upsert_alexa_config%' OR command ILIKE '%clinic_alexa_log%')
  ),
  'kept_alexa_tables_with_data_count', (
    (SELECT count(*) FROM public.clinic_alexa_config) + (SELECT count(*) FROM public.clinic_alexa_devices)
  ),
  'migration_created_not_applied', true,
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND (
      SELECT count(*) FROM information_schema.routine_privileges
      WHERE routine_schema='public' AND routine_name ILIKE '%alexa%' AND grantee = 'authenticated'
    ) = 0
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  )
) AS data;
