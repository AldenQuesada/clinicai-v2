-- ============================================================================
-- CRM_PHASE_2RC · VALIDATION SQL · COMMERCIAL RECOVERY FOUNDATION
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


-- 01 · Source counts
SELECT 'perdidos_health' AS check_id, jsonb_build_object(
  'total', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL),
  'recoverable_open', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL AND is_recoverable=true AND recovered_at IS NULL),
  'recovered', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL AND recovered_at IS NOT NULL),
  'discarded', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL AND is_recoverable=false)
) AS data;

SELECT 'appt_cancelled_last_60d' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status='cancelado'
  AND cancelado_em >= now() - interval '60 days';

SELECT 'appt_no_show_last_60d' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL
  AND status='no_show'
  AND no_show_em >= now() - interval '60 days';

SELECT 'orcamento_draft_old' AS check_id, count(*) AS n
FROM public.orcamentos
WHERE deleted_at IS NULL
  AND status='draft'
  AND created_at < now() - interval '14 days';


-- 02 · Recovery schema
SELECT 'view_exists' AS check_id,
       EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_queue_view') AS data;

SELECT 'view_columns' AS check_id,
       jsonb_agg(column_name ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='commercial_recovery_queue_view';

SELECT 'rpcs_recovery' AS check_id, jsonb_build_object(
  'lead_recover_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_recover'),
  'lead_recovery_activate_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_recovery_activate'),
  'perdido_to_lead_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='perdido_to_lead'),
  -- Mig 173 (CRM_PHASE_2RC actions)
  'mark_discarded_rpc_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='recovery_perdido_mark_discarded'),
  'add_note_rpc_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='recovery_perdido_add_note')
) AS data;


-- 03 · Queue health
SELECT 'recovery_queue_total' AS check_id, count(*) AS n
FROM public.commercial_recovery_queue_view;

SELECT 'recovery_queue_by_source' AS check_id, source_type, count(*) AS n
FROM public.commercial_recovery_queue_view
GROUP BY source_type
ORDER BY n DESC;

SELECT 'recovery_queue_by_status' AS check_id, status, count(*) AS n
FROM public.commercial_recovery_queue_view
GROUP BY status
ORDER BY n DESC;

SELECT 'recovery_queue_by_priority' AS check_id, priority, count(*) AS n
FROM public.commercial_recovery_queue_view
GROUP BY priority
ORDER BY priority;

-- Duplicates por (source_type, source_id) NÃO devem existir (view é UNION ALL de fontes disjuntas)
SELECT 'duplicate_recovery_count' AS check_id, count(*) AS n
FROM (
  SELECT source_type, source_id, count(*) AS c
  FROM public.commercial_recovery_queue_view
  GROUP BY source_type, source_id
  HAVING count(*) > 1
) s;
-- Expected: 0

-- Orphan: items sem lead_id E sem patient_id (subject ausente)
SELECT 'orphan_recovery_count' AS check_id, count(*) AS n
FROM public.commercial_recovery_queue_view
WHERE lead_id IS NULL AND patient_id IS NULL;

-- Invalid priority/status (defensivo · view computa via CASE)
SELECT 'invalid_priority_count' AS check_id, count(*) AS n
FROM public.commercial_recovery_queue_view
WHERE priority NOT IN ('baixa','media','alta');

SELECT 'invalid_status_count' AS check_id, count(*) AS n
FROM public.commercial_recovery_queue_view
WHERE status NOT IN ('aberto','recuperado','descartado','em_contato','arquivado');


-- 04 · Actions safety (zero wa_outbox row criada por recovery)
-- View é READ-ONLY · nunca cria wa_outbox por design.
SELECT 'wa_outbox_recent_recovery_origin' AS check_id, count(*) AS n
FROM public.wa_outbox
WHERE created_at >= now() - interval '1 hour'
  AND (content ILIKE '%recovery%' OR content ILIKE '%recuperacao%');
-- Expected: 0


-- 99 · Final flags
SELECT 'final_flags_2rc' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'recovery_queue_view_ready', EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_queue_view'),
  'lead_recover_rpc_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_recover'),
  'perdidos_table_ready', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='perdidos'),
  'recovery_queue_total', (SELECT count(*) FROM public.commercial_recovery_queue_view),
  'duplicate_recovery_count', (SELECT count(*) FROM (SELECT source_type, source_id, count(*) c FROM public.commercial_recovery_queue_view GROUP BY source_type, source_id HAVING count(*) > 1) s),
  'orphan_recovery_count', (SELECT count(*) FROM public.commercial_recovery_queue_view WHERE lead_id IS NULL AND patient_id IS NULL),
  'invalid_priority_count', (SELECT count(*) FROM public.commercial_recovery_queue_view WHERE priority NOT IN ('baixa','media','alta')),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'tracker_mig_172', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000172'),
  'tracker_mig_173', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000173'),
  'mark_discarded_rpc_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='recovery_perdido_mark_discarded'),
  'add_note_rpc_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='recovery_perdido_add_note'),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_queue_view')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='lead_recover')
    AND (SELECT count(*) FROM (SELECT source_type, source_id, count(*) c FROM public.commercial_recovery_queue_view GROUP BY source_type, source_id HAVING count(*) > 1) s) = 0
  )
) AS data;
