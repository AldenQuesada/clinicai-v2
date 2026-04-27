-- Bucket separado pra capas (pequenas, publicas) vs PDFs (grandes, privadas)
-- Capas viram OG image, thumbnail no catalogo etc → publico facilita CDN cache.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('flipbook-covers', 'flipbook-covers', true, 5242880)  -- 5MB max
ON CONFLICT (id) DO NOTHING;

-- Authenticated escreve; anon le (publico ja resolve mas deixa explicito)
DROP POLICY IF EXISTS flipbook_covers_authed_write ON storage.objects;
CREATE POLICY flipbook_covers_authed_write ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'flipbook-covers')
  WITH CHECK (bucket_id = 'flipbook-covers');

COMMIT;
NOTIFY pgrst, 'reload schema';
