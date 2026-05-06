-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-135 · clinicai-v2 · wa_chat_mirror RLS + grant authenticated║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug em produção (audit 2026-05-06):                                     ║
-- ║   Mig 133 fez REVOKE ALL FROM authenticated · sem RLS habilitada.       ║
-- ║   Endpoint /api/conversations?inbox=secretaria usa client SSR (role     ║
-- ║   authenticated via JWT do user logado). Como não há GRANT pra           ║
-- ║   authenticated, PostgREST retorna empty silently · UI fica em branco.  ║
-- ║                                                                          ║
-- ║ Patch:                                                                   ║
-- ║   1. ENABLE ROW LEVEL SECURITY (defesa em profundidade · multi-tenant)  ║
-- ║   2. POLICY SELECT pra authenticated · escopo clinic_id = app_clinic_id  ║
-- ║   3. GRANT SELECT ON TABLE pra authenticated                            ║
-- ║                                                                          ║
-- ║ Mantém:                                                                  ║
-- ║   service_role com SELECT/INSERT/UPDATE/DELETE (sync via pg_cron mig    ║
-- ║   134 · cron usa service_role internamente)                             ║
-- ║   anon SEM acesso (não exposto · consistente com inbox_notifications)   ║
-- ║                                                                          ║
-- ║ Pattern espelha mig 847 (inbox_notifications).                          ║
-- ║                                                                          ║
-- ║ Idempotente · ENABLE ROW LEVEL é safe se já habilitado · DROP POLICY +  ║
-- ║ CREATE pra reaplicar · GRANT é additive.                                ║
-- ║                                                                          ║
-- ║ ADR-028: multi-tenant via app_clinic_id() JWT helper                    ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RLS habilitada
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wa_chat_mirror ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Policy SELECT · authenticated escopado por clinic_id (ADR-028)
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS wa_chat_mirror_select_own_clinic ON public.wa_chat_mirror;
CREATE POLICY wa_chat_mirror_select_own_clinic
  ON public.wa_chat_mirror FOR SELECT
  TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- INSERT/UPDATE/DELETE NÃO têm policy pra authenticated · só service_role
-- (sync via pg_cron mig 134). Espelha pattern inbox_notifications.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. GRANT SELECT pra authenticated (RLS filtra rows · GRANT abre o portão)
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT ON TABLE public.wa_chat_mirror TO authenticated;

-- service_role já tem SELECT/INSERT/UPDATE/DELETE da mig 133 · não re-grant
-- (idempotente igual mas evita ruído).

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Reload PostgREST schema cache
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Sanity check final
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_rls boolean;
  v_policy_exists boolean;
  v_grant_exists boolean;
BEGIN
  -- RLS habilitada
  SELECT relrowsecurity INTO v_rls
    FROM pg_class
   WHERE oid = 'public.wa_chat_mirror'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION '[mig 135 sanity] RLS nao habilitada em wa_chat_mirror';
  END IF;

  -- Policy SELECT existe
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'wa_chat_mirror'
       AND policyname = 'wa_chat_mirror_select_own_clinic'
  ) INTO v_policy_exists;
  IF NOT v_policy_exists THEN
    RAISE EXCEPTION '[mig 135 sanity] policy wa_chat_mirror_select_own_clinic nao criada';
  END IF;

  -- GRANT SELECT pra authenticated
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name   = 'wa_chat_mirror'
       AND grantee      = 'authenticated'
       AND privilege_type = 'SELECT'
  ) INTO v_grant_exists;
  IF NOT v_grant_exists THEN
    RAISE EXCEPTION '[mig 135 sanity] GRANT SELECT pra authenticated nao registrado';
  END IF;

  RAISE NOTICE '[mig 135] sanity OK · RLS + policy + grant authenticated aplicados';
END
$sanity$;

COMMIT;
