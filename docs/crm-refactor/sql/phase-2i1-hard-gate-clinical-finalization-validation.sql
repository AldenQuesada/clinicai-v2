-- ============================================================================
-- CRM_PHASE_2I.1 · VALIDATION SQL · HARD GATE CLINICAL FINALIZATION
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE.
-- ============================================================================


-- 00 · Safety
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe_count;


-- 01 · Schema (override table)
SELECT 'override_table_exists' AS check_id,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_clinical_gate_overrides') AS data;

SELECT 'override_columns' AS check_id,
       jsonb_agg(column_name ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='appointment_clinical_gate_overrides';

SELECT 'override_constraints' AS check_id, conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='appointment_clinical_gate_overrides'
ORDER BY conname;

SELECT 'override_indexes' AS check_id, indexname
FROM pg_indexes
WHERE schemaname='public' AND tablename='appointment_clinical_gate_overrides';


-- 02 · Functions
SELECT 'finalize_signature' AS check_id,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';

SELECT 'finalize_has_override_args' AS check_id,
       (pg_get_function_identity_arguments(p.oid) LIKE '%p_clinical_override%' AND
        pg_get_function_identity_arguments(p.oid) LIKE '%p_clinical_override_reason%') AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';

SELECT 'clinical_gate_fn_ready' AS check_id,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status') AS data;

SELECT 'is_admin_helper' AS check_id,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin') AS data;


-- 03 · Gate data health
SELECT 'appts_em_atendimento_or_na_clinica' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND status IN ('na_clinica','em_atendimento')
GROUP BY status;

SELECT 'em_atendimento_missing_anamnesis' AS check_id, count(*) AS n
FROM public.appointments ap
WHERE ap.status = 'em_atendimento'
  AND ap.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.appointment_anamneses a
    WHERE a.appointment_id = ap.id AND a.deleted_at IS NULL
      AND a.status = 'complete'
  );

SELECT 'em_atendimento_missing_consent' AS check_id, count(*) AS n
FROM public.appointments ap
WHERE ap.status = 'em_atendimento'
  AND ap.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.appointment_informed_consents c
    WHERE c.appointment_id = ap.id AND c.deleted_at IS NULL
      AND c.revoked_at IS NULL AND c.accepted = true
  );


-- 04 · Override audit health
SELECT 'overrides_total' AS check_id, count(*) AS n FROM public.appointment_clinical_gate_overrides;

SELECT 'overrides_missing_reason' AS check_id, count(*) AS n
FROM public.appointment_clinical_gate_overrides
WHERE reason IS NULL OR length(trim(reason)) < 5;
-- Expected: 0 (CHECK constraint protege)

SELECT 'overrides_orphan' AS check_id, count(*) AS n
FROM public.appointment_clinical_gate_overrides o
LEFT JOIN public.appointments ap ON ap.id = o.appointment_id
WHERE ap.id IS NULL;

SELECT 'overrides_invalid_outcome' AS check_id, count(*) AS n
FROM public.appointment_clinical_gate_overrides
WHERE outcome NOT IN ('paciente','orcamento','paciente_orcamento','perdido');
-- Expected: 0 (CHECK constraint protege)

SELECT 'overrides_invalid_gate_status' AS check_id, count(*) AS n
FROM public.appointment_clinical_gate_overrides
WHERE gate_status_prev NOT IN ('ok','warning');
-- Expected: 0 (CHECK constraint protege)


-- 05 · Bypass risk inventory (informativo · UI/action devem chamar fn nova)
SELECT 'finalize_fn_count_in_schema' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';
-- Expected: 1 (DROP removeu a versão antiga · só nova sobrevive)


-- 99 · Final flags
SELECT 'final_flags_2i1' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'override_schema_ready', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_clinical_gate_overrides'),
  'finalize_has_override_args', (
    SELECT (pg_get_function_identity_arguments(p.oid) LIKE '%p_clinical_override%')
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='appointment_finalize'
  ),
  'clinical_gate_fn_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'is_admin_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_admin'),
  'finalize_count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'invalid_override_count', (
    (SELECT count(*) FROM public.appointment_clinical_gate_overrides WHERE reason IS NULL OR length(trim(reason)) < 5)
    +
    (SELECT count(*) FROM public.appointment_clinical_gate_overrides o LEFT JOIN public.appointments ap ON ap.id=o.appointment_id WHERE ap.id IS NULL)
  ),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'tracker_mig_167', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000167'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_clinical_gate_overrides')
    AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize') = 1
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
  )
) AS data;
