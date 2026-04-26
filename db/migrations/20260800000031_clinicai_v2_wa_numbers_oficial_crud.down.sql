-- Rollback mig 800-31 · drop 3 RPCs + UNIQUE INDEX oficial
BEGIN;

DROP FUNCTION IF EXISTS public.wa_deactivate_any(uuid);
DROP FUNCTION IF EXISTS public.wa_update_meta(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.wa_register_oficial(text, text, text);
DROP INDEX IF EXISTS public.uniq_wa_numbers_oficial_phone;

COMMIT;
