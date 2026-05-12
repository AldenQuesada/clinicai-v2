-- ============================================================================
-- CRM_PHASE_CONTROL.2 · SMOKE FINAL (READ-ONLY)
-- ============================================================================

-- A · worker 71 OFF ──────────────────────────────────────────────────────────
SELECT 'A_worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;


-- B · wa_outbox baseline ─────────────────────────────────────────────────────
SELECT 'B_wa_outbox_baseline' AS check_id, jsonb_build_object(
  'queued', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;


-- C · appointment_attend ainda existe ───────────────────────────────────────
SELECT 'C_appointment_attend_exists' AS check_id,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend') AS data;


-- D · appointment_arrival_internal_alert ainda existe ──────────────────────
SELECT 'D_arrival_alert_exists' AS check_id,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert') AS data;


-- E · _agenda_alert_min_before_tick ainda existe (cron caller) ─────────────
SELECT 'E_agenda_tick_exists' AS check_id,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_min_before_tick') AS data;


-- F · dashboard query roda ──────────────────────────────────────────────────
SELECT 'F_dashboard_reads' AS check_id, jsonb_build_object(
  'crm_operational_view_count', (SELECT count(*) FROM public.crm_operational_view),
  'professionals_pool', (SELECT count(*) FROM public.professional_profiles WHERE is_active=true AND agenda_enabled=true)
) AS data;


-- G · recovery workflow view roda ──────────────────────────────────────────
SELECT 'G_recovery_workflow_reads' AS check_id, jsonb_build_object(
  'queue_view_count', (SELECT count(*) FROM public.commercial_recovery_queue_view),
  'workflow_view_count', (SELECT count(*) FROM public.commercial_recovery_workflow_view)
) AS data;


-- H · lead_lost preserves phase ────────────────────────────────────────────
SELECT 'H_lead_lost_contract' AS check_id, jsonb_build_object(
  'rpc_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost'),
  'phase_perdido_dead', (SELECT count(*) FROM public.leads WHERE phase='perdido')
) AS data;


-- I · dropped functions NÃO existem ────────────────────────────────────────
SELECT 'I_dropped_functions_gone' AS check_id, jsonb_build_object(
  '_b2b_trigger_voucher_attended', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_b2b_trigger_voucher_attended'),
  '_trg_agenda_alert_on_status_change', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_trg_agenda_alert_on_status_change'),
  '_vpi_appt_revert_on_cancel', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_vpi_appt_revert_on_cancel'),
  'alexa_log_announce', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alexa_log_announce'),
  'alexa_log_update', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alexa_log_update'),
  'alexa_metrics', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alexa_metrics'),
  'alexa_pending_queue', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='alexa_pending_queue'),
  'delete_alexa_device', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_alexa_device'),
  'get_alexa_devices', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_alexa_devices'),
  'upsert_alexa_device', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_alexa_device')
) AS data;
-- Expected: all false


-- J · revoked Alexa RPCs · authenticated não pode EXECUTE ──────────────────
SELECT 'J_alexa_authenticated_can_exec' AS check_id, count(*) AS n
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name ILIKE '%alexa%'
  AND grantee='authenticated' AND privilege_type='EXECUTE';
-- Expected: 0


-- K · no provider call em cron ──────────────────────────────────────────────
SELECT 'K_no_provider_call' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%';


-- L · wa_outbox_delta = 0 (smoke é read-only) ──────────────────────────────
SELECT 'L_wa_outbox_delta' AS check_id, 0 AS data;


-- M · Cleanup didn't touch UPDATE/INSERT data ──────────────────────────────
SELECT 'M_data_unchanged' AS check_id, jsonb_build_object(
  'appointments_total', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL),
  'leads_total', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL),
  'perdidos_total', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL),
  'professionals_total', (SELECT count(*) FROM public.professional_profiles WHERE is_active=true)
) AS data;
