BEGIN;

DROP POLICY IF EXISTS flipbook_subscriptions_authed_read ON public.flipbook_subscriptions;
DROP TRIGGER IF EXISTS flipbook_subscriptions_set_updated_at ON public.flipbook_subscriptions;

DROP INDEX IF EXISTS flipbook_subscriptions_status_idx;
DROP INDEX IF EXISTS flipbook_subscriptions_buyer_idx;

DROP TABLE IF EXISTS public.flipbook_subscriptions;

COMMIT;
NOTIFY pgrst, 'reload schema';
