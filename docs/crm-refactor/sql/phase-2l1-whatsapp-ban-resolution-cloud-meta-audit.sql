-- ============================================================================
-- CRM_PHASE_2L.1 · WHATSAPP BAN RESOLUTION / CLOUD META AUDIT
-- READ-ONLY · secrets MASKED · zero envio
-- ============================================================================


-- 00 · Safety: jobs/crons
SELECT 'cron_state' AS check_id,
       jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'schedule', schedule, 'active', active) ORDER BY jobid) AS data
FROM cron.job WHERE jobid IN (9, 12, 71, 72, 89, 90, 91, 92, 93, 94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

SELECT 'no_send_cron_active' AS check_id,
       NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%') AS data;

SELECT 'crons_touching_outbox_or_dispatch' AS check_id, jobid, jobname, active, substring(command,1,80) AS cmd_first_80
FROM cron.job
WHERE command ILIKE '%wa_outbox%' OR command ILIKE '%dispatch%'
ORDER BY jobid;


-- 01 · Outbox health
SELECT 'wa_outbox_by_status' AS check_id, status, count(*) AS n
FROM public.wa_outbox GROUP BY status ORDER BY n DESC;

SELECT 'wa_outbox_unsafe' AS check_id,
       (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) AS unsafe;

SELECT 'wa_outbox_pending_old_1h' AS check_id, count(*) AS n
FROM public.wa_outbox WHERE status IN ('queued','pending') AND created_at < now() - interval '1 hour';

SELECT 'wa_outbox_last_attempt' AS check_id, max(created_at) AS data
FROM public.wa_outbox WHERE status IN ('sent','failed');

SELECT 'wa_outbox_recent' AS check_id, jsonb_build_object(
  'last_24h', (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '24 hours'),
  'last_7d', (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '7 days'),
  'last_30d', (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '30 days')
) AS data;


-- 02 · Channel inventory (SECRETS MASKED · presence boolean only)
SELECT 'wa_numbers_inventory' AS check_id,
       label,
       CASE WHEN phone IS NOT NULL AND length(phone) >= 4 THEN '...'||right(phone, 4) ELSE 'NULL' END AS phone_last4,
       number_type,
       is_active,
       inbox_role,
       default_context_type,
       -- Evolution presence (provider 1)
       (api_url IS NOT NULL AND api_url <> '') AS evolution_api_url_present,
       (api_key IS NOT NULL AND api_key <> '') AS evolution_api_key_present,
       (instance_id IS NOT NULL AND instance_id <> '') AS evolution_instance_id_present,
       -- Cloud Meta presence (provider 2)
       (phone_number_id IS NOT NULL AND phone_number_id <> '') AS cloud_phone_number_id_present,
       (access_token IS NOT NULL AND access_token <> '') AS cloud_access_token_present,
       (verify_token IS NOT NULL AND verify_token <> '') AS cloud_verify_token_present,
       (business_account_id IS NOT NULL AND business_account_id <> '') AS cloud_business_account_id_present,
       -- Provider resolution (espelho de resolveProviderForConv)
       CASE
         WHEN (instance_id IS NOT NULL AND api_url IS NOT NULL AND api_key IS NOT NULL) THEN 'evolution'
         WHEN (phone_number_id IS NOT NULL AND access_token IS NOT NULL) THEN 'cloud_meta'
         ELSE 'unconfigured'
       END AS resolved_provider
FROM public.wa_numbers
ORDER BY label;


-- 03 · Whatsapp instances (legacy table)
SELECT 'whatsapp_instances' AS check_id,
       name,
       CASE WHEN "phoneNumber" IS NOT NULL AND length("phoneNumber") >= 4 THEN '...'||right("phoneNumber", 4) ELSE 'NULL' END AS phone_last4,
       status,
       ("evolutionInstanceId" IS NOT NULL) AS evolution_present
FROM public.whatsapp_instances;


-- 04 · Template inventory (sem mostrar message body)
SELECT 'wa_message_templates_by_type' AS check_id, type, active, count(*) AS n
FROM public.wa_message_templates
GROUP BY type, active
ORDER BY type, active;

SELECT 'wa_message_templates_total' AS check_id, count(*) AS n FROM public.wa_message_templates;

SELECT 'wa_agenda_automations_active' AS check_id, count(*) AS n
FROM public.wa_agenda_automations WHERE is_active=true;


-- 05 · Provider risk inventory
SELECT 'send_related_fns_count' AS check_id, count(*) AS n
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname ILIKE '%wa_outbox%' OR p.proname ILIKE '%send%' OR p.proname ILIKE '%dispatch%');

SELECT 'cron_dispatch_active_count' AS check_id, count(*) AS n
FROM cron.job
WHERE active=true
  AND (command ILIKE '%dispatch%' OR command ILIKE '%wa_outbox%' OR command ILIKE '%mira_proactive%');


-- 06 · Recent WhatsApp activity (volume measurement · provider-agnostic)
SELECT 'wa_messages_30d_by_direction' AS check_id, direction, count(*) AS n
FROM public.wa_messages
WHERE created_at >= now() - interval '30 days'
GROUP BY direction
ORDER BY direction;

SELECT 'wa_webhook_log_total' AS check_id, count(*) AS n FROM public.wa_webhook_log;


-- 07 · Banned number quarantine check
SELECT 'mih_secretaria_status' AS check_id,
       label,
       is_active,
       CASE WHEN phone IS NOT NULL AND length(phone) >= 4 THEN '...'||right(phone, 4) ELSE 'NULL' END AS phone_last4,
       (api_url IS NOT NULL) AS still_has_evolution_config
FROM public.wa_numbers
WHERE label ILIKE '%Secretaria%' OR label ILIKE '%Mih%'
ORDER BY label;


-- 99 · Final flags
SELECT 'final_flags_2l1' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'no_provider_cron_for_outbox', NOT EXISTS (SELECT 1 FROM cron.job WHERE active=true AND command ILIKE '%_wa_outbox_tick%'),
  'queued_count', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending_count', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'pending_old_1h_count', (SELECT count(*) FROM public.wa_outbox WHERE status IN ('queued','pending') AND created_at < now() - interval '1 hour'),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'cloud_meta_ready_numbers', (SELECT count(*) FROM public.wa_numbers WHERE is_active=true AND phone_number_id IS NOT NULL AND access_token IS NOT NULL),
  'evolution_active_numbers', (SELECT count(*) FROM public.wa_numbers WHERE is_active=true AND instance_id IS NOT NULL AND api_url IS NOT NULL AND api_key IS NOT NULL),
  'lara_cloud_ready', EXISTS (SELECT 1 FROM public.wa_numbers WHERE is_active=true AND label ILIKE '%Lara%' AND phone_number_id IS NOT NULL AND access_token IS NOT NULL AND business_account_id IS NOT NULL),
  'mih_secretaria_still_evolution_only', EXISTS (SELECT 1 FROM public.wa_numbers WHERE label ILIKE '%Secretaria%' AND instance_id IS NOT NULL AND phone_number_id IS NULL),
  'wa_outbox_last_attempt', (SELECT max(created_at) FROM public.wa_outbox WHERE status IN ('sent','failed')),
  'can_activate_worker71', false,
  'reason_block', 'mih_banned_evolution_403 · worker_url_target_unknown · no_canary_done · no_template_approval_check'
) AS data;
