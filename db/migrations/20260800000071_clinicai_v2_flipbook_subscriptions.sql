-- Tabela `flipbook_subscriptions` · assinaturas recorrentes (Premium).
--
-- 1 assinatura = 1 customer Asaas + N cobranças mensais/anuais. Asaas envia events:
--   SUBSCRIPTION_CREATED       · status='active', current_period_end = next_due_date
--   PAYMENT_RECEIVED (sub)     · renova current_period_end
--   PAYMENT_OVERDUE            · status='past_due'
--   SUBSCRIPTION_DELETED       · status='cancelled', ended_at=now
--
-- Acesso: enquanto status='active' E now() < current_period_end, usuário tem grant
-- "all books" (flipbook_id NULL no flipbook_access_grants).
--
-- Quem lê: authenticated (admin). Anon NÃO lê.
-- Quem escreve: SOMENTE service_role (webhook).
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  buyer_id                 uuid NOT NULL REFERENCES public.flipbook_buyers(id) ON DELETE RESTRICT,
  product_id               uuid NOT NULL REFERENCES public.flipbook_products(id) ON DELETE RESTRICT,
  offer_id                 uuid NOT NULL REFERENCES public.flipbook_offers(id) ON DELETE RESTRICT,

  subscriber_name          text NOT NULL,
  subscriber_email         text,
  subscriber_phone         text NOT NULL,
  subscriber_cpf           text,

  gateway                  text NOT NULL DEFAULT 'asaas' CHECK (gateway IN ('asaas')),
  gateway_subscription_id  text NOT NULL UNIQUE,
  gateway_customer_id      text,

  billing_cycle            text NOT NULL CHECK (billing_cycle IN ('monthly','yearly')),
  amount_cents             integer NOT NULL CHECK (amount_cents > 0),
  currency                 char(3) NOT NULL DEFAULT 'BRL',

  status                   text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','past_due','cancelled','paused')),

  current_period_start     timestamptz NOT NULL DEFAULT now(),
  current_period_end       timestamptz NOT NULL,

  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  cancelled_at             timestamptz,
  ended_at                 timestamptz,

  metadata                 jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT flipbook_subscriptions_period_valid
    CHECK (current_period_end > current_period_start)
);

CREATE INDEX IF NOT EXISTS flipbook_subscriptions_buyer_idx
  ON public.flipbook_subscriptions (buyer_id);
CREATE INDEX IF NOT EXISTS flipbook_subscriptions_status_idx
  ON public.flipbook_subscriptions (status, current_period_end);

DROP TRIGGER IF EXISTS flipbook_subscriptions_set_updated_at ON public.flipbook_subscriptions;
CREATE TRIGGER flipbook_subscriptions_set_updated_at
  BEFORE UPDATE ON public.flipbook_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_subscriptions_authed_read ON public.flipbook_subscriptions;
CREATE POLICY flipbook_subscriptions_authed_read
  ON public.flipbook_subscriptions
  FOR SELECT TO authenticated USING (true);

-- service_role bypassa RLS. Sem policies de mutation pra anon/authenticated.

COMMIT;
NOTIFY pgrst, 'reload schema';
