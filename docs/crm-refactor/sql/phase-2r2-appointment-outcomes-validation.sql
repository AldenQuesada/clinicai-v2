-- ============================================================================
-- CRM_PHASE_2R.2 · VALIDATION SQL · APPOINTMENT OUTCOMES REFINEMENT
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE.
-- ============================================================================


-- 00 · Safety
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

SELECT 'wa_outbox_safety' AS check_id, jsonb_build_object(
  'queued', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;


-- 01 · Status distribution + outcome counts
SELECT 'appt_status_dist' AS check_id, status, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL GROUP BY status ORDER BY status;

SELECT 'invalid_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'outcomes_summary' AS check_id, jsonb_build_object(
  'cancelado', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='cancelado'),
  'no_show', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='no_show'),
  'remarcado', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='remarcado'),
  'finalizado', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='finalizado')
) AS data;


-- 02 · Outcome reason health
-- DB tem colunas dedicadas: motivo_cancelamento, cancelado_em, motivo_no_show, no_show_em.
SELECT 'cancel_missing_reason_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status='cancelado'
  AND (motivo_cancelamento IS NULL OR length(trim(motivo_cancelamento)) = 0);
-- Expected: 0 · CHECK chk_appt_cancelled_consistency protege

SELECT 'cancel_missing_timestamp_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status='cancelado'
  AND cancelado_em IS NULL;
-- Expected: 0 · CHECK protege

SELECT 'no_show_missing_reason_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status='no_show'
  AND (motivo_no_show IS NULL OR length(trim(motivo_no_show)) = 0);
-- Expected: 0 · CHECK chk_appt_noshow_consistency protege

SELECT 'no_show_missing_timestamp_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status='no_show'
  AND no_show_em IS NULL;
-- Expected: 0


-- 03 · Active overlap (sanity)
SELECT 'active_overlap_count' AS check_id, count(*) AS n
FROM (
  SELECT a.id
  FROM public.appointments a
  JOIN public.appointments b
    ON a.id < b.id
   AND a.scheduled_date = b.scheduled_date
   AND a.professional_id = b.professional_id
   AND a.deleted_at IS NULL AND b.deleted_at IS NULL
   AND a.status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado')
   AND b.status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado')
   AND a.start_time < b.end_time
   AND b.start_time < a.end_time
  WHERE a.professional_id IS NOT NULL
) s;


-- 04 · Terminal safety (paciente já paciente sem o que cancelar/no-show)
SELECT 'terminal_appointments_30d' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status IN ('finalizado','cancelado','no_show','remarcado')
  AND updated_at >= now() - interval '30 days'
GROUP BY status
ORDER BY status;


-- 05 · RPC inventory para outcomes
SELECT 'outcome_rpcs' AS check_id, p.proname,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('appointment_change_status')
ORDER BY p.proname;


-- 99 · Final flags
SELECT 'final_flags_2r2' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'invalid_appointment_status_count', (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')),
  'missing_outcome_reason_count', (
    (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='cancelado' AND (motivo_cancelamento IS NULL OR length(trim(motivo_cancelamento)) = 0))
    +
    (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='no_show' AND (motivo_no_show IS NULL OR length(trim(motivo_no_show)) = 0))
  ),
  'missing_outcome_timestamp_count', (
    (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='cancelado' AND cancelado_em IS NULL)
    +
    (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='no_show' AND no_show_em IS NULL)
  ),
  'active_overlap_count', (SELECT count(*) FROM (SELECT a.id FROM public.appointments a JOIN public.appointments b ON a.id < b.id AND a.scheduled_date = b.scheduled_date AND a.professional_id = b.professional_id AND a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado') AND b.status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado') AND a.start_time < b.end_time AND b.start_time < a.end_time WHERE a.professional_id IS NOT NULL) s),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
  )
) AS data;
