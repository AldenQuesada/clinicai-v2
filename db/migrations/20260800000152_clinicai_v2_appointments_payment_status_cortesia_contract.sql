-- ============================================================================
-- Migration 152 · clinicai-v2 · appointments.payment_status contract com 'cortesia'
-- ============================================================================
--
-- Propósito: versionar o contrato real de `appointments.payment_status` que
-- inclui o valor 'cortesia'. Pre-flight no banco real (CLINIIC AI v2,
-- project oqboitkpcvuaudouwvkl) mostrou que:
--
--   1. RPC `appointment_finalize` aceita p_payment_status='cortesia' como
--      válido (banco real · não mig 065).
--   2. Constraint `chk_appt_payment_status` ATUAL já permite cortesia
--      (verificado via pg_get_constraintdef).
--   3. Tracker NÃO tem nenhuma migration registrada que documente esse
--      ajuste · alteração foi feita fora do path versionado (provavelmente
--      via Studio).
--   4. Dados em prod estão limpos: payment_status IN ('pago'(1), 'pendente'(2)).
--      Nenhum valor fora do contrato final.
--
-- Esta migration é puramente de governança: garante que o repo é fonte
-- da verdade do contrato e que ambientes novos (dev/preview) terão a
-- constraint correta.
--
-- IDEMPOTÊNCIA:
--   - Se a constraint já inclui cortesia, retorna NOTICE e não recria.
--   - Se contém valor fora do contrato em prod, ABORTA com EXCEPTION
--     (defensivo · força revisão humana antes de qualquer DROP CONSTRAINT).
--   - DROP CONSTRAINT IF EXISTS antes do ADD garante segurança em rerun.
--
-- ESCOPO QUE NÃO ESTÁ NESTA MIG:
--   - Alteração em appointment_finalize ou outras RPCs.
--   - UPDATE/INSERT/DELETE em `appointments` (zero DML).
--   - GRANT/REVOKE.
--   - Outras tabelas / colunas.
--   - Backfill.
--
-- Rollback:
--   - Down: NO-OP defensivo (não remove cortesia · forward migration ajusta).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_constraint_def text;
BEGIN
  -- 1. Abort defensivo se existir dado fora do contrato final.
  IF EXISTS (
    SELECT 1
    FROM public.appointments
    WHERE payment_status IS NOT NULL
      AND payment_status NOT IN (
        'pendente',
        'parcial',
        'pago',
        'cortesia',
        'isento'
      )
  ) THEN
    RAISE EXCEPTION
      'appointments.payment_status contains values outside final contract';
  END IF;

  -- 2. Ler constraint atual, se existir.
  SELECT pg_get_constraintdef(c.oid)
    INTO v_constraint_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.appointments'::regclass
    AND c.conname = 'chk_appt_payment_status';

  -- 3. Se a constraint já menciona todos os valores finais, não recriar.
  IF v_constraint_def IS NOT NULL
     AND v_constraint_def ILIKE '%pendente%'
     AND v_constraint_def ILIKE '%parcial%'
     AND v_constraint_def ILIKE '%pago%'
     AND v_constraint_def ILIKE '%cortesia%'
     AND v_constraint_def ILIKE '%isento%'
  THEN
    RAISE NOTICE
      'chk_appt_payment_status already includes cortesia; contract already satisfied';
    RETURN;
  END IF;

  -- 4. Caso contrário, substituir pela constraint oficial.
  ALTER TABLE public.appointments
    DROP CONSTRAINT IF EXISTS chk_appt_payment_status;

  ALTER TABLE public.appointments
    ADD CONSTRAINT chk_appt_payment_status
    CHECK (
      payment_status = ANY (
        ARRAY[
          'pendente'::text,
          'parcial'::text,
          'pago'::text,
          'cortesia'::text,
          'isento'::text
        ]
      )
    );

  RAISE NOTICE
    'chk_appt_payment_status updated to include cortesia';
END $$;

COMMENT ON CONSTRAINT chk_appt_payment_status ON public.appointments IS
  'CRM payment status contract: pendente|parcial|pago|cortesia|isento. Cortesia is distinct from isento and is used for complimentary/voucher/partnership appointments.';

NOTIFY pgrst, 'reload schema';

COMMIT;
