BEGIN;

DROP POLICY IF EXISTS flipbook_assets_authed_write ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'flipbook-assets';

COMMIT;
NOTIFY pgrst, 'reload schema';
