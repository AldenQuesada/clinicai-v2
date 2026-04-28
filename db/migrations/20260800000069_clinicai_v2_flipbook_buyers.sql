-- Tabela `flipbook_buyers` · captura do funil de compra.
--
-- DIFERENTE de `flipbook_leads` (que captura email mid-reader). Aqui é quem CLICOU
-- pra comprar — entrou no modal "Comprar agora" e entregou nome+WhatsApp.
--
-- Status workflow:
--   new            → acabou de submeter o modal
--   charge_created → cobrança Asaas gerada (lead virou intent de compra)
--   converted      → webhook PAYMENT_CONFIRMED chegou (entra na sequência de comprador)
--   abandoned      → 72h sem pagar (entra na sequência de recuperação até `lost`)
--   lost           → encerrado (vai pra remarketing)
--
-- Quem lê: authenticated (admin). Anon NÃO lê.
-- Quem escreve: anon INSERT (form do modal). Admin updates. Service role updates (webhook).
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_buyers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name            text NOT NULL,
  phone           text NOT NULL,         -- whatsapp normalizado E.164 (ex: 5544999998888)
  email           text,
  cpf             text,                  -- preenchido depois se Asaas exigir

  product_id      uuid NOT NULL REFERENCES public.flipbook_products(id) ON DELETE RESTRICT,
  offer_id        uuid NOT NULL REFERENCES public.flipbook_offers(id)   ON DELETE RESTRICT,

  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','charge_created','converted','abandoned','lost')),

  utm             jsonb NOT NULL DEFAULT '{}'::jsonb,

  last_touch_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flipbook_buyers_phone_idx
  ON public.flipbook_buyers (phone);
CREATE INDEX IF NOT EXISTS flipbook_buyers_status_touch_idx
  ON public.flipbook_buyers (status, last_touch_at);
CREATE INDEX IF NOT EXISTS flipbook_buyers_product_idx
  ON public.flipbook_buyers (product_id, created_at DESC);

DROP TRIGGER IF EXISTS flipbook_buyers_set_updated_at ON public.flipbook_buyers;
CREATE TRIGGER flipbook_buyers_set_updated_at
  BEFORE UPDATE ON public.flipbook_buyers
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_buyers ENABLE ROW LEVEL SECURITY;

-- Anon pode INSERT (modal de compra é público).
DROP POLICY IF EXISTS flipbook_buyers_anon_insert ON public.flipbook_buyers;
CREATE POLICY flipbook_buyers_anon_insert
  ON public.flipbook_buyers
  FOR INSERT TO anon WITH CHECK (true);

-- Authenticated (admin) lê tudo, atualiza tudo.
DROP POLICY IF EXISTS flipbook_buyers_authed_read ON public.flipbook_buyers;
CREATE POLICY flipbook_buyers_authed_read
  ON public.flipbook_buyers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS flipbook_buyers_authed_write ON public.flipbook_buyers;
CREATE POLICY flipbook_buyers_authed_write
  ON public.flipbook_buyers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
