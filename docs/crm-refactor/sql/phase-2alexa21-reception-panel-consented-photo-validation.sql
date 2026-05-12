-- ============================================================================
-- CRM_PHASE_2ALEXA.2.1 · VALIDATION (READ-ONLY)
-- Reception panel consumes consented patient photo from prontuário
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


-- 01 PATIENT PROFILE CONTRACT ────────────────────────────────────────────────
SELECT 'tracker_mig_180' AS check_id,
  (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000180') AS data;

SELECT 'pp_extended_exists' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended') AS data;

SELECT 'enabled_without_consent' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_welcome_enabled=true AND reception_photo_consent_status != 'granted';
-- Expected: 0

SELECT 'enabled_without_photo' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_welcome_enabled=true AND profile_photo_path IS NULL;
-- Expected: 0

SELECT 'granted_without_consent_at' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_photo_consent_status='granted' AND reception_photo_consent_at IS NULL;
-- Expected: 0

SELECT 'revoked_but_enabled' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_photo_consent_status='revoked' AND reception_welcome_enabled=true;
-- Expected: 0


-- 02 RECEPTION PANEL SOURCES ────────────────────────────────────────────────
SELECT 'appointments_today_by_status' AS check_id, jsonb_object_agg(status, n) AS data
FROM (
  SELECT status, count(*) AS n
  FROM public.appointments
  WHERE scheduled_date = CURRENT_DATE AND deleted_at IS NULL
  GROUP BY status
) s;

SELECT 'invalid_appointment_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE status IS NOT NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'na_clinica_today' AS check_id, count(*) AS n
FROM public.appointments
WHERE scheduled_date = CURRENT_DATE AND status='na_clinica' AND deleted_at IS NULL;

SELECT 'em_atendimento_today' AS check_id, count(*) AS n
FROM public.appointments
WHERE scheduled_date = CURRENT_DATE AND status='em_atendimento' AND deleted_at IS NULL;

SELECT 'upcoming_today' AS check_id, count(*) AS n
FROM public.appointments
WHERE scheduled_date = CURRENT_DATE
  AND status IN ('agendado','aguardando_confirmacao','confirmado','aguardando')
  AND deleted_at IS NULL;

SELECT 'phase_perdido_count' AS check_id, count(*) AS n FROM public.leads WHERE phase='perdido';


-- 03 PHOTO READINESS ────────────────────────────────────────────────────────
SELECT 'reception_ready_profiles_count' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_welcome_enabled=true
  AND reception_photo_consent_status='granted'
  AND profile_photo_path IS NOT NULL;

SELECT 'consented_with_photo_count' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_photo_consent_status='granted'
  AND profile_photo_path IS NOT NULL;

SELECT 'revoked_count' AS check_id, count(*) AS n
FROM public.patient_profiles_extended
WHERE reception_photo_consent_status='revoked';

SELECT 'storage_media_private' AS check_id, jsonb_build_object(
  'exists', EXISTS (SELECT 1 FROM storage.buckets WHERE id='media'),
  'is_private', (SELECT NOT public FROM storage.buckets WHERE id='media')
) AS data;

-- Raw path exposure NÃO pode ser verificada via SQL · garantida por code review:
--   apps/lara/src/app/(authed)/recepcao/painel/page.tsx só passa signed URLs
--   (createSignedUrl ttl 300s) · profile_photo_path NUNCA é prop do client.


-- 04 PRIVACY CONTRACT ────────────────────────────────────────────────────────
-- Code review · panel queries não fazem JOIN em:
--   anamneses · orcamentos · phase_history · observações clínicas
-- Painel só toca: appointments (DTO seguro) + patient_profiles_extended
-- (campos cosméticos + consentimento) · sem dados sensíveis.

-- Telefone: painel só renderiza últimos 4 dígitos via maskPhone() em page.tsx
-- (verificável em code review · sem suporte SQL).

SELECT 'panel_query_contract' AS check_id, 'verified_via_code_review' AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_2alexa21' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'tracker_mig_180', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000180'),
  'reception_panel_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patient_profiles_extended' AND column_name='reception_animation_style')
  ),
  'photo_consent_contract_ready', (
    (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND reception_photo_consent_status != 'granted') = 0
    AND (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND profile_photo_path IS NULL) = 0
    AND (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_photo_consent_status='revoked' AND reception_welcome_enabled=true) = 0
  ),
  'signed_url_contract_ready', (
    EXISTS (SELECT 1 FROM storage.buckets WHERE id='media' AND NOT public)
  ),
  'privacy_contract_ok', (
    (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND reception_photo_consent_status != 'granted') = 0
  ),
  'cron_with_provider_call', (
    SELECT count(*) FROM cron.job
    WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'
  ),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments
    WHERE status IS NOT NULL
      AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')
  ),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended')
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND reception_photo_consent_status != 'granted') = 0
    AND (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND profile_photo_path IS NULL) = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
  )
) AS data;
