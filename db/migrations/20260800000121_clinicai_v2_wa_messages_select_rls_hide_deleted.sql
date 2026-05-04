-- ============================================================================
-- RLS · wa_messages_select_clinic · filtra deleted_at IS NULL
-- ============================================================================
--
-- Contexto · audit 2026-05-04:
--
-- A policy SELECT em wa_messages tinha apenas filtro multi-tenant:
--
--   USING (clinic_id = app_clinic_id())
--
-- Mensagens soft-deleted (deleted_at IS NOT NULL) continuavam visíveis no
-- inbox · qualquer query authenticated as via como rows normais. Hoje a
-- coluna `deleted_at` está populada em 0/733 rows · feature de soft-delete
-- nunca foi exercitada · MAS, no momento em que ela for ativada (por código
-- da app, RPC, ou data ops), as msgs apagadas vazariam pra UI.
--
-- Esta mig redefine a policy adicionando o filtro defensivo:
--
--   USING (clinic_id = app_clinic_id() AND deleted_at IS NULL)
--
-- Espelha o padrão já existente em wa_conversations_select_clinic
-- (ver pg_policies · usa `deleted_at IS NULL` na mesma posição).
--
-- O QUE NÃO FAZ:
--   - NÃO toca em wa_messages_insert_policy (WITH CHECK clinic_id = app_clinic_id()).
--   - NÃO toca em outras policies.
--   - NÃO toca em dados.
--   - NÃO altera código aplicacional.
--
-- Versionamento da correção JÁ aplicada em prod via DDL ad-hoc.
-- DROP + CREATE em transação · reaplicar = no-op funcional (idempotente).

BEGIN;

-- ── 1. Drop policy antiga ─────────────────────────────────────────────────

DROP POLICY IF EXISTS wa_messages_select_clinic ON public.wa_messages;

-- ── 2. Recria policy com filtro deleted_at IS NULL ────────────────────────

CREATE POLICY wa_messages_select_clinic
  ON public.wa_messages
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
  );

-- ── 3. Sanity check ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_policy_exists  INT;
  v_using_expr     TEXT;
  v_insert_intact  INT;
BEGIN
  -- (a) policy existe
  SELECT count(*) INTO v_policy_exists
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'wa_messages'
    AND policyname = 'wa_messages_select_clinic';

  IF v_policy_exists <> 1 THEN
    RAISE EXCEPTION 'mig 121 · wa_messages_select_clinic não existe pós-mig · count=%', v_policy_exists;
  END IF;

  -- (b) USING contém o novo guard deleted_at IS NULL
  SELECT qual::text INTO v_using_expr
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'wa_messages'
    AND policyname = 'wa_messages_select_clinic';

  IF v_using_expr IS NULL
     OR v_using_expr NOT ILIKE '%deleted_at IS NULL%'
     OR v_using_expr NOT ILIKE '%app_clinic_id()%' THEN
    RAISE EXCEPTION 'mig 121 · USING expression sem deleted_at IS NULL ou app_clinic_id() · expr=%', v_using_expr;
  END IF;

  -- (c) policy INSERT preservada (não foi tocada)
  SELECT count(*) INTO v_insert_intact
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'wa_messages'
    AND policyname = 'wa_messages_insert_policy';

  IF v_insert_intact <> 1 THEN
    RAISE WARNING 'mig 121 · wa_messages_insert_policy NÃO está presente · estado inesperado (não bloqueia mig)';
  END IF;

  RAISE NOTICE 'mig 121 · wa_messages_select_clinic com deleted_at IS NULL · INSERT policy preservada · OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
