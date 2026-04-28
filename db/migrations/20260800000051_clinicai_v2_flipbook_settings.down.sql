BEGIN;

ALTER TABLE public.flipbooks DROP COLUMN IF EXISTS settings;

COMMIT;
NOTIFY pgrst, 'reload schema';
