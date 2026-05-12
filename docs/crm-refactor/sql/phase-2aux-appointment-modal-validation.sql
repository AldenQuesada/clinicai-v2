-- ============================================================================
-- CRM_PHASE_2AUX · VALIDATION SQL · APPOINTMENT MODAL VALIDATION
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


-- 01 · Status contract
SELECT 'appt_status_dist' AS check_id, status, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL GROUP BY status ORDER BY status;

SELECT 'invalid_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');
-- Expected: 0

SELECT 'zombie_status_runtime_check' AS check_id, count(*) AS n
FROM public.appointments
WHERE status IN ('pre_consulta','em_consulta','compareceu','reagendado','attending','converted');
-- Expected: 0 (CHECK constraint rejeita)


-- 02 · Conflicts (overlap entre appts ATIVOS mesmo professional)
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
-- Expected: 0 ideal · gate UI/action protege novos casos


-- 03 · Subject integrity (CHECK chk_appt_subject_xor)
SELECT 'orphan_subject_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND lead_id IS NULL
  AND patient_id IS NULL
  AND status NOT IN ('bloqueado','cancelado','no_show','finalizado');

SELECT 'both_lead_and_patient_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND lead_id IS NOT NULL
  AND patient_id IS NOT NULL;
-- Expected: 0 (CHECK chk_appt_subject_xor)


-- 04 · Terminal safety
SELECT 'appts_terminal_7d' AS check_id, status, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status IN ('finalizado','cancelado','no_show')
  AND updated_at >= now() - interval '7 days'
GROUP BY status;


-- 05 · Functions
SELECT 'fn_appointment_change_status' AS check_id,
       (CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END) AS security
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_change_status' LIMIT 1;

SELECT 'fn_appointment_finalize_args_count' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';
-- Expected: 1 (após 2I.1 só 1 versão)


-- 99 · Final flags
SELECT 'final_flags_2aux' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'invalid_appointment_status_count', (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')),
  'zombie_status_count', (SELECT count(*) FROM public.appointments WHERE status IN ('pre_consulta','em_consulta','compareceu','reagendado','attending','converted')),
  'active_overlap_count', (SELECT count(*) FROM (SELECT a.id FROM public.appointments a JOIN public.appointments b ON a.id < b.id AND a.scheduled_date = b.scheduled_date AND a.professional_id = b.professional_id AND a.deleted_at IS NULL AND b.deleted_at IS NULL AND a.status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado') AND b.status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado') AND a.start_time < b.end_time AND b.start_time < a.end_time WHERE a.professional_id IS NOT NULL) s),
  'orphan_subject_count', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND lead_id IS NULL AND patient_id IS NULL AND status NOT IN ('bloqueado','cancelado','no_show','finalizado')),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
    AND (SELECT count(*) FROM public.appointments WHERE status IN ('pre_consulta','em_consulta')) = 0
  )
) AS data;
