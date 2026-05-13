-- =============================================================================
-- CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT · VALIDATION (READ-ONLY · PRE-APPLY)
-- =============================================================================
-- Migration 183 está local e NÃO foi aplicada. Os flags `*_remote` ainda
-- refletem o schema mínimo da tabela. Após APPLY, rerodar e os flags devem
-- inverter (policies > 0, tenant guard, etc.).
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


-- 01 medical_record_attachments · pre-apply state ────────────────────────────
SELECT 'mra_pre_apply' AS check_id, jsonb_build_object(
  'exists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='medical_record_attachments'),
  'rows', (SELECT count(*) FROM public.medical_record_attachments),
  'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE relname='medical_record_attachments'),
  'policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
  'has_clinic_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='clinic_id'),
  'has_patient_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='patient_id'),
  'has_appointment_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='appointment_id'),
  'has_storage_path', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='storage_path'),
  'has_file_name', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='file_name'),
  'has_mime_type', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='mime_type'),
  'has_size_bytes', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='size_bytes'),
  'has_visibility', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='visibility'),
  'has_deleted_at', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='deleted_at'),
  'fk_to_clinics', EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid JOIN pg_class dst ON dst.oid=c.confrelid
    WHERE src.relname='medical_record_attachments' AND c.contype='f' AND dst.relname='clinics'
  ),
  'fk_to_patients', EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid JOIN pg_class dst ON dst.oid=c.confrelid
    WHERE src.relname='medical_record_attachments' AND c.contype='f' AND dst.relname='patients'
  ),
  'has_tenant_guard', (
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='clinic_id')
    AND EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid JOIN pg_class dst ON dst.oid=c.confrelid WHERE src.relname='medical_record_attachments' AND c.contype='f' AND dst.relname='clinics')
  )
) AS data;


-- 02 STORAGE BUCKET media · pre-apply ───────────────────────────────────────
SELECT 'storage_media_state' AS check_id, jsonb_build_object(
  'exists', EXISTS (SELECT 1 FROM storage.buckets WHERE id='media'),
  'private', (SELECT NOT public FROM storage.buckets WHERE id='media'),
  'tenant_aware_policy_count', (
    SELECT count(*) FROM pg_policy
    WHERE polrelid='storage.objects'::regclass
      AND polname IN (
        'Clinics can only read their own media',
        'Clinics can only update their own media',
        'Clinics can only delete their own media',
        'Clinics can only upload to their own folder'
      )
  )
) AS data;


-- 03 AUTH HELPERS · pre-condições para policies da mig 183 ──────────────────
SELECT 'auth_helpers' AS check_id, jsonb_build_object(
  'app_clinic_id_present', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='app_clinic_id'),
  'app_role_present', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='app_role')
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
SELECT 'final_flags_media_vault' AS check_id, jsonb_build_object(
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
  'medical_record_attachments_exists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='medical_record_attachments'),
  'medical_record_attachments_rows', (SELECT count(*) FROM public.medical_record_attachments),
  'medical_record_attachments_rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE relname='medical_record_attachments'),
  'medical_record_attachments_policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
  'medical_record_attachments_has_tenant_guard', (
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='clinic_id')
  ),
  'medical_record_attachments_has_patient_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='patient_id'),
  'medical_record_attachments_has_storage_path', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='storage_path'),
  'storage_private_bucket_ready', EXISTS (SELECT 1 FROM storage.buckets WHERE id='media' AND NOT public),
  'auth_helpers_ready', (
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='app_clinic_id')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='app_role')
  ),
  'media_vault_migration_created_not_applied', true,
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='medical_record_attachments')
    AND EXISTS (SELECT 1 FROM storage.buckets WHERE id='media' AND NOT public)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='app_clinic_id')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='app_role')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  )
) AS data;
