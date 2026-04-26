-- Rollback mig 800-33 · drop 2 triggers + 2 functions
BEGIN;

DROP TRIGGER IF EXISTS trg_appt_voucher_sync_upd ON public.appointments;
DROP TRIGGER IF EXISTS trg_appt_voucher_sync_ins ON public.appointments;
DROP FUNCTION IF EXISTS public._b2b_sync_voucher_from_appointment();
DROP FUNCTION IF EXISTS public._b2b_voucher_status_rank(text);

COMMIT;
