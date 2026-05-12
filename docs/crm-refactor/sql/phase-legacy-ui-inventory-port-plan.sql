-- ============================================================================
-- CRM_PHASE_LEGACY.UI.AUDIT · INVENTORY & PORT PLAN (READ-ONLY)
-- ============================================================================
-- Zero INSERT/UPDATE/DELETE. Confirma gate de envio, contratos canônicos do v2
-- e mapeia resíduos zumbis no DB (funções com referências a status legacy ou
-- provider externo).
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


-- 01 V2 CONTRACT HEALTH ──────────────────────────────────────────────────────
SELECT 'appt_status_dist' AS check_id, jsonb_object_agg(status, n) AS data
FROM (SELECT status, count(*) AS n FROM public.appointments WHERE deleted_at IS NULL GROUP BY status) s;

SELECT 'invalid_appt_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando',
                     'na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');
-- Expected: 0

SELECT 'phase_perdido_count' AS check_id, count(*) AS n FROM public.leads WHERE phase='perdido';
-- Expected: 0 (canon: phase ∈ lead/agendado/paciente/orcamento · perdido vive em perdidos table)

SELECT 'lead_phase_dist' AS check_id, jsonb_object_agg(phase, n) AS data
FROM (SELECT phase, count(*) AS n FROM public.leads WHERE deleted_at IS NULL GROUP BY phase) s;

SELECT 'lifecycle_dist' AS check_id, jsonb_object_agg(lifecycle_status, n) AS data
FROM (SELECT lifecycle_status, count(*) AS n FROM public.leads WHERE deleted_at IS NULL GROUP BY lifecycle_status) s;


-- 02 CORE VIEWS & RPCs ───────────────────────────────────────────────────────
SELECT 'v2_core_contracts' AS check_id, jsonb_build_object(
  'crm_operational_view',           EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view'),
  'appointment_finalize_rpc',       EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize'),
  'appointment_attend_rpc',         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend'),
  'appointment_change_status_rpc',  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_change_status'),
  'lead_lost_rpc',                  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost'),
  'lead_recover_rpc',               EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_recover'),
  'appointment_clinical_gate_status', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status'),
  'commercial_recovery_queue_view',    EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_queue_view'),
  'commercial_recovery_workflow_view', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view'),
  'appointment_arrival_internal_alert', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert')
) AS data;


-- 03 LEGACY RISK · ZUMBIS NO DB ─────────────────────────────────────────────
-- Funções que ainda referenciam status legacy / provider · candidatas a
-- limpeza em fase futura. Não bloqueia esta fase · informativo.
SELECT 'zombie_em_consulta_fns' AS check_id,
       jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%em_consulta%';

SELECT 'zombie_pre_consulta_fns' AS check_id,
       jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%pre_consulta%';

SELECT 'zombie_compareceu_fns' AS check_id,
       jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%compareceu%';

SELECT 'zombie_reagendado_fns' AS check_id,
       jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosrc ILIKE '%reagendado%';

SELECT 'phase_perdido_in_fns' AS check_id,
       jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.prosrc ILIKE '%''perdido''%'
  AND p.proname NOT ILIKE '%lost%'
  AND p.proname NOT ILIKE '%perdido%';

SELECT 'alexa_rpcs_dormant' AS check_id,
       jsonb_agg(p.proname ORDER BY p.proname) AS data
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname ILIKE '%alexa%';

-- Cron jobs com provider externo · espera-se: 0
SELECT 'cron_with_provider_call' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%http%' OR command ILIKE '%fetch%'
   OR command ILIKE '%evolution%' OR command ILIKE '%alexa%'
   OR command ILIKE '%meta.com%';


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_legacy_audit' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments
     WHERE deleted_at IS NULL
       AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando',
                          'na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')
  ),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'core_contracts_ready', (
    EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_lost')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_recover')
    AND EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view')
  ),
  'zumbi_function_count', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND (p.prosrc ILIKE '%em_consulta%' OR p.prosrc ILIKE '%pre_consulta%' OR
            p.prosrc ILIKE '%compareceu%' OR p.prosrc ILIKE '%reagendado%')
  ),
  'alexa_rpcs_dormant', (
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname ILIKE '%alexa%'
  ),
  'unsafe_outbox_count', (
    SELECT count(*) FROM public.wa_outbox
     WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL
  ),
  'can_open_control_audit_after_port_plan', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')) = 0
    AND EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view')
    AND EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view')
  )
) AS data;
