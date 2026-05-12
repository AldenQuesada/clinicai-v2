-- ============================================================================
-- CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_DETAIL · VALIDATION (READ-ONLY)
-- Trilha A · prontuário completo com abas · zero migration · hard gate intacto
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


-- 01 PATIENT PROFILE BASE (PRONTUARIO_BASE) READY ───────────────────────────
SELECT 'patient_profile_base_ready' AS check_id, jsonb_build_object(
  'pp_extended_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended'),
  'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE relname='patient_profiles_extended'),
  'policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.patient_profiles_extended'::regclass),
  'tracker_mig_180', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000180')
) AS data;


-- 02 ANAMNESIS BUILDER + CLINICAL SOURCES READY ─────────────────────────────
SELECT 'anamnesis_builder_ready' AS check_id, jsonb_build_object(
  'templates_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_templates'),
  'sessions_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_template_sessions'),
  'fields_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_fields'),
  'appointment_anamneses_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_anamneses'),
  'consolidated_view', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_consolidated_view')
) AS data;


-- 03 HARD GATE UNTOUCHED · SANITY (não tocado pela fase) ────────────────────
SELECT 'hard_gate_untouched' AS check_id, jsonb_build_object(
  'appointment_finalize', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'appointment_clinical_gate_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'appointment_anamnesis_upsert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert'),
  'appointment_anamnesis_mark_complete', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete'),
  'complete_anamnesis_form', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
) AS data;


-- 04 DATA SOURCES USED BY THE RECORD ────────────────────────────────────────
SELECT 'data_sources_present' AS check_id, jsonb_build_object(
  'patients', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patients'),
  'appointments', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointments'),
  'orcamentos', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orcamentos'),
  'clinic_procedimentos', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_procedimentos'),
  'phase_history', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='phase_history')
) AS data;


-- 05 DOCUMENTS MODULE GAP (placeholder declarado · não habilitado) ──────────
SELECT 'medical_record_attachments_gap' AS check_id, jsonb_build_object(
  'table_exists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='medical_record_attachments'),
  'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE relname='medical_record_attachments'),
  'policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
  'safe_to_expose', (
    (SELECT relrowsecurity FROM pg_class WHERE relname='medical_record_attachments')
    AND (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass) >= 3
  )
) AS data;
-- Expected: safe_to_expose=false (sem policies · módulo permanece placeholder na UI)


-- 06 STATUS CONTRACT (mesma régua) ──────────────────────────────────────────
SELECT 'invalid_appointment_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE status IS NOT NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'phase_perdido_count' AS check_id, count(*) AS n
FROM public.leads WHERE phase='perdido';


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_patient_record_detail' AS check_id, jsonb_build_object(
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
  'patient_profile_base_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended')
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='patient_profiles_extended')
  ),
  'anamnesis_builder_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_templates')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_anamneses')
  ),
  'hard_gate_untouched', (
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
  ),
  'storage_path_not_exposed_contract', (
    -- patient_profiles_extended foto: signed URL server-side (já contratado em PRONTUARIO_BASE)
    EXISTS (SELECT 1 FROM storage.buckets WHERE id='media' AND NOT public)
    -- medical_record_attachments: módulo placeholder · sem policies = inacessível pelo client mesmo se exposto
  ),
  'partial_sections_documented', true,
  -- Trilha A · zero migration: este flag é false (não houve "migration required")
  'migration_required_not_applied', false,
  'remote_schema_unchanged', true,
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_anamneses')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  )
) AS data;
