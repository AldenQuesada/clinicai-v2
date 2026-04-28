BEGIN;

DROP POLICY IF EXISTS flipbook_buyers_authed_all ON public.flipbook_buyers;

CREATE POLICY flipbook_buyers_authed_read
  ON public.flipbook_buyers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY flipbook_buyers_authed_write
  ON public.flipbook_buyers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
