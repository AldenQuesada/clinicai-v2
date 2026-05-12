-- ============================================================================
-- Migration 162 · DOWN · DROP simples da fn d_after
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public._agenda_alert_d_after_tick();

NOTIFY pgrst, 'reload schema';

COMMIT;
