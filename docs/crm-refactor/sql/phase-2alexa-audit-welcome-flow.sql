-- ============================================================================
-- CRM_PHASE_2ALEXA.AUDIT · WELCOME FLOW AUDIT (READ-ONLY)
-- ============================================================================
-- Zero INSERT/UPDATE/DELETE · zero RPC mutável · apenas SELECT/inspeção.
-- Confirma: gate de envio · estado da chegada · arquitetura de alertas internos
-- já entregue (mig 161) · inventário Alexa zumbi no DB (16 funções dormentes).
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


-- 01 ARRIVAL EVENTS ──────────────────────────────────────────────────────────
SELECT 'appt_recent_arrival_states' AS check_id, jsonb_object_agg(status, n) AS data
FROM (
  SELECT status, count(*) AS n
  FROM public.appointments
  WHERE deleted_at IS NULL
    AND status IN ('na_clinica','aguardando','em_atendimento','finalizado')
    AND (chegada_em IS NOT NULL OR updated_at >= now() - interval '30 days')
  GROUP BY status
) s;

SELECT 'appt_with_chegada_em_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND chegada_em IS NOT NULL;

SELECT 'internal_alerts_total' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts;

SELECT 'internal_alerts_by_kind' AS check_id, jsonb_object_agg(alert_kind, n) AS data
FROM (
  SELECT alert_kind, count(*) AS n
  FROM public.appointment_internal_alerts
  GROUP BY alert_kind
) s;

SELECT 'arrival_alerts_by_target_role' AS check_id, jsonb_object_agg(target_role, n) AS data
FROM (
  SELECT target_role, count(*) AS n
  FROM public.appointment_internal_alerts
  WHERE alert_kind = 'arrival'
  GROUP BY target_role
) s;

SELECT 'arrival_unread_count' AS check_id, count(*) AS n
FROM public.appointment_internal_alerts
WHERE alert_kind = 'arrival' AND is_read = false;


-- 02 FUNCTIONS INVENTORY ─────────────────────────────────────────────────────
SELECT 'arrival_functions' AS check_id,
       jsonb_agg(jsonb_build_object(
         'name', p.proname,
         'language', l.lanname,
         'is_security_definer', p.prosecdef,
         'volatility', CASE p.provolatile WHEN 'i' THEN 'immutable' WHEN 's' THEN 'stable' WHEN 'v' THEN 'volatile' END
       ) ORDER BY p.proname) AS data
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND (p.proname ILIKE '%arrival%'
       OR p.proname ILIKE '%patient_arrived%'
       OR p.proname ILIKE '%chegada%'
       OR p.proname = 'appointment_attend'
       OR p.proname = 'appointment_internal_alert_create'
       OR p.proname = 'appointment_internal_alert_mark_read'
       OR p.proname = 'appointment_arrival_internal_alert');

SELECT 'welcome_functions' AS check_id,
       jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND (p.proname ILIKE '%welcome%'
       OR p.proname ILIKE '%boas_vindas%');

SELECT 'alexa_functions_inventory' AS check_id,
       jsonb_agg(jsonb_build_object(
         'name', p.proname,
         'is_security_definer', p.prosecdef,
         'language', l.lanname
       ) ORDER BY p.proname) AS data
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname ILIKE '%alexa%';
-- Expected: 9 RPCs Alexa (alexa_log_announce/update/metrics/pending_queue +
-- delete_alexa_device + get_alexa_config/devices + upsert_alexa_config/device).
-- ZUMBI · existem no DB mas UI v2 não invoca · legacy invoca via webhook externo.


-- 03 TRIGGER INVENTORY ───────────────────────────────────────────────────────
SELECT 'appointments_triggers' AS check_id,
       jsonb_agg(jsonb_build_object(
         'name', tg.tgname,
         'function', p.proname,
         'event', CASE
           WHEN (tg.tgtype & 2) != 0 THEN 'BEFORE'
           WHEN (tg.tgtype & 64) != 0 THEN 'INSTEAD OF'
           ELSE 'AFTER'
         END,
         'row_or_stmt', CASE WHEN (tg.tgtype & 1) != 0 THEN 'ROW' ELSE 'STATEMENT' END
       ) ORDER BY tg.tgname) AS data
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_proc p ON p.oid = tg.tgfoid
WHERE c.relname = 'appointments' AND NOT tg.tgisinternal;
-- Expected: 2 triggers · normalize_phone + updated_at (sem trigger de arrival).
-- Arrival é orchestrado pelo TS após `appointment_attend` (best-effort).

SELECT 'internal_alerts_triggers' AS check_id,
       jsonb_agg(jsonb_build_object('name', tg.tgname, 'function', p.proname) ORDER BY tg.tgname) AS data
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_proc p ON p.oid = tg.tgfoid
WHERE c.relname = 'appointment_internal_alerts' AND NOT tg.tgisinternal;
-- Expected: nenhum (apenas writes via RPC SECURITY DEFINER).


-- 04 CANDIDATE EVENT DATA ────────────────────────────────────────────────────
-- Compara cobertura potencial:
--   na_clinica/em_atendimento/finalizado (status canônico)
--   chegada_em (timestamp da chegada · canon mig 161)
--   appointment_attend RPC (entry point único · idempotente)
SELECT 'attend_rpc_signature' AS check_id, jsonb_build_object(
  'exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend'),
  'arrival_alert_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert')
) AS data;

SELECT 'arrival_alert_payload_sample' AS check_id, jsonb_build_object(
  'sample_payload_keys',
  COALESCE((
    SELECT jsonb_agg(DISTINCT k ORDER BY k)
    FROM public.appointment_internal_alerts, jsonb_object_keys(payload) AS k
    WHERE alert_kind = 'arrival'
  ), '[]'::jsonb)
) AS data;

SELECT 'clinic_rooms_alexa_field_exists' AS check_id,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clinic_rooms'
      AND column_name='alexa_device_name'
  ) AS data;
-- Legacy esperava clinic_rooms.alexa_device_name · valida se schema legacy
-- ainda existe.

SELECT 'clinic_alexa_config_table_exists' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_alexa_config') AS data;

SELECT 'alexa_devices_table_exists' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='alexa_devices') AS data;

SELECT 'alexa_announce_log_table_exists' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='alexa_announce_log') AS data;

-- Detecta se algum cron job atual chama Alexa ou WhatsApp · esperado: NENHUM
SELECT 'cron_alexa_calls' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%alexa%' OR jobname ILIKE '%alexa%';
-- Expected: 0


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_2alexa_audit' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'no_provider_call',
    NOT EXISTS (SELECT 1 FROM cron.job WHERE command ILIKE '%alexa%' OR jobname ILIKE '%alexa%'),
  'arrival_event_exists',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert'),
  'internal_alert_path_exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts'),
  'alexa_rpcs_dormant_count',
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname ILIKE '%alexa%'),
  'arrival_alerts_total',
    (SELECT count(*) FROM public.appointment_internal_alerts WHERE alert_kind='arrival'),
  'unsafe_outbox_count',
    (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'can_open_alexa_implementation_plan', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts')
    AND NOT EXISTS (SELECT 1 FROM cron.job WHERE command ILIKE '%alexa%' OR jobname ILIKE '%alexa%')
  )
) AS data;
