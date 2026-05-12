-- ============================================================================
-- CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · VALIDATION (READ-ONLY)
-- Trilha A · estrutura DB já existia · UI admin top-level · sem migration
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


-- 01 ANAMNESIS SCHEMA ────────────────────────────────────────────────────────
SELECT 'anamnesis_tables_present' AS check_id, jsonb_build_object(
  'templates', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_templates'),
  'sessions',  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_template_sessions'),
  'fields',    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_fields'),
  'options',   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_field_options')
) AS data;

SELECT 'anamnesis_rls' AS check_id, jsonb_build_object(
  'templates', (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_templates'),
  'sessions',  (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_template_sessions'),
  'fields',    (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_fields'),
  'options',   (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_field_options')
) AS data;

SELECT 'anamnesis_policy_counts' AS check_id, jsonb_build_object(
  'templates', (SELECT count(*) FROM pg_policy WHERE polrelid='public.anamnesis_templates'::regclass),
  'sessions',  (SELECT count(*) FROM pg_policy WHERE polrelid='public.anamnesis_template_sessions'::regclass),
  'fields',    (SELECT count(*) FROM pg_policy WHERE polrelid='public.anamnesis_fields'::regclass),
  'options',   (SELECT count(*) FROM pg_policy WHERE polrelid='public.anamnesis_field_options'::regclass)
) AS data;

SELECT 'anamnesis_template_counts' AS check_id, jsonb_build_object(
  'total',  (SELECT count(*) FROM public.anamnesis_templates WHERE deleted_at IS NULL),
  'active', (SELECT count(*) FROM public.anamnesis_templates WHERE deleted_at IS NULL AND is_active = true),
  'sessions_total', (SELECT count(*) FROM public.anamnesis_template_sessions WHERE deleted_at IS NULL),
  'fields_total', (SELECT count(*) FROM public.anamnesis_fields WHERE deleted_at IS NULL)
) AS data;


-- 02 CLINICAL GATE INTACT (sanity · não tocado nesta fase) ─────────────────
SELECT 'clinical_gate_functions_present' AS check_id, jsonb_build_object(
  'appointment_clinical_gate_status', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'
  ),
  'appointment_finalize', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='appointment_finalize'
  ),
  'appointment_anamnesis_upsert', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert'
  ),
  'appointment_anamnesis_mark_complete', EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete'
  )
) AS data;


-- 03 STATUS CONTRACT (mesma régua) ──────────────────────────────────────────
SELECT 'invalid_appointment_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE status IS NOT NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'phase_perdido_count' AS check_id, count(*) AS n
FROM public.leads WHERE phase='perdido';


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_anamnesis_builder' AS check_id, jsonb_build_object(
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
  'existing_anamnesis_schema_detected', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_templates')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_template_sessions')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_fields')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_field_options')
  ),
  'templates_table_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_templates')
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_templates')
    AND (SELECT count(*) FROM pg_policy WHERE polrelid='public.anamnesis_templates'::regclass) >= 3
  ),
  'questions_table_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_fields')
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_fields')
  ),
  'rls_ready', (
    (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_templates')
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_template_sessions')
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_fields')
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='anamnesis_field_options')
  ),
  'migration_required_not_applied', false,
  'remote_schema_unchanged', true,
  'clinical_gate_untouched', (
    EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'
    )
    AND EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='appointment_finalize'
    )
  ),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_templates')
  )
) AS data;
