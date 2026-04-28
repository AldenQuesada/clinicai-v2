-- Tabela `flipbook_purchases` · compras one_time (vitalício).
--
-- 1 compra = 1 cobrança Asaas confirmada para um produto kind='book'.
-- Quando billing='monthly'/'yearly' a venda vira `flipbook_subscriptions` (próxima mig).
--
-- Quem lê: authenticated (admin). Anon NÃO lê.
-- Quem escreve: SOMENTE service_role (webhook /api/webhooks/asaas).
--   Frontend que cria a charge inicial usa server action com service client — nunca anon direto.
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_purchases (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  buyer_id             uuid NOT NULL REFERENCES public.flipbook_buyers(id) ON DELETE RESTRICT,
  product_id           uuid NOT NULL REFERENCES public.flipbook_products(id) ON DELETE RESTRICT,
  offer_id             uuid NOT NULL REFERENCES public.flipbook_offers(id) ON DELETE RESTRICT,

  -- snapshot dos dados do comprador no momento da compra (imutável após confirmar).
  -- Permite buyer atualizar phone/email/name sem rasurar histórico de compras.
  buyer_name           text NOT NULL,
  buyer_email          text,
  buyer_phone          text NOT NULL,
  buyer_cpf            text,

  amount_cents         integer NOT NULL CHECK (amount_cents > 0),
  currency             char(3) NOT NULL DEFAULT 'BRL',

  gateway              text NOT NULL DEFAULT 'asaas' CHECK (gateway IN ('asaas')),
  gateway_charge_id    text NOT NULL UNIQUE,
  gateway_invoice_url  text,

  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','confirmed','failed','refunded','cancelled')),

  paid_at              timestamptz,
  refunded_at          timestamptz,

  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flipbook_purchases_buyer_idx
  ON public.flipbook_purchases (buyer_id);
CREATE INDEX IF NOT EXISTS flipbook_purchases_status_idx
  ON public.flipbook_purchases (status, created_at DESC);
CREATE INDEX IF NOT EXISTS flipbook_purchases_product_paid_idx
  ON public.flipbook_purchases (product_id, paid_at DESC) WHERE status = 'confirmed';

DROP TRIGGER IF EXISTS flipbook_purchases_set_updated_at ON public.flipbook_purchases;
CREATE TRIGGER flipbook_purchases_set_updated_at
  BEFORE UPDATE ON public.flipbook_purchases
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_purchases_authed_read ON public.flipbook_purchases;
CREATE POLICY flipbook_purchases_authed_read
  ON public.flipbook_purchases
  FOR SELECT TO authenticated USING (true);

-- NOTA: nenhuma policy de INSERT/UPDATE/DELETE pra anon ou authenticated.
-- Service role bypassa RLS. Webhook + server actions usam service client.

COMMIT;
NOTIFY pgrst, 'reload schema';
