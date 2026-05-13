-- =============================================================================
-- CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_WIRE · VALIDATION (READ-ONLY)
-- =============================================================================
-- Mig 183 já aplicada (tracker_183 registrado). Esta validation confirma:
--   - estrutura permanece intacta (17 colunas · RLS · 4 policies · 4 FKs · 5 CHECKs);
--   - zero upload real (rows ainda = 0 após wire);
--   - bucket `media` continua privado · 35 storage policies intactas;
--   - anon ainda sem acesso;
--   - hard gate clínico intacto.
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


-- 01 STRUCTURE INTACT ───────────────────────────────────────────────────────
SELECT 'structure' AS check_id, jsonb_build_object(
  'columns_count', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments'),
  'policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
  'fk_count', (SELECT count(*) FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid WHERE src.relname='medical_record_attachments' AND c.contype='f'),
  'check_count', (SELECT count(*) FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid WHERE src.relname='medical_record_attachments' AND c.contype='c'),
  'index_count', (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='medical_record_attachments'),
  'trigger_updated_at', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_mra_set_updated_at'),
  'has_clinic_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='clinic_id'),
  'has_storage_path', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='storage_path'),
  'has_deleted_at', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='deleted_at'),
  'patient_id_nullable', (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='patient_id')
) AS data;


-- 02 GRANTS · anon zerado ───────────────────────────────────────────────────
SELECT 'grants' AS check_id, jsonb_build_object(
  'anon_grants', (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='anon'),
  'authenticated_grants', (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='authenticated'),
  'service_role_grants', (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='service_role')
) AS data;


-- 03 DATA SANITY (zero upload real esperado) ────────────────────────────────
SELECT 'data_sanity' AS check_id, jsonb_build_object(
  'rows_total', (SELECT count(*) FROM public.medical_record_attachments),
  'rows_active', (SELECT count(*) FROM public.medical_record_attachments WHERE deleted_at IS NULL),
  'rows_deleted', (SELECT count(*) FROM public.medical_record_attachments WHERE deleted_at IS NOT NULL)
) AS data;


-- 04 STORAGE · bucket media intocado ────────────────────────────────────────
SELECT 'storage_media' AS check_id, jsonb_build_object(
  'private', (SELECT NOT public FROM storage.buckets WHERE id='media'),
  'tenant_policies_intact', (
    SELECT count(*) FROM pg_policy
    WHERE polrelid='storage.objects'::regclass
      AND polname IN (
        'Clinics can only read their own media',
        'Clinics can only update their own media',
        'Clinics can only delete their own media',
        'Clinics can only upload to their own folder'
      )
  ),
  'total_storage_policies', (SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass)
) AS data;


-- 05 HARD GATE UNTOUCHED ────────────────────────────────────────────────────
SELECT 'hard_gate' AS check_id, jsonb_build_object(
  'appointment_finalize', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'appointment_clinical_gate_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'appointment_anamnesis_upsert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert'),
  'appointment_anamnesis_mark_complete', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete'),
  'complete_anamnesis_form', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
) AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_media_vault_wire' AS check_id, jsonb_build_object(
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
  'medical_record_attachments_has_tenant_guard', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='clinic_id'),
  'medical_record_attachments_has_storage_path', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='storage_path'),
  'medical_record_attachments_deleted_at_soft_delete_ready', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='deleted_at'),
  'storage_media_private', (SELECT NOT public FROM storage.buckets WHERE id='media'),
  'storage_policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass),
  'documents_rows_total', (SELECT count(*) FROM public.medical_record_attachments),
  'documents_active_rows', (SELECT count(*) FROM public.medical_record_attachments WHERE deleted_at IS NULL),
  'documents_deleted_rows', (SELECT count(*) FROM public.medical_record_attachments WHERE deleted_at IS NOT NULL),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass) >= 4
    AND (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='anon') = 0
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='clinic_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='storage_path')
    AND (SELECT NOT public FROM storage.buckets WHERE id='media')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  )
) AS data;
