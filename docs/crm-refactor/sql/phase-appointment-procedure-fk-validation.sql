-- =============================================================================
-- CRM_PHASE_APPOINTMENT_PROCEDURE_FK · VALIDATION (READ-ONLY · PRE-APPLY)
-- =============================================================================
-- A migration 182 está LOCAL e NÃO foi aplicada. Os flags `*_remote` ainda
-- mostram que a coluna não existe · isso é esperado nesta fase.
-- Após CRM_PHASE_APPOINTMENT_PROCEDURE_FK_APPLY, rerodar e os flags devem
-- inverter (procedure_id existe · FK existe · índice existe).
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


-- 01 APPOINTMENTS SCHEMA · pre-apply ────────────────────────────────────────
SELECT 'appointments_schema_pre_apply' AS check_id, jsonb_build_object(
  'procedure_id_exists', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id'),
  'procedure_name_exists', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_name'),
  'recurrence_procedure_exists', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='recurrence_procedure'),
  'fk_to_clinic_procedimentos_count', (
    SELECT count(*) FROM pg_constraint c
    JOIN pg_class src ON src.oid=c.conrelid
    JOIN pg_class dst ON dst.oid=c.confrelid
    WHERE src.relname='appointments' AND c.contype='f' AND dst.relname='clinic_procedimentos'
  ),
  'idx_procedure_id_exists', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_appointments_procedure_id')
) AS data;


-- 02 CLINIC_PROCEDIMENTOS HEALTH ────────────────────────────────────────────
SELECT 'clinic_procedimentos_health' AS check_id, jsonb_build_object(
  'total', (SELECT count(*) FROM public.clinic_procedimentos),
  'active', (SELECT count(*) FROM public.clinic_procedimentos WHERE ativo=true),
  'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE relname='clinic_procedimentos'),
  'duplicate_normalized_names', (
    SELECT count(*) FROM (
      SELECT clinic_id, lower(trim(nome)) AS key
      FROM public.clinic_procedimentos
      WHERE ativo=true
      GROUP BY clinic_id, lower(trim(nome))
      HAVING count(*) > 1
    ) d
  )
) AS data;


-- 03 MATCH REPORT (snapshot procedure_name × catálogo) ──────────────────────
SELECT 'match_report' AS check_id, jsonb_build_object(
  'appointments_total_active', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL),
  'appointments_with_procedure_name', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND procedure_name IS NOT NULL AND procedure_name != ''),
  'exact_match_count', (
    SELECT count(*)
    FROM public.appointments a
    JOIN public.clinic_procedimentos p
      ON p.clinic_id = a.clinic_id
     AND p.ativo = true
     AND lower(trim(p.nome)) = lower(trim(a.procedure_name))
    WHERE a.deleted_at IS NULL
      AND a.procedure_name IS NOT NULL
      AND a.procedure_name != ''
  ),
  'no_match_count', (
    SELECT count(*) FROM public.appointments a
    WHERE a.deleted_at IS NULL
      AND a.procedure_name IS NOT NULL
      AND a.procedure_name != ''
      AND NOT EXISTS (
        SELECT 1 FROM public.clinic_procedimentos p
        WHERE p.clinic_id = a.clinic_id
          AND p.ativo = true
          AND lower(trim(p.nome)) = lower(trim(a.procedure_name))
      )
  ),
  'multi_match_count', (
    SELECT count(*) FROM (
      SELECT a.id
      FROM public.appointments a
      JOIN public.clinic_procedimentos p
        ON p.clinic_id = a.clinic_id
       AND p.ativo = true
       AND lower(trim(p.nome)) = lower(trim(a.procedure_name))
      WHERE a.deleted_at IS NULL
        AND a.procedure_name IS NOT NULL
        AND a.procedure_name != ''
      GROUP BY a.id
      HAVING count(*) > 1
    ) m
  )
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
SELECT 'final_flags_appointment_procedure_fk' AS check_id, jsonb_build_object(
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
  'clinic_procedimentos_active_count', (SELECT count(*) FROM public.clinic_procedimentos WHERE ativo=true),
  'clinic_procedimentos_duplicate_normalized_names', (
    SELECT count(*) FROM (
      SELECT clinic_id, lower(trim(nome)) AS key
      FROM public.clinic_procedimentos
      WHERE ativo=true
      GROUP BY clinic_id, lower(trim(nome))
      HAVING count(*) > 1
    ) d
  ),
  'appointments_total', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL),
  'appointments_with_procedure_name', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND procedure_name IS NOT NULL AND procedure_name != ''),
  'appointment_procedure_exact_match_count', (
    SELECT count(*)
    FROM public.appointments a
    JOIN public.clinic_procedimentos p
      ON p.clinic_id = a.clinic_id
     AND p.ativo = true
     AND lower(trim(p.nome)) = lower(trim(a.procedure_name))
    WHERE a.deleted_at IS NULL
      AND a.procedure_name IS NOT NULL
      AND a.procedure_name != ''
  ),
  'appointment_procedure_no_match_count', (
    SELECT count(*) FROM public.appointments a
    WHERE a.deleted_at IS NULL
      AND a.procedure_name IS NOT NULL
      AND a.procedure_name != ''
      AND NOT EXISTS (
        SELECT 1 FROM public.clinic_procedimentos p
        WHERE p.clinic_id = a.clinic_id
          AND p.ativo = true
          AND lower(trim(p.nome)) = lower(trim(a.procedure_name))
      )
  ),
  'appointment_procedure_multi_match_count', (
    SELECT count(*) FROM (
      SELECT a.id
      FROM public.appointments a
      JOIN public.clinic_procedimentos p
        ON p.clinic_id = a.clinic_id
       AND p.ativo = true
       AND lower(trim(p.nome)) = lower(trim(a.procedure_name))
      WHERE a.deleted_at IS NULL
        AND a.procedure_name IS NOT NULL
        AND a.procedure_name != ''
      GROUP BY a.id
      HAVING count(*) > 1
    ) m
  ),
  'appointments_without_professional_count', (
    SELECT count(*) FROM public.appointments WHERE professional_id IS NULL AND deleted_at IS NULL
  ),
  'migration_182_created_not_applied', true,
  'proposed_file_still_not_applied', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
    AND (SELECT count(*) FROM public.clinic_procedimentos WHERE ativo=true) > 0
    AND (
      SELECT count(*) FROM (
        SELECT clinic_id, lower(trim(nome)) AS key
        FROM public.clinic_procedimentos
        WHERE ativo=true
        GROUP BY clinic_id, lower(trim(nome))
        HAVING count(*) > 1
      ) d
    ) = 0
  )
) AS data;
