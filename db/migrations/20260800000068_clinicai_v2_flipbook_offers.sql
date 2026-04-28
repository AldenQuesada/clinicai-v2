-- Tabela `flipbook_offers` · ofertas vigentes por produto.
--
-- Estrutura intencionalmente rica pra suportar estratégia comercial:
--   - billing one_time (vitalício) | monthly | yearly (recorrência)
--   - valid_from/until: janela sazonal (lançamento, Black Friday, aniversário)
--   - max_purchases: scarcity ("primeiras 100 vagas")
--   - coupon_code: cupom específico — null = oferta aberta a todos
--   - priority: quando duas ofertas válidas competem, a maior priority ganha
--
-- Cada produto pode ter N ofertas. Função `flipbook_active_offer_for(product_id, coupon)`
-- (próxima migration) resolve qual oferta exibir/cobrar agora.
--
-- Quem lê: anon (renderizar preço na home/landing). Filtrado por active+window.
-- Quem escreve: authenticated (admin).
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_offers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         uuid NOT NULL REFERENCES public.flipbook_products(id) ON DELETE CASCADE,
  name               text NOT NULL,
  price_cents        integer NOT NULL CHECK (price_cents > 0),
  currency           char(3) NOT NULL DEFAULT 'BRL',
  billing            text NOT NULL CHECK (billing IN ('one_time','monthly','yearly')),

  valid_from         timestamptz NOT NULL DEFAULT now(),
  valid_until        timestamptz, -- null = sem fim

  max_purchases      integer, -- null = ilimitado
  current_purchases  integer NOT NULL DEFAULT 0,

  coupon_code        text, -- null = aberto. UNIQUE quando setado.

  priority           integer NOT NULL DEFAULT 100,
  active             boolean NOT NULL DEFAULT true,

  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT flipbook_offers_window_valid
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT flipbook_offers_capacity_valid
    CHECK (max_purchases IS NULL OR current_purchases <= max_purchases)
);

-- Cupom único quando setado (parcial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS flipbook_offers_coupon_code_unique
  ON public.flipbook_offers (lower(coupon_code))
  WHERE coupon_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS flipbook_offers_product_active_priority_idx
  ON public.flipbook_offers (product_id, active, priority DESC);

CREATE INDEX IF NOT EXISTS flipbook_offers_window_idx
  ON public.flipbook_offers (valid_from, valid_until)
  WHERE active = true;

DROP TRIGGER IF EXISTS flipbook_offers_set_updated_at ON public.flipbook_offers;
CREATE TRIGGER flipbook_offers_set_updated_at
  BEFORE UPDATE ON public.flipbook_offers
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_offers ENABLE ROW LEVEL SECURITY;

-- Anon vê apenas ofertas active, dentro da janela de validade, e SEM cupom
-- (cupons ficam ocultos do catálogo público — só o frontend que recebe o code aplica).
DROP POLICY IF EXISTS flipbook_offers_anon_read ON public.flipbook_offers;
CREATE POLICY flipbook_offers_anon_read
  ON public.flipbook_offers
  FOR SELECT TO anon
  USING (
    active = true
    AND coupon_code IS NULL
    AND valid_from <= now()
    AND (valid_until IS NULL OR valid_until > now())
    AND (max_purchases IS NULL OR current_purchases < max_purchases)
  );

DROP POLICY IF EXISTS flipbook_offers_authed_read ON public.flipbook_offers;
CREATE POLICY flipbook_offers_authed_read
  ON public.flipbook_offers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS flipbook_offers_authed_write ON public.flipbook_offers;
CREATE POLICY flipbook_offers_authed_write
  ON public.flipbook_offers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC `flipbook_active_offer_for`: resolve qual oferta vigente cobrar agora.
-- Considera cupom opcional, janela, capacidade, e priority.
-- SECURITY DEFINER porque consulta cupons (que ficam ocultos pra anon na policy SELECT).
CREATE OR REPLACE FUNCTION public.flipbook_active_offer_for(
  p_product_id uuid,
  p_coupon_code text DEFAULT NULL
) RETURNS public.flipbook_offers
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT *
  FROM public.flipbook_offers
  WHERE product_id = p_product_id
    AND active = true
    AND valid_from <= now()
    AND (valid_until IS NULL OR valid_until > now())
    AND (max_purchases IS NULL OR current_purchases < max_purchases)
    AND (
      coupon_code IS NULL
      OR (p_coupon_code IS NOT NULL AND lower(coupon_code) = lower(p_coupon_code))
    )
  ORDER BY priority DESC, created_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.flipbook_active_offer_for(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.flipbook_active_offer_for(uuid, text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
