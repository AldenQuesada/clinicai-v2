-- ============================================================================
-- Migration 152 · DOWN · NO-OP defensivo
-- ============================================================================
--
-- Forward-only. Rollback DEVE ser feito via FORWARD migration nova.
--
-- Por que NO-OP:
--   - Remover cortesia da constraint reintroduziria o drift (RPC
--     appointment_finalize já aceita cortesia · UI/operação real usa).
--   - Restaurar versão anterior (sem cortesia) bloquearia inserts e
--     UPDATEs operacionais válidos.
--   - Dropar a constraint inteira deixaria payment_status sem proteção
--     contra valores inválidos.
--
-- Rollback correto:
--   1. Criar mig 153 forward com `ALTER TABLE ... DROP CONSTRAINT
--      IF EXISTS chk_appt_payment_status; ADD CONSTRAINT ...` com o
--      conjunto desejado de valores.
--   2. Aplicar mig 153 + repair tracker.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  RAISE NOTICE
    'Down migration intentionally no-op. payment_status contract with cortesia should be changed only by forward migration.';
END $$;

COMMIT;
