BEGIN;

DROP POLICY IF EXISTS flipbook_products_authed_write ON public.flipbook_products;
DROP POLICY IF EXISTS flipbook_products_authed_read  ON public.flipbook_products;
DROP POLICY IF EXISTS flipbook_products_anon_read    ON public.flipbook_products;

DROP TRIGGER IF EXISTS flipbook_products_set_updated_at ON public.flipbook_products;

DROP INDEX IF EXISTS flipbook_products_flipbook_idx;
DROP INDEX IF EXISTS flipbook_products_kind_active_idx;

DROP TABLE IF EXISTS public.flipbook_products;

-- _flipbook_commerce_set_updated_at é compartilhada — só dropa se for a última
-- mig do módulo a sair. Por hora mantém pra não quebrar outras tabelas.

COMMIT;
NOTIFY pgrst, 'reload schema';
