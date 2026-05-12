-- ============================================================================
-- CRM_PHASE_2E · PATIENT JOURNEY AUDIT · READ-ONLY SQL
-- ============================================================================
-- Companion file to docs/crm-refactor/40-phase-2e-patient-journey-event-map-audit.md
--
-- Status: READ-ONLY. No INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/TRUNCATE.
-- All blocks use SELECT + information_schema for safety.
-- Run sequentially. Each block is self-contained and idempotent.
--
-- USE: paste each block (or all) into the Supabase SQL Editor read-only mode,
-- or via Management API SQL endpoint with the project's read role.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00_environment_safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_jobs_12_71_72' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'schedule', schedule, 'active', active)
                 ORDER BY jobid) AS data
FROM cron.job
WHERE jobid IN (12, 71, 72);
-- Expected: 12 active=true · 71 active=false · 72 active=true

SELECT 'wa_outbox_pending_total' AS check_id,
       count(*) FILTER (WHERE status IN ('queued','pending','retry','retrying')) AS pending_count,
       count(*) FILTER (WHERE created_at >= now() - interval '5 minutes') AS new_last_5min
FROM public.wa_outbox;
-- Expected: pending=0 (job 71 OFF), new_last_5min=0

SELECT 'agenda_alerts_log_recent' AS check_id,
       count(*) FILTER (WHERE created_at >= now() - interval '5 minutes') AS new_5min,
       count(*) AS total
FROM public.agenda_alerts_log;
-- Expected: 0 / 0 enquanto worker 71 off + sem appts futuros


-- ────────────────────────────────────────────────────────────────────────────
-- 01_appointment_status_distribution
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'appointment_status_dist' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY n DESC;

SELECT 'appointment_status_invalid' AS check_id, count(*) AS invalid_count
FROM public.appointments
WHERE deleted_at IS NULL
  AND status NOT IN (
    'agendado','aguardando_confirmacao','confirmado','aguardando',
    'na_clinica','em_atendimento','finalizado','remarcado','cancelado',
    'no_show','bloqueado'
  );
-- Expected: 0

SELECT 'appointment_status_legacy' AS check_id, count(*) AS legacy_count
FROM public.appointments
WHERE deleted_at IS NULL
  AND status IN ('compareceu','reagendado','pre_consulta','em_consulta','attending','converted');
-- Expected: 0


-- ────────────────────────────────────────────────────────────────────────────
-- 02_lead_phase_lifecycle_distribution
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'leads_phase_dist' AS check_id, phase, count(*) AS n
FROM public.leads
WHERE deleted_at IS NULL
GROUP BY phase
ORDER BY n DESC;

SELECT 'leads_lifecycle_dist' AS check_id, lifecycle_status, count(*) AS n
FROM public.leads
WHERE deleted_at IS NULL
GROUP BY lifecycle_status
ORDER BY n DESC;

SELECT 'leads_phase_invalid' AS check_id, count(*) AS invalid_count
FROM public.leads
WHERE deleted_at IS NULL
  AND phase NOT IN ('lead','agendado','paciente','orcamento');
-- Expected: 0

SELECT 'leads_phase_perdido_anti_pattern' AS check_id, count(*) AS perdido_as_phase_count
FROM public.leads
WHERE deleted_at IS NULL AND phase = 'perdido';
-- Expected: 0 (perdido é lifecycle_status, NÃO phase)

SELECT 'leads_lifecycle_invalid' AS check_id, count(*) AS invalid_count
FROM public.leads
WHERE deleted_at IS NULL
  AND lifecycle_status NOT IN ('ativo','perdido','recuperacao','arquivado');
-- Expected: 0

SELECT 'leads_soft_deleted_anti_pattern' AS check_id, count(*) AS soft_deleted_count
FROM public.leads
WHERE deleted_at IS NOT NULL;
-- Expected: SMALL (refactor: leads nunca soft-deleted operacionalmente)


-- ────────────────────────────────────────────────────────────────────────────
-- 03_crm_operational_view_distribution
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'crm_view_buckets' AS check_id, mesa_operacional, count(*) AS n
FROM public.crm_operational_view
GROUP BY mesa_operacional
ORDER BY n DESC;
-- Expected buckets: lead, agendado, paciente, orcamento, paciente_orcamento,
-- perdido, arquivado

SELECT 'crm_view_paciente_orcamento_present' AS check_id,
       EXISTS (SELECT 1 FROM public.crm_operational_view WHERE mesa_operacional = 'paciente_orcamento') AS present;


-- ────────────────────────────────────────────────────────────────────────────
-- 04_rpc_function_inventory
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'rpc_inventory' AS check_id,
       p.proname AS function_name,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       l.lanname AS lang,
       pg_get_function_result(p.oid) AS returns_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN (
    'appointment_finalize','appointment_change_status','appointment_attend',
    'lead_to_appointment','lead_to_paciente','lead_to_orcamento',
    'lead_lost','perdido_to_lead','lead_recovery_activate',
    'sdr_change_phase','leads_bulk_change_phase','_sdr_record_phase_change',
    '_appointment_status_transition_allowed','_lead_phase_transition_allowed'
  )
ORDER BY p.proname;
-- Expected: 14 rows (all RPCs present)


-- ────────────────────────────────────────────────────────────────────────────
-- 05_trigger_inventory
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'trigger_inventory' AS check_id,
       n.nspname || '.' || c.relname AS table_full,
       t.tgname AS trigger_name,
       pn.nspname || '.' || p.proname AS function_name,
       CASE t.tgenabled WHEN 'O' THEN 'enabled' ELSE 'disabled' END AS state
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace pn ON pn.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'leads','appointments','perdidos','wa_outbox','agenda_alerts_log',
    'wa_messages','wa_conversations','patients','phase_history','orcamentos'
  )
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;


-- ────────────────────────────────────────────────────────────────────────────
-- 06_wa_outbox_sources_and_health
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'wa_outbox_by_status' AS check_id, status, count(*) AS n
FROM public.wa_outbox
GROUP BY status
ORDER BY n DESC;

SELECT 'wa_outbox_health' AS check_id,
       count(*) FILTER (WHERE content IS NULL OR content = '') AS empty_content,
       count(*) FILTER (WHERE phone IS NULL OR phone = '') AS empty_phone,
       count(*) FILTER (WHERE lead_id IS NULL) AS missing_lead_id,
       count(*) FILTER (WHERE status IN ('queued','pending','retry') AND created_at < now() - interval '1 hour') AS pending_old_1h
FROM public.wa_outbox;
-- Expected after migs 156/158: empty_content=0, empty_phone=0, missing_lead_id=0


-- ────────────────────────────────────────────────────────────────────────────
-- 07_wa_agenda_automations
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'agenda_automations_by_trigger' AS check_id, trigger_type,
       count(*) FILTER (WHERE is_active) AS active,
       count(*) FILTER (WHERE NOT is_active) AS inactive
FROM public.wa_agenda_automations
GROUP BY trigger_type
ORDER BY active DESC;

SELECT 'agenda_automations_empty_templates' AS check_id,
       id, name, trigger_type, channel,
       length(coalesce(content_template,'')) AS content_template_len,
       length(coalesce(alert_title,'')) AS alert_title_len
FROM public.wa_agenda_automations
WHERE is_active = true
  AND (content_template IS NULL OR length(trim(content_template)) = 0)
  AND (alert_title IS NULL OR length(trim(alert_title)) = 0);
-- Expected: 0 rows (mig 158 fallback chain only triggers '[Alerta] kind')


-- ────────────────────────────────────────────────────────────────────────────
-- 08_confirmation_preconsulta
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'confirmation_rules_d_minus_1' AS check_id,
       count(*) FILTER (WHERE is_active) AS active_d_before_count
FROM public.wa_agenda_automations
WHERE trigger_type = 'd_before';

SELECT 'confirmation_rules_d_zero' AS check_id,
       count(*) FILTER (WHERE is_active) AS active_d_zero_count
FROM public.wa_agenda_automations
WHERE trigger_type = 'd_zero';

-- Tick fn coverage check: is there a tick fn that processes these?
SELECT 'tick_fn_for_d_before' AS check_id,
       EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public'
           AND (p.proname ILIKE '%d_before%tick%'
                OR p.proname ILIKE '%confirmation%tick%'
                OR p.proname ILIKE '%agenda%confirm%tick%')
       ) AS tick_fn_exists;
-- IF FALSE → rules orphaned, no scheduler picks them up

SELECT 'tick_fn_for_d_after' AS check_id,
       EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public'
           AND (p.proname ILIKE '%d_after%tick%'
                OR p.proname ILIKE '%pos_consulta%tick%'
                OR p.proname ILIKE '%followup%appointment%tick%')
       ) AS tick_fn_exists;
-- IF FALSE → D+1/D+3/D+7 rules orphaned


-- ────────────────────────────────────────────────────────────────────────────
-- 09_arrival_clinic_flow
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'arrival_status_distribution' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status IN ('aguardando','na_clinica','em_atendimento','em_consulta')
GROUP BY status;

SELECT 'arrival_columns_present' AS check_id,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='appointments'
           AND column_name IN ('chegada_em','cancelado_em','no_show_em')) AS arrival_timestamp_cols;
-- Expected: 3 (chegada_em, cancelado_em, no_show_em existem per mig 62)


-- ────────────────────────────────────────────────────────────────────────────
-- 10_anamnese_inventory
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'anamnese_tables_candidate' AS check_id, table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND (table_name ILIKE '%anamnese%'
       OR table_name ILIKE '%anamnesis%'
       OR table_name ILIKE '%intake%'
       OR table_name ILIKE '%prontuario%'
       OR table_name ILIKE '%clinical%'
       OR table_name ILIKE '%medical%');

-- Defensive: only run row count IF table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='anamnesis_requests') THEN
    RAISE NOTICE 'anamnesis_requests exists (read-only audit ends here)';
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- 11_consent_inventory
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'consent_tables_candidate' AS check_id, table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND (table_name ILIKE '%consent%'
       OR table_name ILIKE '%consentimento%'
       OR table_name ILIKE '%termo%'
       OR table_name ILIKE '%signature%'
       OR table_name ILIKE '%assinatura%');

SELECT 'appointments_consent_field' AS check_id,
       count(*) AS appts_with_consent_field,
       count(*) FILTER (WHERE consentimento_img IS NULL OR consentimento_img = 'pendente') AS pending_consent
FROM public.appointments
WHERE deleted_at IS NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 12_finalization_outcomes
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'finalized_appointments' AS check_id,
       count(*) AS total_finalized
FROM public.appointments
WHERE status = 'finalizado' AND deleted_at IS NULL;

SELECT 'leads_to_paciente_count' AS check_id,
       (SELECT count(*) FROM public.leads WHERE phase='paciente' AND deleted_at IS NULL) AS lead_phase_paciente,
       (SELECT count(*) FROM public.patients) AS patients_table_count,
       (SELECT count(*) FROM public.leads WHERE phase='orcamento' AND deleted_at IS NULL) AS lead_phase_orcamento,
       (SELECT count(*) FROM public.orcamentos) AS orcamentos_table_count;

SELECT 'phase_history_origins' AS check_id, origin, count(*) AS n
FROM public.phase_history
GROUP BY origin;


-- ────────────────────────────────────────────────────────────────────────────
-- 13_post_consultation_followups
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'd_after_rules_active' AS check_id, name, trigger_config, channel, recipient_type
FROM public.wa_agenda_automations
WHERE trigger_type = 'd_after' AND is_active = true
ORDER BY (trigger_config->>'days')::int;

-- Quem dispara estas regras? Procurar tick fn que filtre por d_after.
SELECT 'tick_fn_for_d_after_check' AS check_id,
       EXISTS (
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public'
           AND (p.proname ILIKE '%d_after%' OR p.proname ILIKE '%pos_consulta%' OR p.proname ILIKE '%appointment_followup%')
       ) AS specific_tick_fn_exists;
-- Expected (per audit): FALSE → these rules are CONFIGURED but ORPHAN


-- ────────────────────────────────────────────────────────────────────────────
-- 14_legacy_terms_global_scan_hint
-- ────────────────────────────────────────────────────────────────────────────
-- These terms must NOT appear in appointments.status / leads.phase values:
-- compareceu, reagendado (as phase, not appt status), pre_consulta, em_consulta,
-- attending, converted
-- Already covered by blocks 01 and 02. Use grep on code for TS-side:
-- rg -n "compareceu|pre_consulta|em_consulta|attending|converted" apps/ packages/


-- ────────────────────────────────────────────────────────────────────────────
-- 99_final_verdict_inputs
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_verdict_flags' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT active = false FROM cron.job WHERE jobid=71),
  'job72_on',     (SELECT active = true  FROM cron.job WHERE jobid=72),
  'outbox_pending_count', (SELECT count(*) FROM public.wa_outbox WHERE status IN ('queued','pending','retry')),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')),
  'invalid_lead_phase_count', (
    SELECT count(*) FROM public.leads
    WHERE deleted_at IS NULL AND phase NOT IN ('lead','agendado','paciente','orcamento')),
  'perdido_as_phase_count', (
    SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase='perdido'),
  'invalid_lifecycle_count', (
    SELECT count(*) FROM public.leads
    WHERE deleted_at IS NULL AND lifecycle_status NOT IN ('ativo','perdido','recuperacao','arquivado')),
  'empty_content_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content=''),
  'empty_phone_count',   (SELECT count(*) FROM public.wa_outbox WHERE phone IS NULL OR phone=''),
  'missing_lead_id_count', (SELECT count(*) FROM public.wa_outbox WHERE lead_id IS NULL)
) AS verdict;
-- All numeric flags should be 0 · boolean flags should match expected state.
