-- ============================================================================
-- CRM_PHASE_2I · VALIDATION SQL · ANAMNESIS + INFORMED CONSENT
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE.
-- Companion: docs/crm-refactor/59-phase-2i-anamnesis-informed-consent.md
-- ============================================================================


-- 00 · Safety
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);

SELECT 'worker71_off' AS check_id,
       (SELECT NOT active FROM cron.job WHERE jobid=71) AS worker71_off;

SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe_count;


-- 01 · Schema
SELECT 'tables_exist' AS check_id,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_anamneses') AS anamneses,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_informed_consents') AS consents;

SELECT 'anamneses_columns' AS check_id,
       jsonb_agg(column_name ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='appointment_anamneses';

SELECT 'consents_columns' AS check_id,
       jsonb_agg(column_name ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='appointment_informed_consents';

SELECT 'unique_indexes' AS check_id, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('appointment_anamneses','appointment_informed_consents')
ORDER BY tablename, indexname;


-- 02 · Functions
SELECT 'fns_exist' AS check_id,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert') AS fn_anamnesis_upsert,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete') AS fn_anamnesis_complete,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_consent_accept') AS fn_consent_accept,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status') AS fn_gate;

SELECT 'fn_security' AS check_id, p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN (
    'appointment_anamnesis_upsert',
    'appointment_anamnesis_mark_complete',
    'appointment_consent_accept',
    'appointment_clinical_gate_status'
  )
ORDER BY p.proname;


-- 03 · Data health
SELECT 'anamneses_health' AS check_id,
       count(*) AS total,
       count(*) FILTER (WHERE status='draft') AS draft,
       count(*) FILTER (WHERE status='complete') AS complete,
       count(*) FILTER (WHERE status='archived') AS archived,
       count(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted
FROM public.appointment_anamneses;

SELECT 'consents_health' AS check_id,
       count(*) AS total,
       count(*) FILTER (WHERE accepted=true) AS accepted,
       count(*) FILTER (WHERE revoked_at IS NOT NULL) AS revoked,
       count(*) FILTER (WHERE accepted=true AND accepted_at IS NULL) AS accepted_without_ts;
-- Expected: accepted_without_ts = 0

-- Duplicate active anamnesis (UNIQUE protege)
SELECT 'anamnesis_duplicates' AS check_id, count(*) AS n
FROM (
  SELECT appointment_id, count(*) c
  FROM public.appointment_anamneses
  WHERE deleted_at IS NULL AND status <> 'archived'
  GROUP BY appointment_id
  HAVING count(*) > 1
) s;

-- Duplicate active consent (UNIQUE protege)
SELECT 'consent_duplicates' AS check_id, count(*) AS n
FROM (
  SELECT appointment_id, term_key, term_version, count(*) c
  FROM public.appointment_informed_consents
  WHERE deleted_at IS NULL AND revoked_at IS NULL
  GROUP BY appointment_id, term_key, term_version
  HAVING count(*) > 1
) s;

-- Orphan rows (appointment deletado)
SELECT 'orphan_anamneses' AS check_id, count(*) AS n
FROM public.appointment_anamneses a
LEFT JOIN public.appointments ap ON ap.id = a.appointment_id
WHERE ap.id IS NULL;

SELECT 'orphan_consents' AS check_id, count(*) AS n
FROM public.appointment_informed_consents c
LEFT JOIN public.appointments ap ON ap.id = c.appointment_id
WHERE ap.id IS NULL;


-- 04 · Clinical gate stats
SELECT 'clinical_gate_em_atendimento' AS check_id, count(*) AS n
FROM public.appointments WHERE status='em_atendimento' AND deleted_at IS NULL;

SELECT 'clinical_gate_na_clinica_or_em_atendimento_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE status IN ('na_clinica','em_atendimento') AND deleted_at IS NULL;

-- Appointments em em_atendimento sem anamnese ativa
SELECT 'em_atendimento_missing_anamnesis' AS check_id, count(*) AS n
FROM public.appointments ap
WHERE ap.status = 'em_atendimento'
  AND ap.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.appointment_anamneses a
    WHERE a.appointment_id = ap.id
      AND a.deleted_at IS NULL
      AND a.status <> 'archived'
  );

-- Finalizados sem consent assinado
SELECT 'finalizado_missing_consent' AS check_id, count(*) AS n
FROM public.appointments ap
WHERE ap.status = 'finalizado'
  AND ap.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.appointment_informed_consents c
    WHERE c.appointment_id = ap.id
      AND c.deleted_at IS NULL
      AND c.revoked_at IS NULL
      AND c.accepted = true
  );


-- 99 · Final flags
SELECT 'final_flags_2i' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'anamnesis_schema_ready', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_anamneses'),
  'consent_schema_ready', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_informed_consents'),
  'fn_anamnesis_upsert_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert'),
  'fn_anamnesis_complete_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete'),
  'fn_consent_accept_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_consent_accept'),
  'fn_clinical_gate_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'duplicate_anamnesis_count', (SELECT count(*) FROM (SELECT appointment_id, count(*) c FROM public.appointment_anamneses WHERE deleted_at IS NULL AND status <> 'archived' GROUP BY appointment_id HAVING count(*) > 1) s),
  'duplicate_consent_count', (SELECT count(*) FROM (SELECT appointment_id, term_key, term_version, count(*) c FROM public.appointment_informed_consents WHERE deleted_at IS NULL AND revoked_at IS NULL GROUP BY appointment_id, term_key, term_version HAVING count(*) > 1) s),
  'orphan_anamnesis_count', (SELECT count(*) FROM public.appointment_anamneses a LEFT JOIN public.appointments ap ON ap.id=a.appointment_id WHERE ap.id IS NULL),
  'orphan_consent_count', (SELECT count(*) FROM public.appointment_informed_consents c LEFT JOIN public.appointments ap ON ap.id=c.appointment_id WHERE ap.id IS NULL),
  'consent_accepted_without_ts', (SELECT count(*) FROM public.appointment_informed_consents WHERE accepted=true AND accepted_at IS NULL),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'tracker_mig_166', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000166'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_consent_accept')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status')
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
  )
) AS data;
