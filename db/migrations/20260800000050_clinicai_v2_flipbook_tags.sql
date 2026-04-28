-- Adiciona coluna `tags text[]` em flipbooks pra organização/filtragem.
-- GIN index permite queries por tag eficientes (`tags && ARRAY['x']`).
BEGIN;

ALTER TABLE public.flipbooks
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_flipbooks_tags ON public.flipbooks USING gin (tags);

COMMIT;
NOTIFY pgrst, 'reload schema';
