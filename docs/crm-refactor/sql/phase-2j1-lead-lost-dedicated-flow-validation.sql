-- ============================================================================
-- CRM_PHASE_2J.1 · VALIDATION SQL · DEDICATED LEAD LOST FLOW
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE.
-- ============================================================================


-- 00 · Safety jobs
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

SELECT 'wa_outbox_safety' AS check_id, jsonb_build_object(
  'queued', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;


-- 01 · RPC contract
SELECT 'lead_lost_signature' AS check_id,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='lead_lost'
LIMIT 1;


-- 02 · Lead state health
SELECT 'leads_by_phase' AS check_id, COALESCE(phase, 'NULL') AS phase, count(*) AS n
FROM public.leads WHERE deleted_at IS NULL GROUP BY phase ORDER BY phase;

SELECT 'leads_by_lifecycle' AS check_id, lifecycle_status, count(*) AS n
FROM public.leads WHERE deleted_at IS NULL GROUP BY lifecycle_status ORDER BY lifecycle_status;

-- Regressão crítica · perdido NUNCA deve aparecer como phase
SELECT 'leads_phase_perdido_regression' AS check_id, count(*) AS n
FROM public.leads WHERE deleted_at IS NULL AND phase='perdido';
-- Expected: 0

-- Contaminação · paciente com lifecycle_status='perdido'?
SELECT 'paciente_with_lifecycle_perdido' AS check_id, count(*) AS n
FROM public.leads
WHERE deleted_at IS NULL AND phase='paciente' AND lifecycle_status='perdido';

-- Lifecycle perdido sem reason
SELECT 'lifecycle_perdido_without_reason' AS check_id, count(*) AS n
FROM public.leads
WHERE deleted_at IS NULL
  AND lifecycle_status='perdido'
  AND (lost_reason IS NULL OR length(trim(lost_reason)) = 0);

-- Lifecycle perdido sem timestamp
SELECT 'lifecycle_perdido_without_ts' AS check_id, count(*) AS n
FROM public.leads
WHERE deleted_at IS NULL
  AND lifecycle_status='perdido'
  AND lost_at IS NULL;


-- 03 · Appointment health (não deve ter mutation por 2J.1)
SELECT 'appointments_by_status' AS check_id, status, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL GROUP BY status ORDER BY status;

SELECT 'appointments_invalid_status' AS check_id, count(*) AS n
FROM public.appointments
WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');


-- 04 · Audit trail
SELECT 'phase_history_recent_lost_origin' AS check_id, count(*) AS n
FROM public.phase_history
WHERE origin='lifecycle' AND triggered_by='rpc:lead_lost'
  AND changed_at >= now() - interval '24 hours';

SELECT 'perdidos_recent' AS check_id, count(*) AS n
FROM public.perdidos
WHERE lost_at >= now() - interval '24 hours';


-- 05 · UI contract sanity (assert que perdido NÃO está em outcome list canônica)
SELECT 'appointment_finalize_signature' AS check_id,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize'
LIMIT 1;
-- (UI expõe paciente/orcamento/paciente_orcamento · perdido REMOVIDO em 2J)


-- 99 · Final flags
SELECT 'final_flags_2j1' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'lead_lost_fn_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost'),
  'lead_lost_signature_includes_reason', (
    SELECT pg_get_function_identity_arguments(p.oid) LIKE '%p_reason%'
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='lead_lost' LIMIT 1
  ),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase='perdido'),
  'lifecycle_perdido_count', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='perdido'),
  'lifecycle_perdido_without_reason', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='perdido' AND (lost_reason IS NULL OR length(trim(lost_reason)) = 0)),
  'lifecycle_perdido_without_ts', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='perdido' AND lost_at IS NULL),
  'lost_contract_ready', (
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost')
    AND (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase='perdido') = 0
  ),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost')
    AND (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase='perdido') = 0
  )
) AS data;
