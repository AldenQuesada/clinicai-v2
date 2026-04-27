BEGIN;
DROP TABLE IF EXISTS public.flipbook_progress CASCADE;
COMMIT;
NOTIFY pgrst, 'reload schema';
