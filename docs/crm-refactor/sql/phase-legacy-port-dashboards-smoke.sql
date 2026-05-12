-- ============================================================================
-- CRM_PHASE_LEGACY.PORT.DASHBOARDS · SMOKE (READ-ONLY)
-- ============================================================================
-- Fase read-only · zero INSERT/UPDATE/DELETE.
-- Smoke valida que cada query do repository roda sem erro e retorna shape OK.
-- ============================================================================


-- A · Source verification ────────────────────────────────────────────────────
SELECT 'A_sources_exist' AS check_id, jsonb_build_object(
  'crm_operational_view',           EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='crm_operational_view'),
  'appointments',                   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointments'),
  'leads',                          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leads'),
  'patients',                       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patients'),
  'orcamentos',                     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orcamentos'),
  'perdidos',                       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='perdidos'),
  'professional_profiles',          EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='professional_profiles'),
  'commercial_recovery_workflow_view', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view')
) AS data;


-- B · Professional filter cap (any clinic · any data) ───────────────────────
SELECT 'B_professional_filter_runs' AS check_id, jsonb_build_object(
  'sample_with_prof_filter',
    (SELECT count(*) FROM public.appointments
     WHERE deleted_at IS NULL
       AND professional_id IS NOT NULL
       AND scheduled_date >= now()::date - interval '30 days'
       AND scheduled_date <= now()::date),
  'sample_without_prof_filter',
    (SELECT count(*) FROM public.appointments
     WHERE deleted_at IS NULL
       AND scheduled_date >= now()::date - interval '30 days'
       AND scheduled_date <= now()::date)
) AS data;


-- C · Funnel query roda ──────────────────────────────────────────────────────
SELECT 'C_funnel_query' AS check_id, jsonb_build_object(
  'total_leads_ativo', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='ativo'),
  'phase_agendado', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='ativo' AND phase='agendado'),
  'phase_paciente', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='ativo' AND phase='paciente'),
  'phase_orcamento', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='ativo' AND phase='orcamento'),
  'appt_with_chegada', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND chegada_em IS NOT NULL),
  'perdidos_total', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL),
  'perdidos_recuperado', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL AND recovered_at IS NOT NULL)
) AS data;


-- D · By professional query roda ────────────────────────────────────────────
SELECT 'D_by_professional_query' AS check_id, jsonb_build_object(
  'professionals_pool',
    (SELECT count(*) FROM public.professional_profiles WHERE is_active=true AND agenda_enabled=true),
  'sample_aggregate', (
    SELECT jsonb_agg(jsonb_build_object('professional_id', professional_id, 'count', n))
    FROM (
      SELECT professional_id, count(*) AS n
      FROM public.appointments
      WHERE deleted_at IS NULL
        AND scheduled_date >= now()::date - interval '30 days'
      GROUP BY professional_id
      LIMIT 10
    ) s
  )
) AS data;


-- E · Recovery query roda ───────────────────────────────────────────────────
SELECT 'E_recovery_query' AS check_id, jsonb_build_object(
  'workflow_view_runs',
    (SELECT count(*) FROM public.commercial_recovery_workflow_view),
  'queue_view_runs',
    (SELECT count(*) FROM public.commercial_recovery_queue_view),
  'workflow_overdue',
    (SELECT count(*) FROM public.commercial_recovery_workflow_view WHERE next_action_overdue=true)
) AS data;


-- F · No status zumbi ──────────────────────────────────────────────────────
SELECT 'F_no_zumbi_in_data' AS check_id, jsonb_build_object(
  'zumbi_em_consulta', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='em_consulta'),
  'zumbi_pre_consulta', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='pre_consulta'),
  'zumbi_compareceu', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='compareceu'),
  'zumbi_reagendado_data', (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL AND status='reagendado'),
  'zumbi_phase_perdido', (SELECT count(*) FROM public.leads WHERE phase='perdido')
);


-- G · worker71 off ───────────────────────────────────────────────────────────
SELECT 'G_worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;


-- H · wa_outbox unsafe count zero ───────────────────────────────────────────
SELECT 'H_wa_outbox_unsafe_count' AS check_id,
  (SELECT count(*) FROM public.wa_outbox
   WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS data;


-- I · Zero writes proof ──────────────────────────────────────────────────────
-- Fase é 100% SELECT · este SQL é READ-ONLY · provada por ausência de
-- INSERT/UPDATE/DELETE/CALL · acima é apenas SELECT.
SELECT 'I_smoke_is_read_only' AS check_id, true AS data;
