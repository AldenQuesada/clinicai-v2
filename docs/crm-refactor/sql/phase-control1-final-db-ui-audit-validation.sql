-- ============================================================================
-- CRM_PHASE_CONTROL.1 · FINAL DB AUDIT VALIDATION (READ-ONLY)
-- ============================================================================
-- Blocos: safety + 7 categorias de contratos + 2 categorias de débito +
-- final flags.
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

SELECT 'cron_with_provider_call' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%'
   OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%';
-- Expected: 0


-- 01 APPOINTMENTS CONTRACT ──────────────────────────────────────────────────
SELECT 'invalid_appt_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'appt_status_dist' AS check_id, jsonb_object_agg(status, n) AS data
FROM (SELECT status, count(*) AS n FROM public.appointments WHERE deleted_at IS NULL GROUP BY status) s;

SELECT 'appt_without_professional' AS check_id, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL AND professional_id IS NULL;

SELECT 'appt_invalid_professional' AS check_id, count(*) AS n
FROM public.appointments a WHERE a.deleted_at IS NULL
  AND a.professional_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id);

SELECT 'appt_subject_xor_violations' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND patient_id IS NOT NULL;

SELECT 'appt_neither_subject_active' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND lead_id IS NULL AND patient_id IS NULL AND status != 'bloqueado';

SELECT 'fk_orphan_appt_lead' AS check_id, count(*) AS n
FROM public.appointments a WHERE a.deleted_at IS NULL AND a.lead_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = a.lead_id);

SELECT 'fk_orphan_appt_patient' AS check_id, count(*) AS n
FROM public.appointments a WHERE a.deleted_at IS NULL AND a.patient_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = a.patient_id);


-- 02 LEADS CONTRACT ──────────────────────────────────────────────────────────
SELECT 'lead_phase_dist' AS check_id, jsonb_object_agg(phase, n) AS data
FROM (SELECT phase, count(*) AS n FROM public.leads WHERE deleted_at IS NULL GROUP BY phase) s;

SELECT 'lead_lifecycle_dist' AS check_id, jsonb_object_agg(lifecycle_status, n) AS data
FROM (SELECT lifecycle_status, count(*) AS n FROM public.leads WHERE deleted_at IS NULL GROUP BY lifecycle_status) s;

SELECT 'phase_perdido_count' AS check_id, count(*) AS n FROM public.leads WHERE phase='perdido';
-- Expected: 0 (perdido vive em perdidos table · phase canon = lead/agendado/paciente/orcamento)

SELECT 'lifecycle_perdido_count' AS check_id, count(*) AS n FROM public.leads WHERE lifecycle_status='perdido';
-- Expected: pode haver · lifecycle_perdido é válido


-- 03 RECOVERY CONTRACT ──────────────────────────────────────────────────────
SELECT 'recovery_queue_view_ready' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_queue_view') AS data;

SELECT 'recovery_workflow_view_ready' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view') AS data;

SELECT 'recovery_workflow_duplicates' AS check_id, count(*) AS n
FROM (
  SELECT clinic_id, source_type, source_id, count(*) AS c
  FROM public.commercial_recovery_workflow_items WHERE archived_at IS NULL
  GROUP BY clinic_id, source_type, source_id HAVING count(*) > 1
) s;

SELECT 'recovery_workflow_invalid_stage' AS check_id, count(*) AS n
FROM public.commercial_recovery_workflow_items
WHERE stage NOT IN ('novo','em_analise','primeira_tentativa','aguardando_resposta','retorno_agendado','recuperado','descartado','arquivado');

SELECT 'recovery_workflow_invalid_priority' AS check_id, count(*) AS n
FROM public.commercial_recovery_workflow_items
WHERE priority NOT IN ('baixa','media','alta','urgente');


-- 04 CLINICAL CONTRACT ──────────────────────────────────────────────────────
SELECT 'clinical_artifacts' AS check_id, jsonb_build_object(
  'appointment_anamnesis_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_anamnesis'),
  'anamnesis_requests_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='anamnesis_requests'),
  'legal_doc_requests_table', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='legal_doc_requests'),
  'clinical_gate_rpc', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'finalize_rpc', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'attend_rpc', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
) AS data;


-- 05 DASHBOARD CONTRACT ──────────────────────────────────────────────────────
SELECT 'dashboard_sources' AS check_id, jsonb_build_object(
  'crm_operational_view', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view'),
  'commercial_recovery_queue_view', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_queue_view'),
  'commercial_recovery_workflow_view', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view'),
  'appointment_internal_alerts', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts')
) AS data;

SELECT 'professionals_pool' AS check_id, count(*) AS n
FROM public.professional_profiles WHERE is_active=true AND agenda_enabled=true;


-- 06 ZUMBI FUNCTION INVENTORY ───────────────────────────────────────────────
SELECT 'zumbi_function_total' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.prosrc ILIKE '%em_consulta%' OR p.prosrc ILIKE '%pre_consulta%'
       OR p.prosrc ILIKE '%compareceu%' OR p.prosrc ILIKE '%reagendado%');

SELECT 'zumbi_in_active_cron' AS check_id, jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.prosrc ILIKE '%em_consulta%' OR p.prosrc ILIKE '%pre_consulta%'
       OR p.prosrc ILIKE '%compareceu%' OR p.prosrc ILIKE '%reagendado%')
  AND EXISTS (SELECT 1 FROM cron.job j WHERE j.command ILIKE '%' || p.proname || '%' AND j.active=true);

SELECT 'zumbi_in_triggers' AS check_id, jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.prosrc ILIKE '%em_consulta%' OR p.prosrc ILIKE '%pre_consulta%'
       OR p.prosrc ILIKE '%compareceu%' OR p.prosrc ILIKE '%reagendado%')
  AND EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgfoid = p.oid AND NOT tg.tgisinternal);

-- Live V2 RPCs com literal zumbi (precisam manter · contém literal para
-- backward-compat/idempotência · NÃO são candidatos a drop)
SELECT 'zumbi_in_live_v2_rpcs' AS check_id, jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('appointment_attend','appointment_finalize','appointment_arrival_internal_alert','appointment_change_status','lead_to_paciente','lead_to_orcamento')
  AND (p.prosrc ILIKE '%em_consulta%' OR p.prosrc ILIKE '%pre_consulta%'
       OR p.prosrc ILIKE '%compareceu%' OR p.prosrc ILIKE '%reagendado%');


-- 07 ALEXA RPCS DORMENTES ───────────────────────────────────────────────────
SELECT 'alexa_rpc_count' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname ILIKE '%alexa%';

SELECT 'alexa_rpc_orphan_table_refs' AS check_id, jsonb_agg(jsonb_build_object(
  'name', p.proname,
  'refs_alexa_announce_log', p.prosrc ILIKE '%alexa_announce_log%',
  'refs_alexa_devices', p.prosrc ILIKE '%alexa_devices%',
  'refs_clinic_alexa_config', p.prosrc ILIKE '%clinic_alexa_config%'
) ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname ILIKE '%alexa%';

SELECT 'alexa_table_existence' AS check_id, jsonb_build_object(
  'clinic_alexa_config', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_alexa_config'),
  'alexa_devices', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='alexa_devices'),
  'alexa_announce_log', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='alexa_announce_log')
) AS data;


-- 08 PROVIDER SAFETY ────────────────────────────────────────────────────────
SELECT 'provider_functions_count' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.prosrc ILIKE '%http%fetch%' OR p.prosrc ILIKE '%alexa-bridge%' OR p.prosrc ILIKE '%evolution%api%');


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_control1' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL
      AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')
  ),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'subject_xor_violations', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND patient_id IS NOT NULL),
  'invalid_professional_count', (
    SELECT count(*) FROM public.appointments a WHERE a.deleted_at IS NULL
      AND a.professional_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id)
  ),
  'appt_without_professional_count', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND professional_id IS NULL),
  'fk_orphans_count', (
    (SELECT count(*) FROM public.appointments a WHERE a.deleted_at IS NULL AND a.lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = a.lead_id))
    +
    (SELECT count(*) FROM public.appointments a WHERE a.deleted_at IS NULL AND a.patient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = a.patient_id))
  ),
  'zumbi_function_count_after_cleanup', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (p.prosrc ILIKE '%em_consulta%' OR p.prosrc ILIKE '%pre_consulta%'
           OR p.prosrc ILIKE '%compareceu%' OR p.prosrc ILIKE '%reagendado%')
  ),
  'alexa_rpcs_after_cleanup', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname ILIKE '%alexa%'
  ),
  'cron_with_provider_call', (
    SELECT count(*) FROM cron.job
    WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'
  ),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL
         AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
    AND (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND lead_id IS NOT NULL AND patient_id IS NOT NULL) = 0
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
  )
) AS data;
