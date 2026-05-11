-- ============================================================================
-- FASE 2D.3B.2 · VALIDATION · agenda alert automation hardening
-- ============================================================================
-- Rode após apply da mig 156 · cole outputs no chat.
-- Todas SELECT read-only (zero mutação).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · Definições atuais
-- ─────────────────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public._agenda_alert_min_before_tick()'::regprocedure)
  AS def_min_before_tick;

SELECT pg_get_functiondef('public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure)
  AS def_enqueue_agenda_alert;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · Tokens esperados em _agenda_alert_min_before_tick
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef('public._agenda_alert_min_before_tick()'::regprocedure) AS def
)
SELECT
  position('a.id::text' IN def) > 0                              AS has_cast_id_text,
  position('l.appt_id = a.id::text' IN def) > 0                  AS has_correct_comparison,
  position('l.appt_id = a.id' IN def) >
    position('a.id::text' IN def) - 20                           AS bug_below_cast,
  position('wa_agenda_automations' IN def) > 0                   AS mentions_wa_agenda_automations,
  position('agenda_alerts_log' IN def) > 0                       AS mentions_agenda_alerts_log
FROM d;
-- Esperado:
--   has_cast_id_text = true
--   has_correct_comparison = true
--   bug_below_cast irrelevante (info pra olhar pos manual)
--   mentions_wa_agenda_automations = true
--   mentions_agenda_alerts_log = true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · Tokens esperados em _enqueue_agenda_alert
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef('public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure) AS def
)
SELECT
  position('p_appt.lead_id' IN def) > 0                              AS uses_lead_id,
  position('p_appt.patient_id' IN def) > 0                           AS uses_patient_id_anywhere,
  position('COALESCE(p_appt.lead_id, p_appt.patient_id)' IN def) > 0 AS uses_legacy_coalesce,
  position('p_appt.lead_id IS NULL' IN def) > 0                      AS has_null_guard,
  position('INSERT INTO public.wa_outbox' IN def) > 0
    OR position('insert into public.wa_outbox' IN def) > 0           AS has_insert_wa_outbox,
  position('ON CONFLICT (appt_id, alert_kind)' IN def) > 0           AS has_on_conflict
FROM d;
-- Esperado:
--   uses_lead_id = true
--   uses_patient_id_anywhere = false
--   uses_legacy_coalesce = false
--   has_null_guard = true
--   has_insert_wa_outbox = true
--   has_on_conflict = true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · Unique constraint em agenda_alerts_log(appt_id, alert_kind)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  c.conname,
  c.contype,
  pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'agenda_alerts_log'
ORDER BY c.contype, c.conname;
-- Esperado: presente: PK em id, FK em clinic_id, UNIQUE em (appt_id, alert_kind)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-5 · agenda_alerts_log baseline (zero rows)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS total_rows FROM public.agenda_alerts_log;
-- Esperado: 0 (mig não cria rows)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-6 · SECURITY DEFINER + grants preservados
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  (SELECT array_agg(pg_get_userbyid(a.grantee) || ':' || a.privilege_type)
   FROM aclexplode(p.proacl) a) AS grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('_agenda_alert_min_before_tick','_enqueue_agenda_alert')
ORDER BY p.proname, args;
-- Esperado: security_definer = true em ambas · grants idênticos ao pré-apply

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-7 · Tracker registra mig 156
-- ─────────────────────────────────────────────────────────────────────────────
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260800000156';

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-8 · wa_outbox.lead_id continua NOT NULL (schema intocado)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'wa_outbox'
  AND column_name = 'lead_id';
-- Esperado: data_type='uuid', is_nullable='NO'

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-9 · Cron jobs inalterados
-- ─────────────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobid IN (12, 71, 72)
   OR jobname IN ('daily-agenda-summary','wa_outbox_worker_tick','agenda_alert_min_before_tick')
ORDER BY jobid;
-- Esperado: 12 active=true · 71 active=false · 72 active=false (todos inalterados)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-10 · Deltas (zero rows novas em wa_outbox/appointments/agenda_alerts_log)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '5 minutes') AS wa_outbox_last_5min,
  (SELECT count(*) FROM public.appointments WHERE updated_at >= now() - interval '5 minutes' AND deleted_at IS NULL) AS appts_modified_last_5min,
  (SELECT count(*) FROM public.agenda_alerts_log WHERE created_at >= now() - interval '5 minutes') AS agenda_alerts_log_last_5min;
-- Esperado: todos = 0 (mig é só DDL · zero DML)
