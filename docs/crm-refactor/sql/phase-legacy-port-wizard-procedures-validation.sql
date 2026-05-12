-- ============================================================================
-- CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · VALIDATION (READ-ONLY)
-- Trilha B1 · Wizard usa Select de procedimentos · sem migration aplicada
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


-- 01 SCHEMA · APPOINTMENTS PROCEDURE COLS ────────────────────────────────────
SELECT 'appointment_procedure_cols' AS check_id,
  jsonb_agg(column_name ORDER BY column_name) AS data
FROM information_schema.columns
WHERE table_schema='public' AND table_name='appointments'
  AND (column_name ILIKE '%procedure%' OR column_name ILIKE '%procedimento%');

SELECT 'appointment_fk_to_procedures_count' AS check_id, count(*) AS n
FROM pg_constraint c
JOIN pg_class src ON src.oid = c.conrelid
JOIN pg_class dst ON dst.oid = c.confrelid
WHERE src.relname = 'appointments'
  AND c.contype = 'f'
  AND dst.relname IN ('clinic_procedimentos','procedimentos','procedures');
-- Expected: 0 (Trilha B1 · FK não existe ainda · snapshot via procedure_name)


-- 02 CLINIC_PROCEDIMENTOS · CONTRACT ────────────────────────────────────────
SELECT 'clinic_procedimentos_total' AS check_id, count(*) AS n
FROM public.clinic_procedimentos;

SELECT 'clinic_procedimentos_active' AS check_id, count(*) AS n
FROM public.clinic_procedimentos WHERE ativo=true;

SELECT 'clinic_procedimentos_inactive' AS check_id, count(*) AS n
FROM public.clinic_procedimentos WHERE ativo=false;

SELECT 'clinic_procedimentos_rls' AS check_id, jsonb_build_object(
  'enabled', (SELECT relrowsecurity FROM pg_class WHERE relname='clinic_procedimentos'),
  'policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.clinic_procedimentos'::regclass)
) AS data;


-- 03 APPOINTMENT LEGACY · PROCEDURE_NAME ────────────────────────────────────
SELECT 'appointments_active_total' AS check_id, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL;

SELECT 'appointments_with_procedure_name' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND procedure_name IS NOT NULL AND procedure_name != '';

SELECT 'appointments_procedure_name_matching_catalog' AS check_id, count(*) AS n
FROM public.appointments a
JOIN public.clinic_procedimentos p
  ON p.clinic_id = a.clinic_id
 AND lower(trim(p.nome)) = lower(trim(a.procedure_name))
WHERE a.deleted_at IS NULL
  AND a.procedure_name IS NOT NULL
  AND a.procedure_name != '';

SELECT 'appointments_procedure_name_orphan' AS check_id, count(*) AS n
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND a.procedure_name IS NOT NULL
  AND a.procedure_name != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.clinic_procedimentos p
    WHERE p.clinic_id = a.clinic_id
      AND lower(trim(p.nome)) = lower(trim(a.procedure_name))
  );
-- Esses são os "legados sem match no catálogo" · UI exibe aviso ao editar.


-- 04 SAFETY CONTRACT (mesma régua das fases anteriores) ─────────────────────
SELECT 'invalid_appointment_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE status IS NOT NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'phase_perdido_count' AS check_id, count(*) AS n
FROM public.leads WHERE phase='perdido';

SELECT 'tracker_mig_180' AS check_id,
  (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000180') AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_wizard_procedures' AS check_id, jsonb_build_object(
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
  'clinic_procedimentos_active', (SELECT count(*) FROM public.clinic_procedimentos WHERE ativo=true),
  'appointment_fk_to_procedures_present', (
    EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class dst ON dst.oid = c.confrelid
      WHERE src.relname = 'appointments'
        AND c.contype = 'f'
        AND dst.relname IN ('clinic_procedimentos','procedimentos','procedures')
    )
  ),
  'wizard_procedures_compat_ready', (
    (SELECT count(*) FROM public.clinic_procedimentos WHERE ativo=true) > 0
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='clinic_procedimentos')
  ),
  'migration_required_not_applied', NOT (
    EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class dst ON dst.oid = c.confrelid
      WHERE src.relname = 'appointments'
        AND c.contype = 'f'
        AND dst.relname IN ('clinic_procedimentos','procedimentos','procedures')
    )
  ),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND (SELECT count(*) FROM public.clinic_procedimentos WHERE ativo=true) > 0
  )
) AS data;
