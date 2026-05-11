-- ============================================================================
-- FASE 2D.3A.3.2 · VALIDATION · wa_daily_summary lead_id NOT NULL safety
-- ============================================================================
-- Rode após apply da mig 155 · cole outputs no chat.
-- Todas SELECT/DO read-only (zero mutação).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · Definição atual de wa_daily_summary
-- ─────────────────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.wa_daily_summary()'::regprocedure) AS wa_daily_summary_def;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · Tokens esperados na definição
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef('public.wa_daily_summary()'::regprocedure) AS def
)
SELECT
  position('patient_name'                                 IN def) > 0  AS mentions_patient_name,
  position('subject_name'                                 IN def) > 0  AS mentions_subject_name,
  position('v_summary_lead_id'                            IN def) > 0  AS has_v_summary_lead_id,
  position('v_summary_lead_id is null'                    IN def) > 0
    OR position('v_summary_lead_id IS NULL'               IN def) > 0  AS guards_summary_lead_id_null,
  position('INSERT INTO public.wa_outbox'                 IN def) > 0
    OR position('insert into public.wa_outbox'            IN def) > 0  AS has_insert_wa_outbox,
  position('v_clinic_id, null, v_phone'                   IN def) > 0
    OR position('v_clinic_id,' || chr(10) || '      null,'  IN def) > 0
    OR position('v_clinic_id,' || chr(10) || '      NULL,'  IN def) > 0
                                                                       AS has_legacy_null_pattern
FROM d;
-- Esperado:
--   mentions_patient_name        = false
--   mentions_subject_name        = true
--   has_v_summary_lead_id        = true
--   guards_summary_lead_id_null  = true
--   has_insert_wa_outbox         = true
--   has_legacy_null_pattern      = false

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · SECURITY DEFINER preservado
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  l.lanname   AS language
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public' AND p.proname = 'wa_daily_summary';
-- Esperado: security_definer = true, language = plpgsql

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · Grants preservados
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  pg_get_userbyid(a.grantee) AS grantee,
  a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
WHERE n.nspname = 'public' AND p.proname = 'wa_daily_summary'
ORDER BY grantee;
-- Esperado: postgres + service_role + authenticated com EXECUTE (idênticos à pré-mig 155)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-5 · Tracker registra mig 155
-- ─────────────────────────────────────────────────────────────────────────────
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260800000155';

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-6 · wa_outbox.lead_id continua NOT NULL (schema intocado)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name   = 'wa_outbox'
  AND c.column_name  = 'lead_id';
-- Esperado: data_type='uuid', is_nullable='NO', column_default=null

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-7 · Cron jobs inalterados
-- ─────────────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobid IN (12, 71, 72)
   OR jobname IN ('daily-agenda-summary','wa_outbox_worker_tick','agenda_alert_min_before_tick')
ORDER BY jobid;
-- Esperado:
--   12 daily-agenda-summary           active=true  (preservado)
--   71 wa_outbox_worker_tick          active=false (preservado)
--   72 agenda_alert_min_before_tick   active=false (preservado)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-8 · Distribuição appointments baseline (zero mutação esperada)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE deleted_at IS NULL)                                AS total_not_deleted,
  count(*) FILTER (WHERE deleted_at IS NULL AND lead_id IS NOT NULL)        AS with_lead_id,
  count(*) FILTER (WHERE deleted_at IS NULL AND patient_id IS NOT NULL)     AS with_patient_id,
  count(*) FILTER (WHERE deleted_at IS NULL AND lead_id IS NULL AND patient_id IS NULL AND status <> 'bloqueado') AS invalid_real_without_subject,
  count(*) FILTER (WHERE deleted_at IS NULL AND status = 'bloqueado')       AS blocked_without_subject
FROM public.appointments;
-- Esperado: idêntico ao snapshot do prompt (3 / 1 / 2 / 0 / 0)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-9 · Distribuição wa_outbox (sanity · zero rows novas durante apply)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE created_at >= now() - interval '5 minutes')              AS rows_last_5min,
  count(*) FILTER (WHERE appt_ref LIKE 'daily_summary_%' AND created_at >= now() - interval '5 minutes') AS daily_summary_last_5min
FROM public.wa_outbox;
-- Esperado: ambos = 0 (mig 155 não executa wa_daily_summary · só CREATE OR REPLACE)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-10 · Dry-run lógico do guard de v_summary_lead_id null
-- ─────────────────────────────────────────────────────────────────────────────
-- Simula o SELECT que a função roda · não escreve nada.
-- Para cada profissional/dia futuro existente, retorna o lead_id que seria
-- usado. NULL = pulado pela função (cenário patient-only).
SELECT
  a.scheduled_date,
  a.professional_name,
  count(*) AS appts_total,
  count(*) FILTER (WHERE a.lead_id IS NOT NULL) AS appts_with_lead,
  (
    SELECT a2.lead_id
    FROM public.appointments a2
    WHERE a2.clinic_id = a.clinic_id
      AND a2.scheduled_date = a.scheduled_date
      AND a2.professional_name = a.professional_name
      AND a2.status NOT IN ('cancelado','no_show')
      AND a2.deleted_at IS NULL
      AND a2.lead_id IS NOT NULL
    ORDER BY a2.start_time
    LIMIT 1
  ) AS would_use_lead_id
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND a.scheduled_date >= CURRENT_DATE
  AND a.status NOT IN ('cancelado','no_show')
GROUP BY a.clinic_id, a.scheduled_date, a.professional_name
ORDER BY a.scheduled_date, a.professional_name;
-- Interpretação:
--   would_use_lead_id IS NULL → mig 155 pula esse profissional/dia (cenário
--     patient-only · zero erro · zero outbox insert)
--   would_use_lead_id IS NOT NULL → mig 155 inseriria com esse lead_id
