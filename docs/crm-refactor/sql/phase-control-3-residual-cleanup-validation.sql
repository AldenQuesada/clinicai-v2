-- ============================================================================
-- CRM_PHASE_CONTROL.3 · RESIDUAL CLEANUP VALIDATION (READ-ONLY)
-- Trilha A · audit-only · zero migration · zero alteração de banco
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


-- 01 ALEXA LEGACY · INVENTÁRIO ──────────────────────────────────────────────
SELECT 'alexa_legacy_inventory' AS check_id, jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(table_name ORDER BY table_name)
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name ILIKE '%alexa%'
  ),
  'functions', (
    SELECT jsonb_agg(p.proname ORDER BY p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname ILIKE '%alexa%'
  ),
  'columns_in_other_tables', (
    SELECT jsonb_agg(table_name || '.' || column_name ORDER BY table_name)
    FROM information_schema.columns
    WHERE table_schema='public' AND column_name ILIKE '%alexa%' AND table_name NOT ILIKE '%alexa%'
  ),
  'authenticated_execute_grants', (
    SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND routine_name ILIKE '%alexa%' AND grantee = 'authenticated'
  ),
  'anon_execute_grants', (
    SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND routine_name ILIKE '%alexa%' AND grantee = 'anon'
  ),
  'rows', jsonb_build_object(
    'clinic_alexa_config', (SELECT count(*) FROM public.clinic_alexa_config),
    'clinic_alexa_devices', (SELECT count(*) FROM public.clinic_alexa_devices),
    'clinic_alexa_log', (SELECT count(*) FROM public.clinic_alexa_log)
  )
) AS data;


-- 02 APPOINTMENTS WITHOUT PROFESSIONAL_ID ──────────────────────────────────
SELECT 'appointments_without_professional' AS check_id, jsonb_build_object(
  'count_total', (SELECT count(*) FROM public.appointments WHERE professional_id IS NULL AND deleted_at IS NULL),
  'by_status', (
    SELECT jsonb_object_agg(status, n) FROM (
      SELECT status, count(*) AS n FROM public.appointments
      WHERE professional_id IS NULL AND deleted_at IS NULL GROUP BY status
    ) s
  ),
  'sample', (
    SELECT jsonb_agg(jsonb_build_object('id', id, 'date', scheduled_date, 'status', status, 'procedure', procedure_name) ORDER BY scheduled_date DESC)
    FROM (SELECT id, scheduled_date, status, procedure_name FROM public.appointments WHERE professional_id IS NULL AND deleted_at IS NULL ORDER BY scheduled_date DESC LIMIT 10) s
  )
) AS data;


-- 03 ZUMBIS · RUNTIME (dados ativos e funções) ──────────────────────────────
SELECT 'zombie_status_runtime' AS check_id, jsonb_build_object(
  'compareceu_in_appointments', (SELECT count(*) FROM public.appointments WHERE status='compareceu'),
  'pre_consulta_in_appointments', (SELECT count(*) FROM public.appointments WHERE status='pre_consulta'),
  'em_consulta_in_appointments', (SELECT count(*) FROM public.appointments WHERE status='em_consulta'),
  'attending_in_appointments', (SELECT count(*) FROM public.appointments WHERE status='attending'),
  'converted_in_appointments', (SELECT count(*) FROM public.appointments WHERE status='converted'),
  'perdido_in_leads_phase', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'zombie_functions_in_public', (
    SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (
      p.proname ILIKE '%compareceu%' OR
      p.proname ILIKE '%pre_consulta%' OR
      p.proname ILIKE '%em_consulta%' OR
      p.proname ILIKE '%attending%' OR
      p.proname ILIKE '%converted%'
    )
  )
) AS data;


-- 04 HARD GATE UNTOUCHED ────────────────────────────────────────────────────
SELECT 'hard_gate' AS check_id, jsonb_build_object(
  'appointment_finalize', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'appointment_clinical_gate_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'appointment_anamnesis_upsert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert'),
  'appointment_anamnesis_mark_complete', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete'),
  'complete_anamnesis_form', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
) AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_control3' AS check_id, jsonb_build_object(
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
  'alexa_legacy_objects_count', (
    (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%alexa%')
    + (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname ILIKE '%alexa%')
  ),
  'alexa_authenticated_execute_grants', (
    SELECT count(*) FROM information_schema.routine_privileges
    WHERE routine_schema='public' AND routine_name ILIKE '%alexa%' AND grantee = 'authenticated'
  ),
  'appointments_without_professional_count', (
    SELECT count(*) FROM public.appointments WHERE professional_id IS NULL AND deleted_at IS NULL
  ),
  'zumbi_function_count', (
    SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (
      p.proname ILIKE '%compareceu%' OR p.proname ILIKE '%pre_consulta%' OR
      p.proname ILIKE '%em_consulta%' OR p.proname ILIKE '%attending%' OR
      p.proname ILIKE '%converted%'
    )
  ),
  'runtime_zombie_refs_expected_zero', (
    (SELECT count(*) FROM public.appointments WHERE status IN ('compareceu','pre_consulta','em_consulta','attending','converted'))
    + (SELECT count(*) FROM public.leads WHERE phase='perdido')
  ),
  'audit_only', true,
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
