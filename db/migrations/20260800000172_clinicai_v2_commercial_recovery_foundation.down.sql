-- ============================================================================
-- Migration 172 · DOWN · DROP commercial_recovery_queue_view
-- ============================================================================
-- View read-only · drop seguro · zero efeito em tabelas-fonte.
-- ============================================================================

BEGIN;

DROP VIEW IF EXISTS public.commercial_recovery_queue_view;

NOTIFY pgrst, 'reload schema';

COMMIT;
