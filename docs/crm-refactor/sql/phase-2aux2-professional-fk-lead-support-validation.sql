-- ============================================================================
-- CRM_PHASE_2AUX.2 · VALIDATION (READ-ONLY)
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


-- 01 SCHEMA ──────────────────────────────────────────────────────────────────
SELECT 'professional_fk_exists' AS check_id,
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema='public' AND tc.table_name='appointments'
      AND tc.constraint_type='FOREIGN KEY'
      AND tc.constraint_name='appointments_professional_id_fkey'
      AND ccu.table_name='professional_profiles'
  ) AS data;

SELECT 'subject_columns_present' AS check_id, jsonb_build_object(
  'lead_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='lead_id'),
  'patient_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='patient_id'),
  'professional_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='professional_id'),
  'professional_name', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='professional_name')
) AS data;

SELECT 'subject_xor_check' AS check_id,
  EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    WHERE c.contype = 'c' AND r.relname = 'appointments'
      AND pg_get_constraintdef(c.oid) ILIKE '%lead_id%patient_id%'
  ) AS data;

SELECT 'professional_index_exists' AS check_id,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='appointments'
      AND indexname='idx_appt_professional_date'
  ) AS data;

SELECT 'professional_profiles_columns' AS check_id, jsonb_build_object(
  'agenda_enabled', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='professional_profiles' AND column_name='agenda_enabled'),
  'is_active', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='professional_profiles' AND column_name='is_active'),
  'display_name', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='professional_profiles' AND column_name='display_name')
) AS data;


-- 02 DATA HEALTH ─────────────────────────────────────────────────────────────
SELECT 'appointments_total' AS check_id, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL;

SELECT 'appointments_without_professional' AS check_id, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL AND professional_id IS NULL;

SELECT 'appointments_invalid_professional' AS check_id, count(*) AS n
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND a.professional_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id);

SELECT 'appointments_with_patient_only' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND patient_id IS NOT NULL AND lead_id IS NULL;

SELECT 'appointments_with_lead_only' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND patient_id IS NULL;

SELECT 'appointments_with_both_subjects' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND patient_id IS NOT NULL;
-- Expected: 0

SELECT 'appointments_with_neither_subject' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND lead_id IS NULL AND patient_id IS NULL AND status != 'bloqueado';
-- Expected: 0

SELECT 'invalid_appt_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'phase_perdido_count' AS check_id, count(*) AS n FROM public.leads WHERE phase='perdido';


-- 03 PROFESSIONAL POOL HEALTH ────────────────────────────────────────────────
SELECT 'professional_profiles_active' AS check_id, count(*) AS n
FROM public.professional_profiles WHERE is_active=true;

SELECT 'professional_profiles_agenda_enabled' AS check_id, count(*) AS n
FROM public.professional_profiles WHERE is_active=true AND agenda_enabled=true;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_2aux2' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'professional_fk_ready', EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema='public' AND tc.table_name='appointments'
      AND tc.constraint_type='FOREIGN KEY'
      AND tc.constraint_name='appointments_professional_id_fkey'
  ),
  'professional_index_ready', EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='appointments'
      AND indexname='idx_appt_professional_date'
  ),
  'subject_xor_ready', EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    WHERE c.contype = 'c' AND r.relname = 'appointments'
      AND pg_get_constraintdef(c.oid) ILIKE '%lead_id%patient_id%'
  ),
  'lead_support_ready', (
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='lead_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='patient_id')
  ),
  'professionals_with_agenda_enabled', (
    SELECT count(*) FROM public.professional_profiles WHERE is_active=true AND agenda_enabled=true
  ),
  'appointments_without_professional', (
    SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND professional_id IS NULL
  ),
  'appointments_invalid_professional', (
    SELECT count(*) FROM public.appointments a
    WHERE a.deleted_at IS NULL AND a.professional_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id)
  ),
  'appointments_xor_violations', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND patient_id IS NOT NULL
  ),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments
     WHERE deleted_at IS NULL
       AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')
  ),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'unsafe_outbox_count', (
    SELECT count(*) FROM public.wa_outbox
    WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL
  ),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND patient_id IS NOT NULL) = 0
    AND (SELECT count(*) FROM public.appointments a WHERE a.deleted_at IS NULL AND a.professional_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id)) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema='public' AND table_name='appointments'
        AND constraint_type='FOREIGN KEY' AND constraint_name='appointments_professional_id_fkey'
    )
  )
) AS data;
