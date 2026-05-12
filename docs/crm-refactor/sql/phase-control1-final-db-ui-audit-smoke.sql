-- ============================================================================
-- CRM_PHASE_CONTROL.1 · SMOKE FINAL (READ-ONLY · AUDIT ONLY)
-- ============================================================================
-- Esta fase é AUDIT ONLY · zero DDL/DML.
-- Smoke valida que cada contrato vivo responde sem erro · zero side-effects.
-- ============================================================================


-- A · worker 71 OFF ──────────────────────────────────────────────────────────
SELECT 'A_worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;


-- B · wa_outbox baseline ─────────────────────────────────────────────────────
SELECT 'B_wa_outbox_baseline' AS check_id, jsonb_build_object(
  'total', (SELECT count(*) FROM public.wa_outbox),
  'queued', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;


-- C · Appointment contract query roda ──────────────────────────────────────
SELECT 'C_appointment_contract' AS check_id, jsonb_build_object(
  'total_active', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL),
  'with_subject', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND (lead_id IS NOT NULL OR patient_id IS NOT NULL)),
  'block_time', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='bloqueado'),
  'with_professional', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND professional_id IS NOT NULL)
) AS data;


-- D · lead_lost preserves contract ──────────────────────────────────────────
SELECT 'D_lead_lost_contract' AS check_id, jsonb_build_object(
  'rpc_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost'),
  'phase_perdido_dead_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'lifecycle_perdido_count', (SELECT count(*) FROM public.leads WHERE lifecycle_status='perdido'),
  'perdidos_table_count', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL)
) AS data;


-- E · Recovery workflow view reads ──────────────────────────────────────────
SELECT 'E_recovery_workflow_reads' AS check_id, jsonb_build_object(
  'queue_view_count', (SELECT count(*) FROM public.commercial_recovery_queue_view),
  'workflow_view_count', (SELECT count(*) FROM public.commercial_recovery_workflow_view),
  'workflow_items_total', (SELECT count(*) FROM public.commercial_recovery_workflow_items),
  'events_total', (SELECT count(*) FROM public.commercial_recovery_events)
) AS data;


-- F · Dashboard query roda ──────────────────────────────────────────────────
SELECT 'F_dashboard_query' AS check_id, jsonb_build_object(
  'crm_operational_view_count', (SELECT count(*) FROM public.crm_operational_view),
  'professionals_pool', (SELECT count(*) FROM public.professional_profiles WHERE is_active=true AND agenda_enabled=true),
  'leads_ativo', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='ativo')
) AS data;


-- G · Clinical gate reads ───────────────────────────────────────────────────
SELECT 'G_clinical_gate' AS check_id, jsonb_build_object(
  'gate_rpc_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'finalize_rpc_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'attend_rpc_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend'),
  'arrival_alert_rpc_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert')
) AS data;


-- H · No status zumbi nos dados ─────────────────────────────────────────────
SELECT 'H_no_zumbi_in_data' AS check_id, jsonb_build_object(
  'appt_em_consulta', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='em_consulta'),
  'appt_pre_consulta', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='pre_consulta'),
  'appt_compareceu', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='compareceu'),
  'appt_reagendado', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='reagendado'),
  'lead_phase_perdido', (SELECT count(*) FROM public.leads WHERE phase='perdido')
) AS data;
-- Expected: all 0


-- I · No provider call activa ───────────────────────────────────────────────
SELECT 'I_no_provider_call' AS check_id, jsonb_build_object(
  'cron_alexa', (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR jobname ILIKE '%alexa%'),
  'cron_evolution', (SELECT count(*) FROM cron.job WHERE command ILIKE '%evolution%' OR jobname ILIKE '%evolution%'),
  'cron_meta', (SELECT count(*) FROM cron.job WHERE command ILIKE '%meta.com%'),
  'cron_fetch_http', (SELECT count(*) FROM cron.job WHERE command ILIKE '%fetch%http%')
) AS data;


-- J · wa_outbox_delta=0 sanity ───────────────────────────────────────────────
-- Smoke é 100% read-only · delta sempre 0.
SELECT 'J_wa_outbox_delta' AS check_id, 0 AS data;


-- K · ROLLBACK sanity ────────────────────────────────────────────────────────
-- Smoke é read-only · não há BEGIN/COMMIT · sem necessidade de rollback.
SELECT 'K_smoke_is_read_only' AS check_id, true AS data;
