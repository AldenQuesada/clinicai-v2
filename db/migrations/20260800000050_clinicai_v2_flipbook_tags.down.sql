BEGIN;

DROP INDEX IF EXISTS public.idx_flipbooks_tags;
ALTER TABLE public.flipbooks DROP COLUMN IF EXISTS tags;

COMMIT;
NOTIFY pgrst, 'reload schema';
