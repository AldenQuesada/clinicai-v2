-- ============================================================================
-- Migration 158 · DOWN · NO-OP defensivo
-- ============================================================================
--
-- Forward-only. Rollback DEVE ser feito via FORWARD migration nova.
--
-- Por que NO-OP:
--   - Restaurar a versão pré-mig158 reintroduz o bug que permite
--     `wa_outbox.content = ''` (silenciosamente bloqueando entrega).
--   - Nenhum dado foi alterado pela mig 158 · só a definição da função.
--   - Função antiga ainda está no histórico git (commit anterior).
--
-- Rollback correto:
--   1. Criar mig 159 forward com a CREATE OR REPLACE desejada.
--   2. Aplicar mig 159 + repair tracker.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  RAISE NOTICE
    'mig 158 DOWN é NO-OP defensivo · rollback exige forward migration nova';
END $$;

COMMIT;
