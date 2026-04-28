BEGIN;
DROP FUNCTION IF EXISTS public.flipbook_conversion_funnel(uuid, int);
DROP TABLE IF EXISTS public.flipbook_conversion_events CASCADE;
COMMIT;
NOTIFY pgrst, 'reload schema';
