-- ============================================================================
-- Migration 179 · CRM_PHASE_CONTROL.2 · ALEXA DORMANT RPCS CLEANUP
-- ============================================================================
--
-- Propósito:
--   2 ações cirúrgicas sobre 9 RPCs Alexa dormentes catalogadas em CONTROL.1:
--
--   AÇÃO A · DROP de 7 RPCs com tabelas backing INEXISTENTES (BROKEN):
--     - alexa_log_announce (refs alexa_announce_log · tabela dropada anteriormente)
--     - alexa_log_update (idem)
--     - alexa_metrics (idem)
--     - alexa_pending_queue (idem)
--     - delete_alexa_device (refs alexa_devices · dropada)
--     - get_alexa_devices (idem)
--     - upsert_alexa_device (idem)
--   → Estas RPCs JÁ falham ao ser chamadas (table not found) ·
--     drop não muda comportamento operacional · só limpa o schema.
--
--   AÇÃO B · REVOKE EXECUTE FROM authenticated nas 2 RPCs que TÊM tabela viva:
--     - get_alexa_config (refs clinic_alexa_config · existe)
--     - upsert_alexa_config (idem)
--   → REVOKE preserva função (rollback fácil via GRANT) · impede UI v2 e
--     legacy JS (alexa-settings.js) de invocar via authenticated.
--   → service_role permanece pode invocar (emergency rollback).
--
-- Auditoria CONTROL.2:
--   - ZERO callers via pg_depend (`alexa_callers=null` no scan)
--   - ZERO uso em apps/v2 src/ (omissão explícita em ClinicSettingsClient.tsx:53)
--   - Legacy JS usa apenas em scripts dormentes (`apps/lara/public/legacy/js/alexa-*`)
--   - Tabelas `alexa_devices` + `alexa_announce_log` já não existem
--
-- O que NÃO faz:
--   - Não dropa `clinic_alexa_config` (decisão diferida · pode ter config residual)
--   - Não dropa coluna `clinic_rooms.alexa_device_name` (decisão diferida)
--   - Não toca cron · nem env · nem WhatsApp · nem provider
--
-- Rollback (down):
--   - GRANT EXECUTE de volta nas 2 RPCs com REVOKE
--   - Recriar as 7 RPCs dropadas exige restaurar tabelas backing PRIMEIRO ·
--     down note documenta · não tenta recreate cego.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- AÇÃO A · DROP RPCs com tabelas backing inexistentes (BROKEN no-op)
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.alexa_log_announce(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.alexa_log_update(uuid, text, text);
DROP FUNCTION IF EXISTS public.alexa_metrics(integer);
DROP FUNCTION IF EXISTS public.alexa_pending_queue();

DROP FUNCTION IF EXISTS public.delete_alexa_device(uuid);
DROP FUNCTION IF EXISTS public.get_alexa_devices();
DROP FUNCTION IF EXISTS public.upsert_alexa_device(uuid, text, uuid, uuid, text, boolean);


-- ────────────────────────────────────────────────────────────────────────────
-- AÇÃO B · REVOKE EXECUTE em RPCs com tabela viva (clinic_alexa_config existe)
-- ────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.get_alexa_config() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_alexa_config(text, text, text, text, boolean, text) FROM authenticated;
-- service_role e postgres mantêm EXECUTE (rollback emergência)


-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_broken_remaining integer;
  v_authenticated_can_exec integer;
  v_service_role_can_exec integer;
BEGIN
  -- 1. Confirma que as 7 broken foram dropadas
  SELECT count(*) INTO v_broken_remaining
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN (
      'alexa_log_announce','alexa_log_update','alexa_metrics','alexa_pending_queue',
      'delete_alexa_device','get_alexa_devices','upsert_alexa_device'
    );
  IF v_broken_remaining > 0 THEN
    RAISE EXCEPTION 'sanity: % broken Alexa RPCs ainda presentes', v_broken_remaining;
  END IF;

  -- 2. Confirma que get_alexa_config e upsert_alexa_config ainda existem
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_alexa_config') THEN
    RAISE EXCEPTION 'sanity: get_alexa_config foi removida indevidamente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_alexa_config') THEN
    RAISE EXCEPTION 'sanity: upsert_alexa_config foi removida indevidamente';
  END IF;

  -- 3. Confirma que authenticated NÃO pode mais executar
  SELECT count(*) INTO v_authenticated_can_exec
  FROM information_schema.routine_privileges
  WHERE routine_schema='public'
    AND routine_name IN ('get_alexa_config','upsert_alexa_config')
    AND grantee='authenticated'
    AND privilege_type='EXECUTE';
  IF v_authenticated_can_exec > 0 THEN
    RAISE EXCEPTION 'sanity: authenticated ainda tem EXECUTE em % Alexa RPCs', v_authenticated_can_exec;
  END IF;

  -- 4. Confirma que service_role mantém EXECUTE
  SELECT count(*) INTO v_service_role_can_exec
  FROM information_schema.routine_privileges
  WHERE routine_schema='public'
    AND routine_name IN ('get_alexa_config','upsert_alexa_config')
    AND grantee='service_role'
    AND privilege_type='EXECUTE';
  IF v_service_role_can_exec < 2 THEN
    RAISE EXCEPTION 'sanity: service_role perdeu EXECUTE em Alexa config RPCs';
  END IF;

  RAISE NOTICE 'mig 179 · 7 broken Alexa RPCs dropped · 2 live config RPCs revoked from authenticated';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
