-- ============================================================================
-- CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE · VALIDATION (READ-ONLY)
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


-- 01 SCHEMA ──────────────────────────────────────────────────────────────────
SELECT 'pp_extended_table' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended') AS data;

SELECT 'pp_extended_columns' AS check_id, jsonb_build_object(
  'id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='id'),
  'clinic_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='clinic_id'),
  'patient_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='patient_id'),
  'display_name', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='display_name'),
  'preferred_name', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='preferred_name'),
  'profile_photo_path', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='profile_photo_path'),
  'reception_welcome_enabled', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='reception_welcome_enabled'),
  'reception_photo_consent_status', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='reception_photo_consent_status'),
  'reception_animation_style', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='reception_animation_style')
) AS data;

SELECT 'pp_extended_constraints' AS check_id, jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(c.oid)) ORDER BY conname) AS data
FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
WHERE r.relname='patient_profiles_extended' AND c.contype IN ('c','u','f','p');

SELECT 'pp_extended_rls_enabled' AS check_id, (SELECT relrowsecurity FROM pg_class WHERE relname='patient_profiles_extended') AS data;

SELECT 'pp_extended_rls_policies' AS check_id, jsonb_agg(jsonb_build_object('name', polname, 'cmd', polcmd) ORDER BY polname) AS data
FROM pg_policy WHERE polrelid='public.patient_profiles_extended'::regclass;

SELECT 'storage_media_bucket' AS check_id, jsonb_build_object(
  'exists', EXISTS (SELECT 1 FROM storage.buckets WHERE id='media'),
  'is_private', (SELECT NOT public FROM storage.buckets WHERE id='media')
) AS data;


-- 02 CONSENT CONTRACT ────────────────────────────────────────────────────────
-- enabled_without_consent: welcome=true mas consent != granted
SELECT 'enabled_without_consent' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_welcome_enabled=true AND reception_photo_consent_status != 'granted';
-- Expected: 0 (enforced via CHECK constraint)

-- enabled_without_photo: welcome=true mas photo_path NULL
SELECT 'enabled_without_photo' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_welcome_enabled=true AND profile_photo_path IS NULL;
-- Expected: 0

-- granted_without_consent_at: consent=granted mas consent_at NULL
SELECT 'granted_without_consent_at' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_photo_consent_status='granted' AND reception_photo_consent_at IS NULL;
-- Expected: 0

-- revoked_but_enabled: consent=revoked mas welcome=true
SELECT 'revoked_but_enabled' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_photo_consent_status='revoked' AND reception_welcome_enabled=true;
-- Expected: 0


-- 03 PATIENT CONTRACT ────────────────────────────────────────────────────────
SELECT 'orphan_profile_count' AS check_id, count(*) AS n
FROM public.patient_profiles_extended pp
WHERE NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = pp.patient_id);
-- Expected: 0

SELECT 'pp_extended_total' AS check_id, count(*) AS n FROM public.patient_profiles_extended;


-- 04 RECEPTION READINESS ────────────────────────────────────────────────────
SELECT 'profiles_ready_for_reception' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_welcome_enabled=true
  AND reception_photo_consent_status='granted'
  AND profile_photo_path IS NOT NULL;

SELECT 'profiles_missing_photo' AS check_id, count(*) AS n
FROM public.patient_profiles_extended WHERE profile_photo_path IS NULL;

SELECT 'profiles_revoked' AS check_id, count(*) AS n
FROM public.patient_profiles_extended WHERE reception_photo_consent_status='revoked';


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_patient_profile' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'patient_profile_contract_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended')
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='patient_profiles_extended')
    AND (SELECT count(*) FROM pg_policy WHERE polrelid='public.patient_profiles_extended'::regclass) >= 3
  ),
  'reception_photo_consent_ready', (
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='reception_photo_consent_status')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='reception_welcome_enabled')
  ),
  'storage_private_ready', (
    EXISTS (SELECT 1 FROM storage.buckets WHERE id='media' AND NOT public)
  ),
  'privacy_contract_ok', (
    (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND reception_photo_consent_status != 'granted') = 0
    AND (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND profile_photo_path IS NULL) = 0
    AND (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_photo_consent_status='revoked' AND reception_welcome_enabled=true) = 0
  ),
  'cron_with_provider_call', (
    SELECT count(*) FROM cron.job
    WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'
  ),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'tracker_mig_180', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000180'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended')
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND reception_photo_consent_status != 'granted') = 0
    AND (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND profile_photo_path IS NULL) = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
  )
) AS data;
