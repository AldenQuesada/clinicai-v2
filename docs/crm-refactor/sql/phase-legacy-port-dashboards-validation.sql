-- ============================================================================
-- CRM_PHASE_LEGACY.PORT.DASHBOARDS · VALIDATION (READ-ONLY)
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


-- 01 CONTRACT HEALTH ────────────────────────────────────────────────────────
SELECT 'invalid_appt_status_count' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado');

SELECT 'phase_perdido_count' AS check_id, count(*) AS n FROM public.leads WHERE phase='perdido';

SELECT 'appt_invalid_professional' AS check_id, count(*) AS n
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND a.professional_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id);

SELECT 'appt_without_professional' AS check_id, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL AND professional_id IS NULL;

SELECT 'professional_pool_count' AS check_id, count(*) AS n
FROM public.professional_profiles
WHERE is_active=true AND agenda_enabled=true;


-- 02 DASHBOARD SOURCES ───────────────────────────────────────────────────────
SELECT 'crm_operational_view_ready' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view') AS data;

SELECT 'commercial_recovery_workflow_view_ready' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view') AS data;

SELECT 'appt_status_dist' AS check_id, jsonb_object_agg(status, n) AS data
FROM (SELECT status, count(*) AS n FROM public.appointments WHERE deleted_at IS NULL GROUP BY status) s;

SELECT 'lead_phase_dist' AS check_id, jsonb_object_agg(phase, n) AS data
FROM (SELECT phase, count(*) AS n FROM public.leads WHERE deleted_at IS NULL GROUP BY phase) s;

SELECT 'lead_lifecycle_dist' AS check_id, jsonb_object_agg(lifecycle_status, n) AS data
FROM (SELECT lifecycle_status, count(*) AS n FROM public.leads WHERE deleted_at IS NULL GROUP BY lifecycle_status) s;

SELECT 'orcamento_status_dist' AS check_id, jsonb_object_agg(status, n) AS data
FROM (SELECT status, count(*) AS n FROM public.orcamentos WHERE deleted_at IS NULL GROUP BY status) s;


-- 03 METRICS SAMPLES (30 dias) ──────────────────────────────────────────────
SELECT 'sample_30d_funnel' AS check_id, jsonb_build_object(
  'total_leads_ativo', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='ativo'),
  'appts_30d', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL
      AND scheduled_date >= now()::date - interval '30 days'
      AND scheduled_date <= now()::date
  ),
  'finalizados_30d', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL AND status='finalizado'
      AND scheduled_date >= now()::date - interval '30 days'
  ),
  'no_show_30d', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL AND status='no_show'
      AND scheduled_date >= now()::date - interval '30 days'
  ),
  'cancelados_30d', (
    SELECT count(*) FROM public.appointments
    WHERE deleted_at IS NULL AND status='cancelado'
      AND scheduled_date >= now()::date - interval '30 days'
  ),
  'perdidos_30d', (
    SELECT count(*) FROM public.perdidos
    WHERE deleted_at IS NULL AND lost_at >= now() - interval '30 days'
  )
) AS data;

SELECT 'sample_by_professional' AS check_id, jsonb_agg(jsonb_build_object('professional_id', professional_id, 'count', n)) AS data
FROM (
  SELECT professional_id, count(*) AS n
  FROM public.appointments
  WHERE deleted_at IS NULL
    AND scheduled_date >= now()::date - interval '30 days'
  GROUP BY professional_id
  LIMIT 10
) s;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_dashboards' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'core_sources_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointments')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leads')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='perdidos')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orcamentos')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patients')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professional_profiles')
    AND EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view')
  ),
  'professional_filter_ready', (
    EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      WHERE tc.table_schema='public' AND tc.table_name='appointments'
        AND tc.constraint_type='FOREIGN KEY'
        AND tc.constraint_name='appointments_professional_id_fkey'
    )
  ),
  'no_zombie_statuses', (
    (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status IN ('em_consulta','pre_consulta','compareceu')) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
  ),
  'unsafe_outbox_count', (
    SELECT count(*) FROM public.wa_outbox
    WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL
  ),
  'professionals_pool', (
    SELECT count(*) FROM public.professional_profiles WHERE is_active=true AND agenda_enabled=true
  ),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professional_profiles')
    AND EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view')
    AND (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status IN ('em_consulta','pre_consulta','compareceu')) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
  )
) AS data;
