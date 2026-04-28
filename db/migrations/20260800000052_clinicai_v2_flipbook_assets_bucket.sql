-- Bucket pra assets do editor (logo, áudio de fundo, imagens custom de bg).
-- Público (cacheável via CDN), 5MB max por arquivo.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('flipbook-assets', 'flipbook-assets', true, 5242880)  -- 5MB
ON CONFLICT (id) DO NOTHING;

-- Authenticated escreve; anon le (publico ja resolve mas deixa explicito)
DROP POLICY IF EXISTS flipbook_assets_authed_write ON storage.objects;
CREATE POLICY flipbook_assets_authed_write ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'flipbook-assets')
  WITH CHECK (bucket_id = 'flipbook-assets');

COMMIT;
NOTIFY pgrst, 'reload schema';
