-- =============================================================================
-- CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE · VALIDATION (READ-ONLY)
-- =============================================================================
-- Mig 182 já está aplicada e tracker registrado. Esta validation confirma:
--   - estrutura permanece intacta (coluna + FK + índice + comment);
--   - nenhum backfill foi executado pelo wiring;
--   - nenhuma row tem procedure_id apontando para id inválido (FK enforça);
--   - hard gate clínico segue intocado.
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
  'procedure_id_exists', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id'),
  'procedure_id_nullable', (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id'),
  'procedure_id_type', (SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id'),
  'fk_present', EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class src ON src.oid=c.conrelid
    JOIN pg_class dst ON dst.oid=c.confrelid
    WHERE c.conname='appointments_procedure_id_fkey' AND src.relname='appointments' AND dst.relname='clinic_procedimentos'
  ),
  'index_present', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_appointments_procedure_id'),
  'procedure_name_present', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_name'),
  'recurrence_procedure_present', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='recurrence_procedure'),
  'tracker_182_registered', EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000182')
) AS data;


-- 02 DATA SANITY (zero backfill esperado) ───────────────────────────────────
SELECT 'data_sanity' AS check_id, jsonb_build_object(
  'appointments_total', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL),
  'appointments_with_procedure_id', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND procedure_id IS NOT NULL),
  'appointments_with_procedure_name', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND procedure_name IS NOT NULL AND procedure_name != ''),
  'appointments_with_invalid_procedure_fk', (
    -- FK no banco rejeita inserts inválidos; este check é defesa adicional
    SELECT count(*) FROM public.appointments a
    WHERE a.deleted_at IS NULL
      AND a.procedure_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.clinic_procedimentos p WHERE p.id = a.procedure_id)
  ),
  'appointments_without_professional_count', (SELECT count(*) FROM public.appointments WHERE professional_id IS NULL AND deleted_at IS NULL)
) AS data;


-- 03 HARD GATE UNTOUCHED ────────────────────────────────────────────────────
SELECT 'hard_gate' AS check_id, jsonb_build_object(
  'appointment_finalize', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'appointment_clinical_gate_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'appointment_anamnesis_upsert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert'),
  'appointment_anamnesis_mark_complete', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete'),
  'complete_anamnesis_form', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
) AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_fk_wire' AS check_id, jsonb_build_object(
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
  'appointments_procedure_id_exists_remote', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id'),
  'appointment_fk_to_procedures_present', EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class src ON src.oid=c.conrelid
    JOIN pg_class dst ON dst.oid=c.confrelid
    WHERE c.conname='appointments_procedure_id_fkey' AND src.relname='appointments' AND dst.relname='clinic_procedimentos'
  ),
  'appointment_procedure_index_exists', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_appointments_procedure_id'),
  'procedure_name_still_exists', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_name'),
  'recurrence_procedure_still_exists', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='recurrence_procedure'),
  'appointments_with_procedure_id_count', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND procedure_id IS NOT NULL),
  'appointments_with_procedure_id_invalid_fk_count', (
    SELECT count(*) FROM public.appointments a
    WHERE a.deleted_at IS NULL AND a.procedure_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.clinic_procedimentos p WHERE p.id = a.procedure_id)
  ),
  'clinic_procedimentos_active_count', (SELECT count(*) FROM public.clinic_procedimentos WHERE ativo=true),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id')
    AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='appointments_procedure_id_fkey')
    AND EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000182')
    AND (SELECT count(*) FROM public.appointments a WHERE a.deleted_at IS NULL AND a.procedure_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clinic_procedimentos p WHERE p.id=a.procedure_id)) = 0
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  )
) AS data;
