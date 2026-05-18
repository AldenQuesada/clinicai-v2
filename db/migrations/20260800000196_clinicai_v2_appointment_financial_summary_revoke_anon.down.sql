-- =============================================================================
-- Rollback · CRM_PARITY_R2 · Migration 196
-- =============================================================================
--
-- DO NOT USE FOR PRODUCTION unless intentionally rolling back migration 196.
-- Re-granting anon is NOT part of the CRM v2 canon.
--
-- This down keeps the view safe by preserving no anon access. Re-applying
-- the same idempotent block is the safest "rollback" behavior: it cannot
-- regress security even when invoked.
-- =============================================================================

BEGIN;

REVOKE ALL ON public.appointment_financial_summary FROM anon;
GRANT SELECT ON public.appointment_financial_summary TO authenticated;
GRANT SELECT ON public.appointment_financial_summary TO service_role;

COMMIT;
