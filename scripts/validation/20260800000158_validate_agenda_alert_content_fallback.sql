-- ============================================================================
-- FASE 2D.3G.2 · VALIDATION · agenda alert content fallback hardening
-- ============================================================================
-- Rode após apply da mig 158 · cole outputs no chat.
-- Todas SELECT read-only (zero mutação).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · _enqueue_agenda_alert contém NULLIF no render de content_template
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  ) AS def
)
SELECT
  position('NULLIF(public._render_appt_template(p_rule.content_template, p_appt), '''')' IN def) > 0
    AS has_nullif_content_template
FROM d;
-- Esperado: true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · _enqueue_agenda_alert contém NULLIF no render de alert_title
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  ) AS def
)
SELECT
  position('NULLIF(public._render_appt_template(p_rule.alert_title, p_appt), '''')' IN def) > 0
    AS has_nullif_alert_title
FROM d;
-- Esperado: true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · _enqueue_agenda_alert NÃO contém o padrão bugado (sem NULLIF)
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  ) AS def
)
SELECT
  position(
    'coalesce(' || E'\n' ||
    '    public._render_appt_template(p_rule.content_template, p_appt),' || E'\n' ||
    '    public._render_appt_template(p_rule.alert_title, p_appt),'
    IN def
  ) > 0 AS has_old_bug_pattern
FROM d;
-- Esperado: false

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · _enqueue_agenda_alert ainda insere em wa_outbox
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  ) AS def
)
SELECT
  position('INSERT INTO public.wa_outbox' IN def) > 0 AS inserts_wa_outbox
FROM d;
-- Esperado: true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-5 · _enqueue_agenda_alert ainda usa p_appt.lead_id
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  ) AS def
)
SELECT
  position('p_appt.lead_id' IN def) > 0 AS uses_p_appt_lead_id
FROM d;
-- Esperado: true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-6 · _enqueue_agenda_alert NÃO usa p_appt.patient_id
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  ) AS def
)
SELECT
  position('p_appt.patient_id' IN def) > 0 AS uses_p_appt_patient_id
FROM d;
-- Esperado: false

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-7 · _enqueue_agenda_alert ainda tem guard p_appt.lead_id IS NULL
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  ) AS def
)
SELECT
  position('p_appt.lead_id IS NULL' IN def) > 0 AS has_lead_id_null_guard
FROM d;
-- Esperado: true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-8 · _enqueue_agenda_alert ainda mantém ON CONFLICT (appt_id, alert_kind)
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  ) AS def
)
SELECT
  position('ON CONFLICT (appt_id, alert_kind)' IN def) > 0 AS has_on_conflict
FROM d;
-- Esperado: true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-9 · _render_appt_template INALTERADA (não tocada por mig 158)
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef('public._render_appt_template(text, record)'::regprocedure) AS def
)
SELECT
  length(def) AS def_chars,
  position('CREATE OR REPLACE FUNCTION public._render_appt_template' IN def) > 0
    AS still_exists
FROM d;
-- Esperado: still_exists=true; def_chars > 0 (mesma assinatura preservada)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-10 · _agenda_alert_min_before_tick INALTERADA (não tocada por mig 158)
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef('public._agenda_alert_min_before_tick()'::regprocedure) AS def
)
SELECT
  position('l.appt_id = a.id::text' IN def) > 0 AS still_has_mig156_cast,
  position('public._appt_professional_phone(r_appt)' IN def) > 0 AS still_calls_phone_helper
FROM d;
-- Esperado: still_has_mig156_cast=true, still_calls_phone_helper=true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-11 · wa_outbox delta = 0 (nenhum insert durante apply)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS wa_outbox_last_5min
FROM public.wa_outbox
WHERE created_at >= now() - interval '5 minutes';
-- Esperado: 0

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-12 · agenda_alerts_log delta = 0
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS agenda_alerts_log_last_5min
FROM public.agenda_alerts_log
WHERE created_at >= now() - interval '5 minutes';
-- Esperado: 0

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-13 · appointments delta = 0 (apenas mig 157 fez UPDATE · esta não toca)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS appointments_total FROM public.appointments;
-- Esperado: 5 (idêntico ao pós-mig 157)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-14 · job 12 (daily-agenda-summary) continua ativo
-- ─────────────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, active
FROM cron.job
WHERE jobid = 12;
-- Esperado: active=true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-15 · job 71 (wa_outbox_worker_tick) continua false
-- ─────────────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, active
FROM cron.job
WHERE jobid = 71;
-- Esperado: active=false

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-16 · job 72 (agenda_alert_min_before_tick) continua false
-- ─────────────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, active
FROM cron.job
WHERE jobid = 72;
-- Esperado: active=false

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-17 · Tracker registra mig 158
-- ─────────────────────────────────────────────────────────────────────────────
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260800000158';
-- Esperado: { version: '20260800000158', name: 'repair_marker' }
