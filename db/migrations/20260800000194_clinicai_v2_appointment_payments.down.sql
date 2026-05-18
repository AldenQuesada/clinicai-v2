-- Rollback · CRM_PARITY_R2 · Migration 194

BEGIN;

DROP TABLE IF EXISTS public.appointment_payments CASCADE;

COMMIT;
