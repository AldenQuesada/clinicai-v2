-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-134 · clinicai-v2 · wa_chat_mirror pg_cron sync             ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Versiona o pg_cron job que mantém wa_chat_mirror (mig 133) sempre        ║
-- ║ fresco · invoca GET https://lara.miriandpaula.com.br/api/cron/wa-chat-   ║
-- ║ sync a cada 1 minuto via pg_net background worker.                       ║
-- ║                                                                          ║
-- ║ Produção · aplicado manualmente em 2026-05-06 17:11 UTC.                 ║
-- ║ Snapshot validado:                                                       ║
-- ║   jobname = wa_chat_mirror_sync_mih                                      ║
-- ║   schedule = * * * * *                                                   ║
-- ║   command = SELECT public._wa_chat_sync_tick();                          ║
-- ║   active = true                                                          ║
-- ║   jobid = 88                                                             ║
-- ║   freshness staleness = 30s · most_recent_msg avançando                 ║
-- ║                                                                          ║
-- ║ Pré-requisitos (já satisfeitos em prod):                                 ║
-- ║   1. mig 133 aplicada (public.wa_chat_mirror existe)                    ║
-- ║   2. extensões pg_cron + pg_net + supabase_vault habilitadas            ║
-- ║   3. vault.secrets contém entry name='CRON_SECRET' (NÃO versionado)     ║
-- ║      mesmo valor da env CRON_SECRET no Easypanel apps/lara              ║
-- ║   4. Endpoint /api/cron/wa-chat-sync deployed em prod (commit 5d08bd1)  ║
-- ║                                                                          ║
-- ║ Rollback: SELECT cron.unschedule('wa_chat_mirror_sync_mih');            ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE OR REPLACE FUNCTION · DO block guarded pra cron.   ║
-- ║                                                                          ║
-- ║ ADR-029: SECURITY DEFINER + SET search_path · GRANT explícito           ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · zero secret no SQL    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Função invoker do cron · lê CRON_SECRET do vault · POST async via pg_net
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._wa_chat_sync_tick()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_url    constant text := 'https://lara.miriandpaula.com.br/api/cron/wa-chat-sync';
  v_secret text;
  v_req_id bigint;
BEGIN
  -- Pega secret do vault Supabase · MESMO valor da env CRON_SECRET no Easypanel
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'CRON_SECRET'
   LIMIT 1;

  IF v_secret IS NULL THEN
    RAISE WARNING '[wa_chat_sync] CRON_SECRET nao no vault — abort';
    RETURN NULL;
  END IF;

  -- Endpoint Next.js usa GET · header x-cron-secret · async fire-and-forget.
  -- Timeout 60s · sync de ~1068 chats fecha em <30s tipicamente.
  SELECT net.http_get(
    url     := v_url,
    headers := jsonb_build_object('x-cron-secret', v_secret),
    timeout_milliseconds := 60000
  ) INTO v_req_id;

  RETURN v_req_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[wa_chat_sync] tick exception: %', SQLERRM;
  RETURN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. GRANT · só service_role + postgres (cron interno)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public._wa_chat_sync_tick() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._wa_chat_sync_tick() TO service_role, postgres;

COMMENT ON FUNCTION public._wa_chat_sync_tick() IS
'pg_cron invoker · GET https://lara.miriandpaula.com.br/api/cron/wa-chat-sync · usa CRON_SECRET do vault. Mig 134.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Schedule cron · idempotente (alter_job se existir, schedule se novo)
-- ═══════════════════════════════════════════════════════════════════════════

DO $cron$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'wa_chat_mirror_sync_mih';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(
      job_id   := v_jobid,
      schedule := '* * * * *',
      command  := 'SELECT public._wa_chat_sync_tick();'
    );
    RAISE NOTICE '[mig 134] cron wa_chat_mirror_sync_mih (jobid=%) alterado pra _wa_chat_sync_tick', v_jobid;
  ELSE
    PERFORM cron.schedule(
      job_name := 'wa_chat_mirror_sync_mih',
      schedule := '* * * * *',
      command  := 'SELECT public._wa_chat_sync_tick();'
    );
    RAISE NOTICE '[mig 134] cron wa_chat_mirror_sync_mih criado · schedule=* * * * *';
  END IF;
END
$cron$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Sanity check final (regra GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_cmd            text;
  v_active         boolean;
  v_secret_exists  boolean;
  v_fn_exists      int;
BEGIN
  -- Função existe + signature correta
  SELECT COUNT(*) INTO v_fn_exists
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_wa_chat_sync_tick';
  IF v_fn_exists < 1 THEN
    RAISE EXCEPTION '[mig 134 sanity] _wa_chat_sync_tick NAO criada';
  END IF;

  -- Cron job existe + apontando pra função certa + ativo
  SELECT command, active
    INTO v_cmd, v_active
    FROM cron.job
   WHERE jobname = 'wa_chat_mirror_sync_mih';

  IF v_cmd IS NULL THEN
    RAISE EXCEPTION '[mig 134 sanity] cron wa_chat_mirror_sync_mih nao criado';
  END IF;
  IF v_cmd !~ '_wa_chat_sync_tick' THEN
    RAISE EXCEPTION '[mig 134 sanity] cron command inesperado: %', v_cmd;
  END IF;
  IF v_active IS DISTINCT FROM true THEN
    RAISE WARNING '[mig 134 sanity] cron criado mas active=% · investigar', v_active;
  END IF;

  -- CRON_SECRET no vault
  SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET')
    INTO v_secret_exists;
  IF NOT v_secret_exists THEN
    RAISE EXCEPTION '[mig 134 sanity] CRON_SECRET nao no vault · cron rodara mas vai abortar em runtime';
  END IF;

  RAISE NOTICE '[mig 134] sanity OK · cron command: % · active=%', v_cmd, v_active;
END
$sanity$;

COMMIT;
