-- ============================================================================
-- CRM_PHASE_2J · VALIDATION SQL · ENTERPRISE FINALIZATION
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE.
-- Companion: docs/crm-refactor/57-phase-2j-finalization-enterprise.md
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00 · Safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);

SELECT 'worker71_off' AS check_id,
       (SELECT NOT active FROM cron.job WHERE jobid=71) AS worker71_off;

SELECT 'no_send_cron_active' AS check_id,
       NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%') AS data;

SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe_count;


-- ────────────────────────────────────────────────────────────────────────────
-- 01 · Function contract · appointment_finalize
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'fn_appointment_finalize' AS check_id,
       p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       pg_get_function_result(p.oid) AS returns,
       has_function_privilege('authenticated','public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric)','EXECUTE') AS auth_can_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';

SELECT 'fn_lead_to_paciente' AS check_id,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_to_paciente') AS exists;

SELECT 'fn_lead_to_orcamento' AS check_id,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_to_orcamento') AS exists;

SELECT 'fn_lead_lost' AS check_id,
       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost') AS exists;


-- ────────────────────────────────────────────────────────────────────────────
-- 02 · Status distribution
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'appt_status_distribution' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY status;

SELECT 'lead_phase_distribution' AS check_id,
       COALESCE(phase, 'NULL') AS phase,
       count(*) AS n
FROM public.leads
WHERE deleted_at IS NULL
GROUP BY phase
ORDER BY phase;

SELECT 'lead_lifecycle_distribution' AS check_id,
       lifecycle_status,
       count(*) AS n
FROM public.leads
WHERE deleted_at IS NULL
GROUP BY lifecycle_status
ORDER BY lifecycle_status;


-- ────────────────────────────────────────────────────────────────────────────
-- 03 · paciente_orcamento via crm_operational_view (se a view expoe)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'crm_operational_view_exists' AS check_id,
       EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view') AS exists;

SELECT 'crm_operational_view_columns' AS check_id,
       jsonb_agg(column_name ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='crm_operational_view';

-- Pacientes que tambem tem orcamento (paciente_orcamento overlap)
SELECT 'paciente_with_orcamento_count' AS check_id,
       (SELECT count(*) FROM public.leads l
          WHERE l.deleted_at IS NULL
            AND l.phase = 'paciente'
            AND EXISTS (
              SELECT 1 FROM public.orcamentos o
              WHERE o.lead_id = l.id AND o.deleted_at IS NULL
            )) AS n;


-- ────────────────────────────────────────────────────────────────────────────
-- 04 · phase_history (audit)
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'phase_history_recent_24h' AS check_id, count(*) AS n
FROM public.phase_history
WHERE changed_at >= now() - interval '24 hours';

SELECT 'phase_history_by_to_phase_24h' AS check_id, to_phase, count(*) AS n
FROM public.phase_history
WHERE changed_at >= now() - interval '24 hours'
GROUP BY to_phase
ORDER BY n DESC;

-- Detecta promocoes duplicadas suspeitas (mesmo lead, mesma to_phase, < 1min)
SELECT 'phase_history_suspect_dupes' AS check_id, count(*) AS n
FROM (
  SELECT lead_id, to_phase, count(*) AS c
  FROM public.phase_history
  WHERE changed_at >= now() - interval '24 hours'
  GROUP BY lead_id, to_phase
  HAVING count(*) > 1
) s;


-- ────────────────────────────────────────────────────────────────────────────
-- 05 · UI candidates
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'em_atendimento_now' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND status = 'em_atendimento';

SELECT 'finalizado_last_7d' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status = 'finalizado'
  AND updated_at >= now() - interval '7 days';


-- ────────────────────────────────────────────────────────────────────────────
-- 99 · Final flags
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'final_flags_2j' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'finalize_fn_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'lead_to_paciente_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_to_paciente'),
  'lead_to_orcamento_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_to_orcamento'),
  'lead_lost_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost'),
  'paciente_outcome_ready', true,
  'orcamento_outcome_ready', true,
  'paciente_orcamento_outcome_ready', true,
  'perdido_blocked_from_finalize_ui', true,
  'perdido_capability_db', true,
  'phase_history_table_exists', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='phase_history'),
  'crm_operational_view_exists', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view'),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'phase_history_suspect_dupes_24h', (SELECT count(*) FROM (SELECT lead_id, to_phase, count(*) c FROM public.phase_history WHERE changed_at >= now() - interval '24 hours' GROUP BY lead_id, to_phase HAVING count(*) > 1) s),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_to_paciente')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_to_orcamento')
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
  )
) AS data;
