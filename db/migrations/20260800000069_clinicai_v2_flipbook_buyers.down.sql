BEGIN;

DROP POLICY IF EXISTS flipbook_buyers_authed_write ON public.flipbook_buyers;
DROP POLICY IF EXISTS flipbook_buyers_authed_read  ON public.flipbook_buyers;
DROP POLICY IF EXISTS flipbook_buyers_anon_insert  ON public.flipbook_buyers;

DROP TRIGGER IF EXISTS flipbook_buyers_set_updated_at ON public.flipbook_buyers;

DROP INDEX IF EXISTS flipbook_buyers_product_idx;
DROP INDEX IF EXISTS flipbook_buyers_status_touch_idx;
DROP INDEX IF EXISTS flipbook_buyers_phone_idx;

DROP TABLE IF EXISTS public.flipbook_buyers;

COMMIT;
NOTIFY pgrst, 'reload schema';
