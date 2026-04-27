-- Bucket público pra previews de N primeiras páginas (mini flipbook na home)
-- + coluna preview_count em flipbooks pra controle de UI
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('flipbook-previews', 'flipbook-previews', true, 1048576)  -- 1MB max por preview
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS flipbook_previews_authed_write ON storage.objects;
CREATE POLICY flipbook_previews_authed_write ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'flipbook-previews')
  WITH CHECK (bucket_id = 'flipbook-previews');

ALTER TABLE public.flipbooks
  ADD COLUMN IF NOT EXISTS preview_count int NOT NULL DEFAULT 0;

COMMIT;
NOTIFY pgrst, 'reload schema';
