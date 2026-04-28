-- Versionamento de PDF · cada replace move o PDF atual pra archive/v{N}.pdf
-- e registra a versão antiga aqui. Permite auditoria e (futuramente) restore.
--
-- Storage layout:
--   pdfs/{flipbook_id}.pdf                  ← versão atual (sempre)
--   pdfs/{flipbook_id}/archive/v{N}.pdf     ← versões antigas
--
-- Fluxo no API replace-pdf:
--   1. lê current pdf_path
--   2. storage.move current → archive/v{nextVersion}.pdf
--   3. INSERT row aqui com version=nextVersion + pdf_path arquivado
--   4. upload novo arquivo no path original
--   5. update flipbooks.page_count se viável
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_pdf_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flipbook_id     uuid NOT NULL REFERENCES public.flipbooks(id) ON DELETE CASCADE,
  version         int  NOT NULL CHECK (version >= 1),
  -- Path no bucket flipbook-pdfs (mesma convenção da coluna flipbooks.pdf_url)
  pdf_url         text NOT NULL,
  pdf_size_bytes  bigint,
  page_count      int,
  label           text,
  replaced_at     timestamptz NOT NULL DEFAULT now(),
  replaced_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (flipbook_id, version)
);

CREATE INDEX IF NOT EXISTS flipbook_pdf_versions_book_idx
  ON public.flipbook_pdf_versions (flipbook_id, version DESC);

ALTER TABLE public.flipbook_pdf_versions ENABLE ROW LEVEL SECURITY;

-- Apenas admins authenticated (mesma política dos demais)
DROP POLICY IF EXISTS flipbook_pdf_versions_authed_all ON public.flipbook_pdf_versions;
CREATE POLICY flipbook_pdf_versions_authed_all
  ON public.flipbook_pdf_versions
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
