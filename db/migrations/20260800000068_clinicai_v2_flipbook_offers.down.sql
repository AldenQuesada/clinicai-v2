BEGIN;

DROP FUNCTION IF EXISTS public.flipbook_active_offer_for(uuid, text);

DROP POLICY IF EXISTS flipbook_offers_authed_write ON public.flipbook_offers;
DROP POLICY IF EXISTS flipbook_offers_authed_read  ON public.flipbook_offers;
DROP POLICY IF EXISTS flipbook_offers_anon_read    ON public.flipbook_offers;

DROP TRIGGER IF EXISTS flipbook_offers_set_updated_at ON public.flipbook_offers;

DROP INDEX IF EXISTS flipbook_offers_window_idx;
DROP INDEX IF EXISTS flipbook_offers_product_active_priority_idx;
DROP INDEX IF EXISTS flipbook_offers_coupon_code_unique;

DROP TABLE IF EXISTS public.flipbook_offers;

COMMIT;
NOTIFY pgrst, 'reload schema';
