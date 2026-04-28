BEGIN;

ALTER TABLE public.flipbooks
  DROP COLUMN IF EXISTS access_password_hash;

COMMIT;
NOTIFY pgrst, 'reload schema';
