-- ============================================================================
-- Migration 155 · DOWN · NO-OP defensivo
-- ============================================================================
--
-- Forward-only. Rollback DEVE ser feito via FORWARD migration nova.
--
-- Por que NO-OP:
--   - Restaurar versão pré-155 (com lead_id=null no INSERT) reintroduziria
--     o bug NOT NULL · cron daily-agenda-summary voltaria a falhar quando
--     houver agenda real.
--   - Dropar a função quebraria o cron job 12 (ATIVO).
--
-- Rollback correto:
--   1. Criar mig 156 forward com CREATE OR REPLACE FUNCTION restaurando a
--      versão desejada.
--   2. Aplicar mig 156 + repair tracker.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  RAISE NOTICE
    'mig 155 DOWN é NO-OP defensivo · rollback exige forward migration nova (não revert)';
END $$;

COMMIT;
