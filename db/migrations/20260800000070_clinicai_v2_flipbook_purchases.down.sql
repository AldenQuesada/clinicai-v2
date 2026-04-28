BEGIN;

DROP POLICY IF EXISTS flipbook_purchases_authed_read ON public.flipbook_purchases;
DROP TRIGGER IF EXISTS flipbook_purchases_set_updated_at ON public.flipbook_purchases;

DROP INDEX IF EXISTS flipbook_purchases_product_paid_idx;
DROP INDEX IF EXISTS flipbook_purchases_status_idx;
DROP INDEX IF EXISTS flipbook_purchases_buyer_idx;

DROP TABLE IF EXISTS public.flipbook_purchases;

COMMIT;
NOTIFY pgrst, 'reload schema';
