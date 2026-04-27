BEGIN;
ALTER TABLE public.flipbooks DROP COLUMN IF EXISTS preview_count;
DROP POLICY IF EXISTS flipbook_previews_authed_write ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'flipbook-previews';
COMMIT;
NOTIFY pgrst, 'reload schema';
