-- ============================================================================
-- CRM_PHASE_2RC.1 · VALIDATION (READ-ONLY)
-- ============================================================================
-- Blocos: 00 safety · 01 schema · 02 queue · 03 events · 04 no_send · 99 flags
-- ============================================================================

-- 00 SAFETY ───────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_object_agg(jobid, jsonb_build_object('active', active, 'name', jobname)) AS data
FROM cron.job WHERE jobid IN (12,71,72,89,90,91,92,93,94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

SELECT 'wa_outbox_safety' AS check_id, jsonb_build_object(
  'queued', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;


-- 01 SCHEMA ──────────────────────────────────────────────────────────────────
SELECT 'workflow_table_ready' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commercial_recovery_workflow_items') AS data;

SELECT 'workflow_table_columns' AS check_id,
  jsonb_agg(column_name ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='commercial_recovery_workflow_items';

SELECT 'events_table_ready' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commercial_recovery_events') AS data;

SELECT 'workflow_view_ready' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view') AS data;

SELECT 'workflow_rpcs' AS check_id, jsonb_build_object(
  'create_or_get',     EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commercial_recovery_workflow_create_or_get'),
  'update_stage',      EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commercial_recovery_workflow_update_stage'),
  'update_priority',   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commercial_recovery_workflow_update_priority'),
  'set_next_action',   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commercial_recovery_workflow_set_next_action'),
  'add_note',          EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commercial_recovery_workflow_add_note'),
  'mark_recovered',    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commercial_recovery_workflow_mark_recovered'),
  'discard',           EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commercial_recovery_workflow_discard'),
  'suggest_message',   EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='commercial_recovery_workflow_suggest_message')
) AS data;

SELECT 'workflow_rls_enabled' AS check_id, jsonb_build_object(
  'workflow_items', (SELECT relrowsecurity FROM pg_class c WHERE c.relname='commercial_recovery_workflow_items'),
  'events', (SELECT relrowsecurity FROM pg_class c WHERE c.relname='commercial_recovery_events')
) AS data;


-- 02 QUEUE / WORKFLOW HEALTH ─────────────────────────────────────────────────
SELECT 'workflow_total' AS check_id, count(*) AS n FROM public.commercial_recovery_workflow_items;

SELECT 'workflow_by_stage' AS check_id, stage, count(*) AS n
FROM public.commercial_recovery_workflow_items WHERE archived_at IS NULL
GROUP BY stage ORDER BY n DESC;

SELECT 'workflow_by_priority' AS check_id, priority, count(*) AS n
FROM public.commercial_recovery_workflow_items WHERE archived_at IS NULL
GROUP BY priority ORDER BY priority;

SELECT 'workflow_overdue_next_action' AS check_id, count(*) AS n
FROM public.commercial_recovery_workflow_items
WHERE archived_at IS NULL AND next_action_at IS NOT NULL AND next_action_at < now();

-- Duplicates ATIVOS por (clinic_id, source_type, source_id) devem ser 0
SELECT 'workflow_duplicate_active_count' AS check_id, count(*) AS n
FROM (
  SELECT clinic_id, source_type, source_id, count(*) AS c
  FROM public.commercial_recovery_workflow_items WHERE archived_at IS NULL
  GROUP BY clinic_id, source_type, source_id HAVING count(*) > 1
) s;

SELECT 'workflow_orphan_count' AS check_id, count(*) AS n
FROM public.commercial_recovery_workflow_items
WHERE archived_at IS NULL AND lead_id IS NULL AND appointment_id IS NULL AND orcamento_id IS NULL;

SELECT 'workflow_invalid_stage_count' AS check_id, count(*) AS n
FROM public.commercial_recovery_workflow_items
WHERE stage NOT IN ('novo','em_analise','primeira_tentativa','aguardando_resposta',
                    'retorno_agendado','recuperado','descartado','arquivado');

SELECT 'workflow_invalid_priority_count' AS check_id, count(*) AS n
FROM public.commercial_recovery_workflow_items
WHERE priority NOT IN ('baixa','media','alta','urgente');


-- 03 EVENTS ──────────────────────────────────────────────────────────────────
SELECT 'events_total' AS check_id, count(*) AS n FROM public.commercial_recovery_events;

SELECT 'events_by_type' AS check_id, event_type, count(*) AS n
FROM public.commercial_recovery_events
GROUP BY event_type ORDER BY n DESC;

SELECT 'invalid_event_type_count' AS check_id, count(*) AS n
FROM public.commercial_recovery_events
WHERE event_type NOT IN ('created','stage_changed','priority_changed','assigned',
                         'next_action_set','note_added','suggested_message_generated',
                         'recovered','discarded','archived','reopened');


-- 04 NO-SEND PROOF ───────────────────────────────────────────────────────────
-- workflow_view É read-only · não pode criar wa_outbox · não tem cron
SELECT 'workflow_cron_jobs' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%commercial_recovery%' OR jobname ILIKE '%recovery%';
-- Expected: 0

SELECT 'wa_outbox_recovery_origin_recent' AS check_id, count(*) AS n
FROM public.wa_outbox
WHERE created_at >= now() - interval '1 hour'
  AND (content ILIKE '%recuperacao%' OR content ILIKE '%recovery%');
-- Expected: 0


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_2rc1' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'tracker_mig_174', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000174'),
  'workflow_table_ready', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commercial_recovery_workflow_items'),
  'events_table_ready',   EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commercial_recovery_events'),
  'workflow_view_ready',  EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view'),
  'workflow_rpcs_count', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (
    'commercial_recovery_workflow_create_or_get','commercial_recovery_workflow_update_stage',
    'commercial_recovery_workflow_update_priority','commercial_recovery_workflow_set_next_action',
    'commercial_recovery_workflow_add_note','commercial_recovery_workflow_mark_recovered',
    'commercial_recovery_workflow_discard','commercial_recovery_workflow_suggest_message')),
  'duplicate_active_count', (SELECT count(*) FROM (SELECT clinic_id, source_type, source_id, count(*) c FROM public.commercial_recovery_workflow_items WHERE archived_at IS NULL GROUP BY clinic_id, source_type, source_id HAVING count(*) > 1) s),
  'orphan_count', (SELECT count(*) FROM public.commercial_recovery_workflow_items WHERE archived_at IS NULL AND lead_id IS NULL AND appointment_id IS NULL AND orcamento_id IS NULL),
  'invalid_stage_count', (SELECT count(*) FROM public.commercial_recovery_workflow_items WHERE stage NOT IN ('novo','em_analise','primeira_tentativa','aguardando_resposta','retorno_agendado','recuperado','descartado','arquivado')),
  'invalid_priority_count', (SELECT count(*) FROM public.commercial_recovery_workflow_items WHERE priority NOT IN ('baixa','media','alta','urgente')),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'cron_recovery_jobs', (SELECT count(*) FROM cron.job WHERE command ILIKE '%commercial_recovery%' OR jobname ILIKE '%recovery%'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commercial_recovery_workflow_items')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commercial_recovery_events')
    AND EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view')
    AND (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN (
      'commercial_recovery_workflow_create_or_get','commercial_recovery_workflow_update_stage',
      'commercial_recovery_workflow_update_priority','commercial_recovery_workflow_set_next_action',
      'commercial_recovery_workflow_add_note','commercial_recovery_workflow_mark_recovered',
      'commercial_recovery_workflow_discard','commercial_recovery_workflow_suggest_message')) = 8
  )
) AS data;
