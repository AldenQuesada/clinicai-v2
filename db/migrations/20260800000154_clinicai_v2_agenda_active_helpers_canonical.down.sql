-- ============================================================================
-- Migration 154 · DOWN · NO-OP defensivo
-- ============================================================================
--
-- Forward-only. Rollback DEVE ser feito via FORWARD migration nova.
--
-- Por que NO-OP:
--   - Restaurar versões anteriores de wa_daily_summary/_render_appt_template
--     reintroduziria a referência a appointments.patient_name (coluna que
--     não existe mais · clean-slate mig 062) · cron daily-agenda-summary
--     voltaria a falhar silenciosamente.
--   - Não há versão canon anterior versionada localmente (drift histórico ·
--     função foi alterada fora do path versionado).
--
-- Rollback correto:
--   1. Criar mig 155 forward com CREATE OR REPLACE FUNCTION restaurando a
--      versão desejada.
--   2. Aplicar mig 155 + repair tracker.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  RAISE NOTICE
    'mig 154 DOWN é NO-OP defensivo · rollback exige forward migration nova (não revert)';
END $$;

COMMIT;
