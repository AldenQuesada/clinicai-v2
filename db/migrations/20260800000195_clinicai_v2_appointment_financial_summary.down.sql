-- Rollback · CRM_PARITY_R2 · Migration 195

BEGIN;

DROP VIEW IF EXISTS public.appointment_financial_summary;

COMMIT;
