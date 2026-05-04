-- ============================================================================
-- Rollback de mig 121 · restaura wa_messages_select_clinic sem deleted_at IS NULL
-- ============================================================================
--
-- Volta a policy SELECT ao estado pré-mig 121:
--
--   USING (clinic_id = app_clinic_id())
--
-- ⚠️  ATENÇÃO · ROLLBACK REINTRODUZ VAZAMENTO DE SOFT-DELETED ⚠️
--
-- Após este DOWN, qualquer mensagem com deleted_at IS NOT NULL volta a
-- aparecer em SELECTs do inbox. Hoje deleted_at está populada em 0/733
-- rows, então o impacto imediato é zero · MAS, no momento em que feature
-- de soft-delete for usada, as msgs apagadas vazariam novamente.
--
-- Use este DOWN apenas em rollback de investigação · em produção normal
-- NÃO há motivo pra reverter.
--
-- O QUE NÃO FAZ:
--   - NÃO toca em wa_messages_insert_policy.
--   - NÃO toca em outras policies.
--   - NÃO toca em dados.
--
-- DROP + CREATE em transação · idempotente.

BEGIN;

-- ── 1. Drop policy atual (com deleted_at IS NULL) ─────────────────────────

DROP POLICY IF EXISTS wa_messages_select_clinic ON public.wa_messages;

-- ── 2. Recria policy no estado anterior (sem filtro deleted_at) ───────────

CREATE POLICY wa_messages_select_clinic
  ON public.wa_messages
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
  );

-- ── 3. Sanity check ───────────────────────────────────────────────────────

DO $$
DECLARE
  v_policy_exists  INT;
  v_using_expr     TEXT;
BEGIN
  SELECT count(*) INTO v_policy_exists
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'wa_messages'
    AND policyname = 'wa_messages_select_clinic';

  IF v_policy_exists <> 1 THEN
    RAISE EXCEPTION 'mig 121 DOWN · wa_messages_select_clinic não existe pós-rollback · count=%', v_policy_exists;
  END IF;

  SELECT qual::text INTO v_using_expr
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'wa_messages'
    AND policyname = 'wa_messages_select_clinic';

  -- Estado pré-mig 121: app_clinic_id() presente, deleted_at AUSENTE
  IF v_using_expr IS NULL
     OR v_using_expr NOT ILIKE '%app_clinic_id()%' THEN
    RAISE EXCEPTION 'mig 121 DOWN · USING expression sem app_clinic_id() · expr=%', v_using_expr;
  END IF;

  IF v_using_expr ILIKE '%deleted_at%' THEN
    RAISE EXCEPTION 'mig 121 DOWN · USING expression ainda contém deleted_at · rollback incompleto · expr=%', v_using_expr;
  END IF;

  RAISE NOTICE 'mig 121 DOWN · wa_messages_select_clinic restaurada (sem filtro deleted_at) · ATENÇÃO soft-deleted vazam de novo';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
