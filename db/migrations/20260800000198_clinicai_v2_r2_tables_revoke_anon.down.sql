-- =============================================================================
-- Rollback · CRM_PARITY_R5 · Migration 198
-- =============================================================================
--
-- DO NOT USE FOR PRODUCTION unless intentionally rolling back migration 198.
-- Re-granting anon is NOT part of the CRM v2 canon.
--
-- This down keeps the tables safe by preserving no anon access. Re-applying
-- the same idempotent block is the safest "rollback" behavior: it cannot
-- regress security even when invoked.
-- =============================================================================

BEGIN;

REVOKE ALL ON public.appointment_procedure_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_procedure_items TO authenticated;
GRANT ALL ON public.appointment_procedure_items TO service_role;

REVOKE ALL ON public.appointment_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_payments TO authenticated;
GRANT ALL ON public.appointment_payments TO service_role;

COMMIT;
