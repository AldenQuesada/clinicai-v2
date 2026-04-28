-- Tabela `flipbook_products` · catálogo de produtos comercializáveis.
--
-- Dois tipos de produto coexistem:
--   - 'book'         · 1 livro vitalício. flipbook_id NOT NULL.
--   - 'subscription' · biblioteca premium recorrente. flipbook_id NULL (acesso a tudo).
--
-- Preços NÃO vivem aqui. Vivem em flipbook_offers (próxima mig). Permite ofertas sazonais,
-- janelas, cupons, max_purchases, etc — sem tocar o produto.
--
-- Quem lê: anon (precisa exibir nome/desc na home pra produtos active=true).
-- Quem escreve: authenticated (admin Alden).
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_products (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('book','subscription')),
  flipbook_id  uuid REFERENCES public.flipbooks(id) ON DELETE CASCADE,
  sku          text NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text,
  active       boolean NOT NULL DEFAULT true,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- book exige flipbook_id; subscription exige NULL
  CONSTRAINT flipbook_products_kind_book_has_flipbook
    CHECK (
      (kind = 'book' AND flipbook_id IS NOT NULL)
      OR (kind = 'subscription' AND flipbook_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS flipbook_products_kind_active_idx
  ON public.flipbook_products (kind, active);
CREATE INDEX IF NOT EXISTS flipbook_products_flipbook_idx
  ON public.flipbook_products (flipbook_id) WHERE flipbook_id IS NOT NULL;

-- Trigger compartilhado por products/offers/buyers/purchases/etc deste módulo.
CREATE OR REPLACE FUNCTION public._flipbook_commerce_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flipbook_products_set_updated_at ON public.flipbook_products;
CREATE TRIGGER flipbook_products_set_updated_at
  BEFORE UPDATE ON public.flipbook_products
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_products_anon_read ON public.flipbook_products;
CREATE POLICY flipbook_products_anon_read
  ON public.flipbook_products
  FOR SELECT TO anon USING (active = true);

DROP POLICY IF EXISTS flipbook_products_authed_read ON public.flipbook_products;
CREATE POLICY flipbook_products_authed_read
  ON public.flipbook_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS flipbook_products_authed_write ON public.flipbook_products;
CREATE POLICY flipbook_products_authed_write
  ON public.flipbook_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
