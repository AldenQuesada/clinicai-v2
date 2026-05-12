-- ============================================================================
-- Migration 163 · DOWN · DROP das 2 tick fns de alertas internos
-- ============================================================================
--
-- Reverte mig 163. Não toca em mig 161 (tabela + helper + RPCs permanecem).
-- Não toca em crons (gerenciados separadamente via cron.unschedule).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public._appointment_next_patient_internal_alert_tick();
DROP FUNCTION IF EXISTS public._appointment_attention_required_alert_tick();

NOTIFY pgrst, 'reload schema';

COMMIT;
