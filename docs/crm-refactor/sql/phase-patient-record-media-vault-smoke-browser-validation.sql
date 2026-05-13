-- =============================================================================
-- CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_SMOKE_BROWSER · VALIDATION (READ-ONLY)
-- =============================================================================
-- Validation pode rodar em 3 momentos:
--   PRE-SUBMIT: confirma sistema pronto + baseline_outbox + 0 objetos em
--               medical-records (estado clean para o smoke).
--   AFTER-UPLOAD: depois do click "Anexar documento" via UI · cole o
--                 `attachment_id` retornado em <ATTACHMENT_ID> nas queries
--                 02b e rode-as.
--   AFTER-SOFT-DELETE: depois do click "Remover" · re-rode 02b para confirmar
--                      `deleted_at` populated + objeto físico ainda existe.
--
-- ZERO WRITE. ZERO efeito colateral.
-- =============================================================================

-- 00 SAFETY · sempre verde ───────────────────────────────────────────────────
SELECT 'safety' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'invalid_appointment_status_count', (SELECT count(*) FROM public.appointments WHERE status IS NOT NULL AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')),
  'cron_with_provider_call', (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'),
  'baseline_outbox', (SELECT count(*) FROM public.wa_outbox)
) AS data;


-- 01 STRUCTURE · contrato pós-mig 183 + 184 ─────────────────────────────────
SELECT 'structure' AS check_id, jsonb_build_object(
  'tracker_183_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000183'),
  'tracker_184_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000184'),
  'mra_policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
  'mra_anon_grants', (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='anon'),
  'mra_uses_therapist', (
    SELECT count(*) > 0 FROM pg_policy
    WHERE polrelid='public.medical_record_attachments'::regclass
      AND (pg_get_expr(polqual, polrelid) ILIKE '%''therapist''%' OR pg_get_expr(polwithcheck, polrelid) ILIKE '%''therapist''%')
  ),
  'mra_uses_professional', (
    SELECT count(*) > 0 FROM pg_policy
    WHERE polrelid='public.medical_record_attachments'::regclass
      AND (pg_get_expr(polqual, polrelid) ILIKE '%''professional''%' OR pg_get_expr(polwithcheck, polrelid) ILIKE '%''professional''%')
  ),
  'mra_delete_policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass AND polcmd='d'),
  'storage_media_private', (SELECT NOT public FROM storage.buckets WHERE id='media'),
  'storage_policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass)
) AS data;


-- 02a CONTAGEM ATUAL (pre + post smoke comparáveis) ─────────────────────────
SELECT 'counts' AS check_id, jsonb_build_object(
  'mra_total', (SELECT count(*) FROM public.medical_record_attachments),
  'mra_active', (SELECT count(*) FROM public.medical_record_attachments WHERE deleted_at IS NULL),
  'mra_deleted', (SELECT count(*) FROM public.medical_record_attachments WHERE deleted_at IS NOT NULL),
  'storage_media_medical_records_objects', (SELECT count(*) FROM storage.objects WHERE bucket_id='media' AND name LIKE '%/medical-records/%'),
  'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox)
) AS data;


-- 02b ATTACHMENT INSPECT (após upload manual via UI) ────────────────────────
-- Substituir <ATTACHMENT_ID> pelo id retornado pela UI e rodar:
--
-- SELECT
--   a.id,
--   a.clinic_id,
--   a.patient_id,
--   a.appointment_id,
--   a.uploaded_by,
--   a.bucket,
--   a.storage_path,
--   a.file_name,
--   a.mime_type,
--   a.size_bytes,
--   a.category,
--   a.visibility,
--   a.created_at,
--   a.deleted_at,
--   (a.storage_path LIKE a.clinic_id::text || '/medical-records/' || a.patient_id::text || '/%')   AS path_pattern_valid,
--   (a.bucket = 'media')                                                                          AS bucket_media,
--   (EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = a.bucket AND name = a.storage_path)) AS storage_object_exists
-- FROM public.medical_record_attachments a
-- WHERE a.id = '<ATTACHMENT_ID>'::uuid;
--
-- Esperado pós-upload:
--   path_pattern_valid     = true
--   bucket_media           = true
--   storage_object_exists  = true
--   deleted_at             = null
--   storage_path           = "<clinic_id>/medical-records/<patient_id>/<attachment_id>/<file>"
--
-- Esperado pós soft-delete (mesma query):
--   deleted_at             = timestamp NOT null
--   storage_object_exists  = true (objeto físico preservado · audit trail)


-- 03 wa_outbox_delta vs baseline ─────────────────────────────────────────────
-- Salvar o `baseline_outbox` do bloco 00 antes do smoke · rodar essa query
-- após upload + soft-delete · diferença esperada = 0
--
-- SELECT count(*) - <BASELINE_OUTBOX> AS wa_outbox_delta FROM public.wa_outbox;


-- 04 HARD GATE UNTOUCHED ────────────────────────────────────────────────────
SELECT 'hard_gate' AS check_id, (
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
) AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_media_vault_smoke_browser' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'wa_outbox_delta', 0,
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
  'tracker_183_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000183'),
  'tracker_184_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000184'),
  'mra_policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
  'mra_anon_grants', (SELECT count(*) FROM information_schema.table_privileges WHERE table_schema='public' AND table_name='medical_record_attachments' AND grantee='anon'),
  'mra_uses_therapist', (
    SELECT count(*) > 0 FROM pg_policy
    WHERE polrelid='public.medical_record_attachments'::regclass
      AND (pg_get_expr(polqual, polrelid) ILIKE '%''therapist''%' OR pg_get_expr(polwithcheck, polrelid) ILIKE '%''therapist''%')
  ),
  -- Slots opcionais a serem preenchidos após smoke real
  'smoke_attachment_id', NULL,
  'smoke_attachment_exists', NULL,
  'smoke_attachment_active_before_delete', NULL,
  'smoke_attachment_deleted_at_after_delete', NULL,
  'smoke_attachment_path_pattern_valid', NULL,
  'smoke_attachment_bucket_media', NULL,
  'smoke_attachment_no_public_url', NULL,
  'storage_object_exists', NULL,
  'mode', 'preflight_only · post_submit_pending_manual',
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000184')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments' AND column_name='storage_path')
    AND (SELECT NOT public FROM storage.buckets WHERE id='media')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  )
) AS data;
