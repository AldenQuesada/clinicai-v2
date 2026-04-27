-- Down · rollback do schema flipbook
BEGIN;

DROP POLICY IF EXISTS flipbook_storage_authed_all ON storage.objects;

DROP TABLE IF EXISTS public.flipbook_interactions CASCADE;
DROP TABLE IF EXISTS public.flipbook_views CASCADE;
DROP TABLE IF EXISTS public.flipbooks CASCADE;
DROP FUNCTION IF EXISTS public.flipbooks_set_updated_at();

DELETE FROM storage.buckets WHERE id = 'flipbook-pdfs';

COMMIT;
NOTIFY pgrst, 'reload schema';
