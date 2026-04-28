BEGIN;

DROP FUNCTION IF EXISTS public.flipbook_resolve_access_token(text, uuid);
DROP POLICY IF EXISTS flipbook_access_grants_authed_read ON public.flipbook_access_grants;

DROP INDEX IF EXISTS flipbook_access_grants_purchase_idx;
DROP INDEX IF EXISTS flipbook_access_grants_subscription_idx;
DROP INDEX IF EXISTS flipbook_access_grants_phone_idx;
DROP INDEX IF EXISTS flipbook_access_grants_token_idx;

DROP TABLE IF EXISTS public.flipbook_access_grants;

COMMIT;
NOTIFY pgrst, 'reload schema';
