BEGIN;

DROP POLICY IF EXISTS flipbook_leads_authed_read ON public.flipbook_leads;
DROP POLICY IF EXISTS flipbook_leads_anon_insert ON public.flipbook_leads;

DROP INDEX IF EXISTS flipbook_leads_email_idx;
DROP INDEX IF EXISTS flipbook_leads_book_time_idx;

DROP TABLE IF EXISTS public.flipbook_leads;

COMMIT;
NOTIFY pgrst, 'reload schema';
