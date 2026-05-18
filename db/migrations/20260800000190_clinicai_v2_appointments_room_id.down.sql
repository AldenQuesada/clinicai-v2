-- Rollback · CRM_PARITY_R1 · Migration 190

BEGIN;

DROP INDEX IF EXISTS public.idx_appointments_room_date;
DROP INDEX IF EXISTS public.idx_appointments_room_id;

ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS room_id;

COMMIT;
