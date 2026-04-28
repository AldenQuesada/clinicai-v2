-- Eventos de conversão · funnel real do leitor.
--
-- flipbook_views já mede leitura página-a-página, mas não diferencia INTENÇÃO
-- (Amazon click, lead capture, share, fullscreen, completion). Esta tabela
-- captura o funil completo:
--
--   reading_engaged (pág >= 3) → reading_complete (>= 75% do livro)
--   amazon_click  · lead_*  · share_copy  · fullscreen_enter  · cinematic_skip
--
-- Anon pode inserir (analytics não pode quebrar leitura). Authenticated lê.
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_conversion_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flipbook_id  uuid NOT NULL REFERENCES public.flipbooks(id) ON DELETE CASCADE,
  session_id   text NOT NULL,
  kind         text NOT NULL CHECK (kind IN (
    'amazon_click',
    'lead_capture_shown',
    'lead_capture_dismissed',
    'lead_capture_submitted',
    'share_copy',
    'share_native',
    'fullscreen_enter',
    'cinematic_skip',
    'reading_engaged',
    'reading_complete'
  )),
  page_number  int,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flipbook_events_book_kind_idx
  ON public.flipbook_conversion_events (flipbook_id, kind);
CREATE INDEX IF NOT EXISTS flipbook_events_book_time_idx
  ON public.flipbook_conversion_events (flipbook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS flipbook_events_session_idx
  ON public.flipbook_conversion_events (session_id);

ALTER TABLE public.flipbook_conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_events_anon_insert ON public.flipbook_conversion_events;
CREATE POLICY flipbook_events_anon_insert
  ON public.flipbook_conversion_events
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS flipbook_events_authed_all ON public.flipbook_conversion_events;
CREATE POLICY flipbook_events_authed_all
  ON public.flipbook_conversion_events
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────
-- RPC pra dashboard · funnel agregado (últimos N dias)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.flipbook_conversion_funnel(
  book_id uuid DEFAULT NULL,
  days_back int DEFAULT 30
)
RETURNS TABLE (
  kind            text,
  event_count     bigint,
  unique_sessions bigint
)
LANGUAGE sql STABLE AS $$
  SELECT
    e.kind,
    count(*)               AS event_count,
    count(DISTINCT e.session_id) AS unique_sessions
  FROM public.flipbook_conversion_events e
  WHERE e.created_at >= now() - (days_back || ' days')::interval
    AND (book_id IS NULL OR e.flipbook_id = book_id)
  GROUP BY e.kind
  ORDER BY event_count DESC;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
