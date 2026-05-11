-- ============================================================================
-- FASE 2D.3A.2 · POST-APPLY VALIDATION · wa_daily_summary / _render_appt_template
-- ============================================================================
-- Rode estas queries APÓS o apply da mig 154 e cole os outputs no chat.
-- Todas SELECT (zero mutação · exceto VAL-9 que é dry-run de render).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · Defs atuais das 2 funções
-- ─────────────────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.wa_daily_summary()'::regprocedure)
  AS wa_daily_summary_def;

SELECT pg_get_functiondef('public._render_appt_template(text, record)'::regprocedure)
  AS _render_appt_template_def;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · Drift scan: zero patient_name · subject_name presente
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  position('patient_name' IN pg_get_functiondef(p.oid)) > 0  AS mentions_patient_name,
  position('subject_name' IN pg_get_functiondef(p.oid)) > 0  AS mentions_subject_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('wa_daily_summary','_render_appt_template')
ORDER BY p.proname;
-- Esperado:
--   wa_daily_summary       → mentions_patient_name=false, mentions_subject_name=true
--   _render_appt_template  → mentions_patient_name=false, mentions_subject_name=true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · GRANTs preservados após CREATE OR REPLACE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  pg_get_userbyid(a.grantee) AS grantee,
  a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
WHERE n.nspname='public'
  AND p.proname IN ('wa_daily_summary','_render_appt_template')
ORDER BY p.proname, grantee;
-- Esperado: grants idênticos à versão pré-apply (CREATE OR REPLACE preserva).

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · Tracker registra mig 154
-- ─────────────────────────────────────────────────────────────────────────────
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260800000154';

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-5 · Cron daily-agenda-summary segue ATIVO
-- ─────────────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname IN ('daily-agenda-summary','wa-outbox-worker','agenda-alert-min-before')
   OR command ILIKE '%wa_daily_summary%'
   OR command ILIKE '%wa_outbox_worker_tick%'
   OR command ILIKE '%_agenda_alert_min_before_tick%'
ORDER BY jobid;
-- Esperado:
--   daily-agenda-summary           → active=true
--   wa-outbox-worker (job 71)      → active=false
--   agenda-alert-min-before (72)   → active=false

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-6 · Distribuição appointments baseline (sanity · zero mutação esperada)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT status, count(*) AS total
FROM public.appointments
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY total DESC;
-- Esperado: idêntico ao snapshot pré-mig 154 (mig 154 não toca dados).

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-7 · Distribuição wa_outbox baseline (sanity · zero mutação)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT status, count(*) AS total
FROM public.wa_outbox
WHERE created_at >= now() - interval '7 days'
GROUP BY status
ORDER BY total DESC;
-- Esperado: idêntico ao snapshot pré-mig 154 (wa_daily_summary só roda 08:00 BRT).

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-8 · Confirmar wa_daily_summary não escreveu nada durante o apply
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS rows_inserted_during_apply_window
FROM public.wa_outbox
WHERE appt_ref LIKE 'daily_summary_%'
  AND created_at >= now() - interval '5 minutes';
-- Esperado: 0 (a função não foi executada pelo apply · cron next 08:00 BRT)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-9 · Dry-run de _render_appt_template (NÃO escreve nada)
-- ─────────────────────────────────────────────────────────────────────────────
-- Pega 1 appointment qualquer e renderiza um template sintético.
-- Se não houver appointments ativos, simula com record fake via row constructor.
DO $$
DECLARE
  v_appt record;
  v_rendered text;
BEGIN
  SELECT * INTO v_appt
    FROM public.appointments
   WHERE deleted_at IS NULL
   LIMIT 1;

  IF v_appt IS NULL THEN
    RAISE NOTICE 'VAL-9: nenhum appointment ativo · pulando dry-run';
    RETURN;
  END IF;

  v_rendered := public._render_appt_template(
    'Olá {{nome}}, dia {{data}} às {{hora}} com {{profissional}} para {{procedimento}} em {{clinica}}.',
    v_appt
  );

  RAISE NOTICE 'VAL-9 rendered: %', v_rendered;

  -- Sanity asserts
  IF v_rendered ILIKE '%{{nome}}%' THEN
    RAISE EXCEPTION 'VAL-9 FAIL: {{nome}} não foi substituído';
  END IF;
  IF v_rendered ILIKE '%{{data}}%' THEN
    RAISE EXCEPTION 'VAL-9 FAIL: {{data}} não foi substituído';
  END IF;
END $$;
-- Esperado: NOTICE com mensagem renderizada usando subject_name do appt.

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-10 · Confirmação · zero alteração em appointments / wa_outbox pela mig 154
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.appointments WHERE updated_at >= now() - interval '5 minutes' AND deleted_at IS NULL) AS appts_modified_recently,
  (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '5 minutes') AS outbox_created_recently;
-- Esperado: 0 e 0 (mig 154 toca só funções · zero DML)
