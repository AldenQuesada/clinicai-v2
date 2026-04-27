-- Sync cross-device · last page lida por user x livro
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_progress (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flipbook_id   uuid NOT NULL REFERENCES public.flipbooks(id) ON DELETE CASCADE,
  last_page     int NOT NULL DEFAULT 1 CHECK (last_page >= 1),
  total_pages   int,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, flipbook_id)
);

CREATE INDEX IF NOT EXISTS flipbook_progress_user_idx
  ON public.flipbook_progress (user_id, updated_at DESC);

ALTER TABLE public.flipbook_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_progress_owner_all ON public.flipbook_progress;
CREATE POLICY flipbook_progress_owner_all ON public.flipbook_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
NOTIFY pgrst, 'reload schema';
