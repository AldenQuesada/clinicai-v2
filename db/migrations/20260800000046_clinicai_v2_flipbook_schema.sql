-- Migration: Flipbook Tool · schema inicial
-- ADR: criar app de biblioteca digital com PDF/EPUB/MOBI/CBZ + leitor flipbook
--      + interações por overlay + analytics de leitura
-- Bucket Storage: flipbook-pdfs (privado, signed URL)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABELAS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.flipbooks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,
  title         text NOT NULL,
  subtitle      text,
  author        text NOT NULL DEFAULT 'Dr. Alden Quesada',
  language      text NOT NULL DEFAULT 'pt' CHECK (language IN ('pt', 'en', 'es')),
  edition       text,
  cover_url     text,
  pdf_url       text NOT NULL,
  format        text NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'epub', 'mobi', 'cbz', 'html')),
  page_count    int,
  amazon_asin   text,
  published_at  timestamptz,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flipbooks_status_published_idx
  ON public.flipbooks (status, published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS flipbooks_slug_idx ON public.flipbooks (slug);

-- Analytics de leitura (granular: por sessão + página)
CREATE TABLE IF NOT EXISTS public.flipbook_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flipbook_id  uuid NOT NULL REFERENCES public.flipbooks(id) ON DELETE CASCADE,
  session_id   text,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  page_number  int,
  duration_ms  int,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flipbook_views_book_time_idx
  ON public.flipbook_views (flipbook_id, created_at DESC);

-- Interações/overlays clicáveis sobre páginas (v1.2)
CREATE TABLE IF NOT EXISTS public.flipbook_interactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flipbook_id   uuid NOT NULL REFERENCES public.flipbooks(id) ON DELETE CASCADE,
  page_number   int NOT NULL,
  -- coords em % da página (0-100) pra responsividade
  x_pct         numeric(5,2) NOT NULL CHECK (x_pct BETWEEN 0 AND 100),
  y_pct         numeric(5,2) NOT NULL CHECK (y_pct BETWEEN 0 AND 100),
  width_pct     numeric(5,2) NOT NULL CHECK (width_pct BETWEEN 0 AND 100),
  height_pct    numeric(5,2) NOT NULL CHECK (height_pct BETWEEN 0 AND 100),
  type          text NOT NULL CHECK (type IN ('link', 'video', 'modal', 'form', 'tooltip')),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  label         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flipbook_interactions_book_page_idx
  ON public.flipbook_interactions (flipbook_id, page_number);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS · updated_at automático
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.flipbooks_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_flipbooks_updated_at ON public.flipbooks;
CREATE TRIGGER trg_flipbooks_updated_at
  BEFORE UPDATE ON public.flipbooks
  FOR EACH ROW EXECUTE FUNCTION public.flipbooks_set_updated_at();

DROP TRIGGER IF EXISTS trg_flipbook_interactions_updated_at ON public.flipbook_interactions;
CREATE TRIGGER trg_flipbook_interactions_updated_at
  BEFORE UPDATE ON public.flipbook_interactions
  FOR EACH ROW EXECUTE FUNCTION public.flipbooks_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · publico le published; admin (authenticated user) full
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.flipbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flipbook_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flipbook_interactions ENABLE ROW LEVEL SECURITY;

-- flipbooks: anon le published; authenticated le tudo + escreve tudo
DROP POLICY IF EXISTS flipbooks_anon_read_published ON public.flipbooks;
CREATE POLICY flipbooks_anon_read_published ON public.flipbooks
  FOR SELECT TO anon USING (status = 'published');

DROP POLICY IF EXISTS flipbooks_authed_all ON public.flipbooks;
CREATE POLICY flipbooks_authed_all ON public.flipbooks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- views: anon insere (registro de leitura), authenticated le
DROP POLICY IF EXISTS flipbook_views_anon_insert ON public.flipbook_views;
CREATE POLICY flipbook_views_anon_insert ON public.flipbook_views
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS flipbook_views_authed_read ON public.flipbook_views;
CREATE POLICY flipbook_views_authed_read ON public.flipbook_views
  FOR SELECT TO authenticated USING (true);

-- interactions: anon le; authenticated full
DROP POLICY IF EXISTS flipbook_interactions_anon_read ON public.flipbook_interactions;
CREATE POLICY flipbook_interactions_anon_read ON public.flipbook_interactions
  FOR SELECT TO anon USING (
    EXISTS (SELECT 1 FROM public.flipbooks fb
            WHERE fb.id = flipbook_id AND fb.status = 'published')
  );

DROP POLICY IF EXISTS flipbook_interactions_authed_all ON public.flipbook_interactions;
CREATE POLICY flipbook_interactions_authed_all ON public.flipbook_interactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE · bucket flipbook-pdfs (criado via dashboard ou seed)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('flipbook-pdfs', 'flipbook-pdfs', false, 262144000)  -- 250MB
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated upload + read; anon le via signed URL apenas
DROP POLICY IF EXISTS flipbook_storage_authed_all ON storage.objects;
CREATE POLICY flipbook_storage_authed_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'flipbook-pdfs') WITH CHECK (bucket_id = 'flipbook-pdfs');

-- Signed URLs continuam funcionando pra anon sem policy explicita
-- (signedURL bypassa RLS por design)

COMMIT;

-- Notify PostgREST pra refresh
NOTIFY pgrst, 'reload schema';
