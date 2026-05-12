-- ============================================================================
-- CRM_PHASE_2L.2 · VALIDATION SQL · CLOUD META CANARY PREFLIGHT
-- ============================================================================
-- READ-ONLY · zero INSERT/UPDATE/DELETE.
-- ============================================================================


-- 00 · Safety jobs
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90, 91, 92, 93, 94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

SELECT 'no_send_cron_active' AS check_id,
       NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%') AS data;


-- 01 · Schema · wa_message_templates (mirror columns)
SELECT 'meta_columns_added' AS check_id,
       jsonb_build_object(
         'meta_approval_status', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_approval_status'),
         'meta_approval_checked_at', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_approval_checked_at'),
         'meta_template_name', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_template_name'),
         'meta_language', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_language'),
         'meta_category', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_category'),
         'meta_rejection_reason', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_rejection_reason'),
         'meta_payload', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_payload')
       ) AS data;

SELECT 'meta_status_constraint' AS check_id, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='wa_message_templates' AND c.conname='chk_wa_template_meta_approval_status';

SELECT 'meta_approved_index' AS check_id, indexname, indexdef
FROM pg_indexes WHERE schemaname='public' AND tablename='wa_message_templates' AND indexname='idx_wa_template_meta_approved_active';


-- 02 · Schema · canary attempts
SELECT 'canary_attempts_table' AS check_id,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts') AS data;

SELECT 'canary_attempts_columns' AS check_id,
       jsonb_agg(column_name ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts';

-- Verifica AUSÊNCIA de coluna que armazene número completo
SELECT 'canary_no_full_phone_column' AS check_id,
       NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts'
           AND column_name IN ('phone','recipient','phone_e164','to_phone')
       ) AS data;

SELECT 'canary_required_columns' AS check_id, jsonb_build_object(
  'recipient_hash', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts' AND column_name='recipient_hash'),
  'recipient_last4', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts' AND column_name='recipient_last4'),
  'dry_run', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts' AND column_name='dry_run'),
  'status', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts' AND column_name='status'),
  'request_payload_masked', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts' AND column_name='request_payload_masked'),
  'response_payload_masked', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts' AND column_name='response_payload_masked')
) AS data;

SELECT 'canary_constraints' AS check_id, conname, pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='wa_cloud_meta_canary_attempts' AND contype='c'
ORDER BY conname;

SELECT 'canary_rls_enabled' AS check_id,
       relrowsecurity AS rls_on
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='wa_cloud_meta_canary_attempts';

SELECT 'canary_log_fn' AS check_id,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='wa_cloud_meta_canary_log';


-- 03 · Template readiness
SELECT 'templates_by_meta_status' AS check_id,
       COALESCE(meta_approval_status, 'NULL') AS status,
       count(*) AS n,
       count(*) FILTER (WHERE active=true) AS active_count
FROM public.wa_message_templates
GROUP BY meta_approval_status
ORDER BY status;

SELECT 'approved_active_templates' AS check_id, count(*) AS n
FROM public.wa_message_templates
WHERE active=true AND meta_approval_status='approved';

SELECT 'unknown_or_null_templates' AS check_id, count(*) AS n
FROM public.wa_message_templates
WHERE meta_approval_status IS NULL OR meta_approval_status='unknown';


-- 04 · Channel safety
SELECT 'lara_cloud_ready' AS check_id, count(*) AS n
FROM public.wa_numbers
WHERE label ILIKE '%Lara%'
  AND is_active=true
  AND phone_number_id IS NOT NULL
  AND access_token IS NOT NULL
  AND business_account_id IS NOT NULL;

SELECT 'mih_still_evolution' AS check_id, count(*) AS n
FROM public.wa_numbers
WHERE label ILIKE '%Secretaria%'
  AND instance_id IS NOT NULL
  AND phone_number_id IS NULL;


-- 05 · Outbox safety
SELECT 'wa_outbox_safety' AS check_id, jsonb_build_object(
  'queued', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'pending_old_1h', (SELECT count(*) FROM public.wa_outbox WHERE status IN ('queued','pending') AND created_at < now() - interval '1 hour'),
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71)
) AS data;


-- 99 · Final flags
SELECT 'final_flags_2l2' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'meta_status_columns_ready', (
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_approval_status')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wa_message_templates' AND column_name='meta_payload')
  ),
  'canary_audit_ready', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts'),
  'canary_log_fn_ready', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='wa_cloud_meta_canary_log'),
  'approved_template_count', (SELECT count(*) FROM public.wa_message_templates WHERE active=true AND meta_approval_status='approved'),
  'queued_count', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending_count', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'lara_cloud_ready', (SELECT count(*) > 0 FROM public.wa_numbers WHERE label ILIKE '%Lara%' AND is_active=true AND phone_number_id IS NOT NULL AND access_token IS NOT NULL AND business_account_id IS NOT NULL),
  'tracker_mig_168', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000168'),
  'canary_real_send_allowed', false,
  'can_open_2l3', (
    (SELECT count(*) FROM public.wa_message_templates WHERE active=true AND meta_approval_status='approved') >= 1
    AND (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) > 0 FROM public.wa_numbers WHERE label ILIKE '%Lara%' AND is_active=true AND phone_number_id IS NOT NULL AND access_token IS NOT NULL AND business_account_id IS NOT NULL)
  )
) AS data;
