-- =============================================================================
-- CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX · VALIDATION (READ-ONLY)
-- =============================================================================
-- Migration 184 está LOCAL e NÃO foi aplicada. Pré-apply esperado:
--   current_policies_use_professional = true
--   current_policies_use_therapist    = false
-- Pós-apply (após CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX_APPLY):
--   current_policies_use_professional = false
--   current_policies_use_therapist    = true
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


-- 01 POLICY NAMING STATE ────────────────────────────────────────────────────
-- Detecta se policies referenciam o literal antigo ou o novo.
SELECT 'mra_policy_naming' AS check_id, jsonb_build_object(
  'count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
  'with_professional', (
    SELECT count(*) FROM pg_policy
    WHERE polrelid='public.medical_record_attachments'::regclass
      AND (
        pg_get_expr(polqual, polrelid) ILIKE '%''professional''%'
        OR pg_get_expr(polwithcheck, polrelid) ILIKE '%''professional''%'
      )
  ),
  'with_therapist', (
    SELECT count(*) FROM pg_policy
    WHERE polrelid='public.medical_record_attachments'::regclass
      AND (
        pg_get_expr(polqual, polrelid) ILIKE '%''therapist''%'
        OR pg_get_expr(polwithcheck, polrelid) ILIKE '%''therapist''%'
      )
  )
) AS data;


-- 02 STRUCTURE INTACT (mig 183 sem alteração) ──────────────────────────────
SELECT 'structure_intact' AS check_id, jsonb_build_object(
  'columns_count', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments'),
  'fk_count', (SELECT count(*) FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid WHERE src.relname='medical_record_attachments' AND c.contype='f'),
  'check_count', (SELECT count(*) FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid WHERE src.relname='medical_record_attachments' AND c.contype='c'),
  'index_count', (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='medical_record_attachments'),
  'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE relname='medical_record_attachments'),
  'anon_grants', (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='anon'),
  'has_clinic_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='clinic_id'),
  'has_storage_path', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='storage_path'),
  'has_deleted_at', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='deleted_at')
) AS data;


-- 03 STORAGE INTACT ─────────────────────────────────────────────────────────
SELECT 'storage_intact' AS check_id, jsonb_build_object(
  'media_private', (SELECT NOT public FROM storage.buckets WHERE id='media'),
  'total_storage_policies', (SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass)
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
SELECT 'final_flags_policy_fix' AS check_id, jsonb_build_object(
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
  'medical_record_attachments_policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
  'medical_record_attachments_anon_grants', (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='anon'),
  'current_policies_use_professional', (
    SELECT count(*) > 0 FROM pg_policy
    WHERE polrelid='public.medical_record_attachments'::regclass
      AND (
        pg_get_expr(polqual, polrelid) ILIKE '%''professional''%'
        OR pg_get_expr(polwithcheck, polrelid) ILIKE '%''professional''%'
      )
  ),
  'current_policies_use_therapist', (
    SELECT count(*) > 0 FROM pg_policy
    WHERE polrelid='public.medical_record_attachments'::regclass
      AND (
        pg_get_expr(polqual, polrelid) ILIKE '%''therapist''%'
        OR pg_get_expr(polwithcheck, polrelid) ILIKE '%''therapist''%'
      )
  ),
  'storage_media_private', (SELECT NOT public FROM storage.buckets WHERE id='media'),
  'storage_policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass),
  'migration_184_created_not_applied', NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000184'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass) = 4
    AND (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='anon') = 0
    AND (SELECT NOT public FROM storage.buckets WHERE id='media')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  )
) AS data;
