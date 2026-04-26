-- Rollback mig 800-30 · drop UNIQUE INDEX (nao reverte dedup · seguro)
BEGIN;

DROP INDEX IF EXISTS public.uniq_wa_numbers_pro_phone;

COMMIT;
