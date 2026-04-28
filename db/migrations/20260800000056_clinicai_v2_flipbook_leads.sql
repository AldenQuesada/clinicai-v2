-- Tabela `flipbook_leads` · captura mid-book do reader.
--
-- Modal aparece em `settings.lead_capture.page` e coleta email + WhatsApp opcional.
-- Conversion event `lead_capture_submitted` continua indo pra `flipbook_conversion_events`
-- (pra agregar no funnel), mas o LEAD em si vive aqui (com PII).
--
-- Anon pode INSERT (formulário público). Authenticated pode SELECT (admin lê).
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flipbook_id       uuid NOT NULL REFERENCES public.flipbooks(id) ON DELETE CASCADE,
  email             text NOT NULL,
  whatsapp          text,
  opt_in_marketing  boolean NOT NULL DEFAULT false,
  source_page       int,
  user_agent        text,
  captured_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flipbook_leads_book_time_idx
  ON public.flipbook_leads (flipbook_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS flipbook_leads_email_idx
  ON public.flipbook_leads (lower(email));

ALTER TABLE public.flipbook_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_leads_anon_insert ON public.flipbook_leads;
CREATE POLICY flipbook_leads_anon_insert
  ON public.flipbook_leads
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS flipbook_leads_authed_read ON public.flipbook_leads;
CREATE POLICY flipbook_leads_authed_read
  ON public.flipbook_leads
  FOR SELECT TO authenticated USING (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
