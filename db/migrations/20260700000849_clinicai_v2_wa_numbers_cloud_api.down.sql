-- Rollback migration 849 · drop em ordem reversa.

DROP FUNCTION IF EXISTS public.wa_numbers_resolve_by_verify_token(text);
DROP FUNCTION IF EXISTS public.wa_numbers_resolve_by_phone_number_id(text);
DROP INDEX IF EXISTS public.uq_wa_numbers_phone_number_id_active;
DROP INDEX IF EXISTS public.uq_wa_numbers_verify_token_active;
DROP INDEX IF EXISTS public.idx_wa_numbers_phone_number_id;

ALTER TABLE public.wa_numbers
  DROP COLUMN IF EXISTS business_account_id,
  DROP COLUMN IF EXISTS verify_token,
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS phone_number_id;

NOTIFY pgrst, 'reload schema';
