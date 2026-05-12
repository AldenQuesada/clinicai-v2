-- ============================================================================
-- CRM_PHASE_2ALEXA.1 · SMOKE (READ-ONLY)
-- ============================================================================
-- UI polish · smoke é apenas confirmação de contrato DB. Manual UI checks
-- estão no doc 98.
-- ============================================================================

-- A · worker71_off ─────────────────────────────────────────────────────────
SELECT 'A_worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

-- B · wa_outbox baseline ──────────────────────────────────────────────────
SELECT 'B_wa_outbox_baseline' AS check_id, jsonb_build_object(
  'queued', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;

-- C · appointment_internal_alerts existe ──────────────────────────────────
SELECT 'C_internal_alerts_table' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts') AS data;

-- D · appointment_arrival_internal_alert existe ────────────────────────────
SELECT 'D_arrival_rpc_exists' AS check_id,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert') AS data;

-- E · appointment_attend existe ───────────────────────────────────────────
SELECT 'E_attend_rpc_exists' AS check_id,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend') AS data;

-- F · invalid statuses 0 ──────────────────────────────────────────────────
SELECT 'F_invalid_statuses' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

-- G · phase_perdido 0 ─────────────────────────────────────────────────────
SELECT 'G_phase_perdido' AS check_id, count(*) AS n FROM public.leads WHERE phase='perdido';

-- H · provider cron 0 ────────────────────────────────────────────────────
SELECT 'H_provider_cron' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%';

-- I · Alexa authenticated grants (CONTROL.2 revogou) ─────────────────────
SELECT 'I_alexa_authenticated_grants' AS check_id, count(*) AS n
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name ILIKE '%alexa%'
  AND grantee='authenticated' AND privilege_type='EXECUTE';
