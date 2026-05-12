-- ============================================================================
-- CRM_PHASE_2L · VALIDATION SQL · WhatsApp Real Send Readiness / Ban Gate
-- ============================================================================
-- READ-ONLY. Zero INSERT/UPDATE/DELETE/ALTER/CREATE/DROP/TRUNCATE.
--
-- Use sempre que houver dúvida sobre o gate de envio real.
-- Companion: docs/crm-refactor/45-phase-2l-whatsapp-real-send-ban-gate.md
--
-- A regra inegociável é: worker71_off MUST be true. Se este SQL retornar
-- worker71_off=false em qualquer execução, PARAR IMEDIATAMENTE e investigar.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 00_environment_snapshot
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'env_snapshot' AS check_id, jsonb_build_object(
  'now_utc',  now()::text,
  'now_sp',   (now() AT TIME ZONE 'America/Sao_Paulo')::text,
  'current_database', current_database(),
  'cron_jobs_relevant', (
    SELECT jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'active', active, 'schedule', schedule, 'command', command) ORDER BY jobid)
    FROM cron.job WHERE jobid IN (12, 71, 72, 89, 90)),
  'tracker_mig_160', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000160'),
  'tracker_mig_159', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000159')
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 01_worker_gate · GATE INEGOCIÁVEL
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'worker71_off' AS check_id,
       (SELECT NOT active FROM cron.job WHERE jobid = 71) AS worker71_off_bool,
       (SELECT active FROM cron.job WHERE jobid = 71) AS job71_active,
       'EXPECTED worker71_off_bool=true · se false PARAR IMEDIATAMENTE' AS rule;

-- Qualquer outro job ativo cujo command sugere envio/dispatch/send/worker.
SELECT 'other_send_like_jobs_active' AS check_id, jobid, jobname, schedule, command, active
FROM cron.job
WHERE active = true
  AND (command ILIKE '%outbox_tick%'
       OR command ILIKE '%dispatch%'
       OR command ILIKE '%send%'
       OR command ILIKE '%provider%'
       OR command ILIKE '%evolution%'
       OR command ILIKE '%meta%')
  AND jobid <> 71  -- worker já é OFF e não cabe nesta lista
ORDER BY jobid;
-- Expected: zero rows · se aparecer, investigar (pode ser cron legitimo b2b/lp/etc não relacionado a envio paciente)


-- ────────────────────────────────────────────────────────────────────────────
-- 02_outbox_safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'outbox_overall' AS check_id, jsonb_build_object(
  'total', (SELECT count(*) FROM public.wa_outbox),
  'by_status', (SELECT jsonb_object_agg(coalesce(status,'null'), n) FROM (SELECT status, count(*) n FROM public.wa_outbox GROUP BY status) s),
  'queued_total', (SELECT count(*) FROM public.wa_outbox WHERE status IN ('queued','pending','retry','retrying')),
  'pending_old_1h', (SELECT count(*) FROM public.wa_outbox WHERE status IN ('queued','pending','retry') AND created_at < now() - interval '1 hour'),
  'empty_content', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content=''),
  'empty_phone',   (SELECT count(*) FROM public.wa_outbox WHERE phone IS NULL OR phone=''),
  'missing_lead_id', (SELECT count(*) FROM public.wa_outbox WHERE lead_id IS NULL),
  'last_24h_total', (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '24 hours')
) AS data;

SELECT 'outbox_by_rule_24h' AS check_id, rule_id, count(*) AS n_24h
FROM public.wa_outbox
WHERE rule_id IS NOT NULL
  AND created_at >= now() - interval '24 hours'
GROUP BY rule_id
ORDER BY n_24h DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- 03_agenda_queue_safety
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'agenda_alerts_log_overall' AS check_id, jsonb_build_object(
  'total', (SELECT count(*) FROM public.agenda_alerts_log),
  'last_24h', (SELECT count(*) FROM public.agenda_alerts_log WHERE created_at >= now() - interval '24 hours'),
  'day_minus_1_total', (SELECT count(*) FROM public.agenda_alerts_log WHERE alert_kind = 'day_minus_1'),
  'day_zero_total',    (SELECT count(*) FROM public.agenda_alerts_log WHERE alert_kind = 'day_zero'),
  'by_alert_kind', (SELECT jsonb_object_agg(coalesce(alert_kind,'null'), n) FROM (SELECT alert_kind, count(*) n FROM public.agenda_alerts_log GROUP BY alert_kind) s)
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 04_provider_inventory · DEFENSIVO via information_schema
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'candidate_tables_provider' AS check_id, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name ILIKE '%wa_number%'
       OR table_name ILIKE '%wa_instance%'
       OR table_name ILIKE '%whatsapp_instance%'
       OR table_name ILIKE '%clinic_whatsapp%'
       OR table_name ILIKE '%wa_chat%'
       OR table_name ILIKE '%wa_session%')
ORDER BY table_name;

-- Schema da wa_numbers (sabidamente existe)
SELECT 'wa_numbers_columns' AS check_id, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'wa_numbers'
ORDER BY ordinal_position;

-- Snapshot read-only de wa_numbers · NÃO retorna access_token nem chaves
SELECT 'wa_numbers_safe_rows' AS check_id,
       id, label, phone, instance_id, inbox_role, is_active,
       number_type, default_context_type,
       (phone_number_id IS NOT NULL) AS has_cloud_meta_phone_id,
       (access_token IS NOT NULL AND length(access_token) > 0) AS has_cloud_meta_token,
       (business_account_id IS NOT NULL AND length(business_account_id) > 0) AS has_waba_id,
       (api_url IS NOT NULL AND length(api_url) > 0) AS has_evolution_url
FROM public.wa_numbers
ORDER BY label;


-- ────────────────────────────────────────────────────────────────────────────
-- 05_mih_secretaria_channel
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'mih_canonical_lookup' AS check_id,
       id, label, phone, inbox_role, is_active, instance_id,
       (phone_number_id IS NOT NULL) AS has_cloud_meta,
       (api_url IS NOT NULL) AS has_evolution
FROM public.wa_numbers
WHERE phone = '5544991622986' OR label = 'Secretaria B&H';
-- Expected: 1 row · canal Mih

SELECT 'secretaria_role_channels_count' AS check_id, count(*) AS n
FROM public.wa_numbers WHERE inbox_role = 'secretaria';

SELECT 'secretaria_role_channels_list' AS check_id,
       id, label, phone, is_active,
       (api_url IS NOT NULL) AS has_evolution,
       (phone_number_id IS NOT NULL) AS has_cloud_meta
FROM public.wa_numbers
WHERE inbox_role = 'secretaria'
ORDER BY label;


-- ────────────────────────────────────────────────────────────────────────────
-- 06_send_readiness_flags · constantes documentais + agregados
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'send_readiness_flags' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid = 71),
  'no_send_cron_active', NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE active = true
      AND command ILIKE '%_wa_outbox_tick%'),
  'unsafe_outbox_count', (
    SELECT count(*) FROM public.wa_outbox
    WHERE content IS NULL OR content=''
       OR phone IS NULL OR phone=''
       OR lead_id IS NULL),
  'd_before_cron_active', (SELECT active FROM cron.job WHERE jobname='agenda-alert-d-before-tick'),
  'd_zero_cron_active',   (SELECT active FROM cron.job WHERE jobname='agenda-alert-d-zero-tick'),
  -- Constantes documentais (manuais) refletindo decisão humana da fase 2L:
  'real_send_blocked_by_ban',  true,        -- documentado em 45-phase-2l
  'can_activate_worker71',     false,       -- gate inegociável
  -- Disponibilidade canais alternativos pra futura readiness:
  'lara_cloud_meta_present', EXISTS (
    SELECT 1 FROM public.wa_numbers
    WHERE phone_number_id IS NOT NULL AND length(phone_number_id) > 0
      AND business_account_id IS NOT NULL AND length(business_account_id) > 0
      AND is_active = true),
  'mih_baileys_still_present_but_banned', EXISTS (
    SELECT 1 FROM public.wa_numbers
    WHERE phone = '5544991622986' AND api_url IS NOT NULL AND is_active = true)
) AS data;


-- ────────────────────────────────────────────────────────────────────────────
-- 07_final_verdict_inputs
-- ────────────────────────────────────────────────────────────────────────────
WITH checks AS (
  SELECT 'worker71_off' AS check_name,
         CASE WHEN (SELECT NOT active FROM cron.job WHERE jobid=71) THEN 'PASS' ELSE 'FAIL · WORKER ON · PARAR' END AS status,
         (SELECT active FROM cron.job WHERE jobid=71)::text AS detail
  UNION ALL
  SELECT 'no_outbox_pending_old',
         CASE WHEN (SELECT count(*) FROM public.wa_outbox WHERE status IN ('queued','pending','retry') AND created_at < now() - interval '1 hour') = 0
              THEN 'PASS' ELSE 'WARN · queue antiga acumulada · investigar antes de qualquer enable' END,
         (SELECT count(*) FROM public.wa_outbox WHERE status IN ('queued','pending','retry') AND created_at < now() - interval '1 hour')::text
  UNION ALL
  SELECT 'no_unsafe_outbox',
         CASE WHEN (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
              THEN 'PASS' ELSE 'FAIL · OUTBOX UNSAFE · NUNCA ATIVAR WORKER COM ISSO' END,
         (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)::text
  UNION ALL
  SELECT 'crons_dry_mode_consistent',
         CASE WHEN (SELECT active FROM cron.job WHERE jobname='agenda-alert-d-before-tick')
                AND (SELECT active FROM cron.job WHERE jobname='agenda-alert-d-zero-tick')
                AND NOT (SELECT active FROM cron.job WHERE jobid=71)
              THEN 'PASS · dry-mode coerente'
              ELSE 'WARN · estado inconsistente' END,
         jsonb_build_object(
           'd_before_on', (SELECT active FROM cron.job WHERE jobname='agenda-alert-d-before-tick'),
           'd_zero_on',   (SELECT active FROM cron.job WHERE jobname='agenda-alert-d-zero-tick'),
           'worker_off',  (SELECT NOT active FROM cron.job WHERE jobid=71)
         )::text
  UNION ALL
  SELECT 'mih_channel_present',
         CASE WHEN EXISTS (SELECT 1 FROM public.wa_numbers WHERE phone='5544991622986' AND is_active=true)
              THEN 'PASS · Mih wa_number registrado · status real depende de Meta/WhatsApp side · ver doc 45'
              ELSE 'WARN · Mih não encontrado em wa_numbers' END,
         (SELECT id::text FROM public.wa_numbers WHERE phone='5544991622986' LIMIT 1)
  UNION ALL
  SELECT 'lara_cloud_meta_present',
         CASE WHEN EXISTS (SELECT 1 FROM public.wa_numbers WHERE phone_number_id IS NOT NULL AND business_account_id IS NOT NULL AND is_active=true)
              THEN 'PASS · canal Cloud Meta API alternativo disponível'
              ELSE 'WARN · sem canal Cloud Meta API · ban Mih bloqueia tudo' END,
         (SELECT label || ' · ' || phone FROM public.wa_numbers WHERE phone_number_id IS NOT NULL AND is_active=true LIMIT 1)
  UNION ALL
  SELECT 'real_send_blocked_by_ban',
         'CONSTANT · TRUE',
         'doc canônico: docs/crm-refactor/45-phase-2l-whatsapp-real-send-ban-gate.md'
)
SELECT check_name, status, detail FROM checks;
