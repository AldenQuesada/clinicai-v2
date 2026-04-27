BEGIN;
DROP POLICY IF EXISTS flipbook_covers_authed_write ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'flipbook-covers';
COMMIT;
NOTIFY pgrst, 'reload schema';
