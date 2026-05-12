-- ============================================================================
-- CRM_PHASE_2H.1 · VALIDATION SQL · STATUS ZOMBIE CLEANUP
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


-- 01 · Appointment status distribution
SELECT 'appointments_by_status' AS check_id, status, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL GROUP BY status ORDER BY status;

-- Status canônicos: 11 valores.
-- CRM_PHASE_2H.1: pre_consulta + em_consulta NÃO devem aparecer (zumbis).
SELECT 'invalid_appointment_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'pre_consulta_count' AS check_id, count(*) AS n
FROM public.appointments WHERE status='pre_consulta';
-- Expected: 0 (CHECK constraint rejeita · zumbi)

SELECT 'em_consulta_count' AS check_id, count(*) AS n
FROM public.appointments WHERE status='em_consulta';
-- Expected: 0 (CHECK constraint rejeita · zumbi)


-- 02 · Lead phase / lifecycle
SELECT 'leads_by_phase' AS check_id, COALESCE(phase, 'NULL') AS phase, count(*) AS n
FROM public.leads WHERE deleted_at IS NULL GROUP BY phase ORDER BY phase;

SELECT 'phase_perdido_regression' AS check_id, count(*) AS n
FROM public.leads WHERE deleted_at IS NULL AND phase='perdido';
-- Expected: 0 (perdido virou lifecycle desde Fase 1C)

SELECT 'leads_by_lifecycle' AS check_id, lifecycle_status, count(*) AS n
FROM public.leads WHERE deleted_at IS NULL GROUP BY lifecycle_status ORDER BY lifecycle_status;

-- Phase fora do canon
SELECT 'leads_invalid_phase' AS check_id, count(*) AS n
FROM public.leads
WHERE deleted_at IS NULL AND phase IS NOT NULL
  AND phase NOT IN ('lead','agendado','paciente','orcamento');


-- 03 · Function source scan for zombie terms (pg_proc.prosrc)
SELECT 'fns_referencing_zombies' AS check_id,
       term,
       count(*) AS fn_count
FROM (
  SELECT 'em_consulta' AS term FROM pg_proc p WHERE prosrc ILIKE '%em_consulta%'
  UNION ALL
  SELECT 'pre_consulta' FROM pg_proc p WHERE prosrc ILIKE '%pre_consulta%'
) s
GROUP BY term
ORDER BY term;

-- Functions específicas relevantes mostradas (informativo · não bloqueia):
SELECT 'fns_with_em_consulta' AS check_id, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%em_consulta%'
ORDER BY p.proname
LIMIT 20;


-- 04 · State machine fn alignment (mig 72 sem zumbi)
SELECT 'state_machine_zombie_check' AS check_id, jsonb_build_object(
  'aguardando_to_em_consulta', public._appointment_status_transition_allowed('aguardando', 'em_consulta'),
  'confirmado_to_pre_consulta', public._appointment_status_transition_allowed('confirmado', 'pre_consulta'),
  'na_clinica_to_em_consulta', public._appointment_status_transition_allowed('na_clinica', 'em_consulta')
) AS expected_all_false;
-- Expected: todos false (DB já rejeitava esses zumbis · 2H.1 alinha TS)


-- 99 · Final flags
SELECT 'final_flags_2h1' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'invalid_appointment_status_count', (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')),
  'pre_consulta_count', (SELECT count(*) FROM public.appointments WHERE status='pre_consulta'),
  'em_consulta_count', (SELECT count(*) FROM public.appointments WHERE status='em_consulta'),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase='perdido'),
  'leads_invalid_phase_count', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase IS NOT NULL AND phase NOT IN ('lead','agendado','paciente','orcamento')),
  'runtime_zombie_terms_expected_zero', (
    (SELECT count(*) FROM public.appointments WHERE status IN ('pre_consulta','em_consulta')) = 0
    AND (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase='perdido') = 0
  ),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.appointments WHERE status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
    AND (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase='perdido') = 0
  )
) AS data;
