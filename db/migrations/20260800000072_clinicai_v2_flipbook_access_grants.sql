-- Tabela `flipbook_access_grants` · liberação de acesso pós-pagamento.
--
-- 1 grant = "esse buyer pode ler esse livro (ou todos) até essa data".
--
-- XOR semântico:
--   - purchase_id NOT NULL · subscription_id NULL → vitalício de 1 livro
--   - subscription_id NOT NULL · purchase_id NULL → assinatura, acesso a "todos"
--   - flipbook_id NOT NULL · grant restrito àquele livro
--   - flipbook_id NULL     · grant amplo (premium subscription)
--
-- access_token: 24 bytes random base64url (~32 chars). Vai no link WhatsApp:
--   https://flipbook.../{slug}?t={access_token}
--
-- Validação no [slug]/page.tsx via RPC `flipbook_resolve_access_token` (próxima mig)
-- que faz lookup + cookie 90d.
--
-- Quem lê: NINGUÉM via SELECT direto. Tudo passa pela RPC SECURITY DEFINER.
-- Quem escreve: SOMENTE service_role (webhook).
BEGIN;

CREATE TABLE IF NOT EXISTS public.flipbook_access_grants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  flipbook_id       uuid REFERENCES public.flipbooks(id) ON DELETE CASCADE,
  -- NULL → grant cobre TODOS os flipbooks (subscription premium)

  purchase_id       uuid REFERENCES public.flipbook_purchases(id) ON DELETE CASCADE,
  subscription_id   uuid REFERENCES public.flipbook_subscriptions(id) ON DELETE CASCADE,

  access_token      text NOT NULL UNIQUE,
  buyer_email       text,
  buyer_phone       text NOT NULL,

  expires_at        timestamptz, -- null = vitalício
  revoked_at        timestamptz,

  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- XOR · exatamente UM dos dois (purchase_id, subscription_id) não-null
  CONSTRAINT flipbook_access_grants_xor_origin
    CHECK (
      (purchase_id IS NOT NULL AND subscription_id IS NULL)
      OR (purchase_id IS NULL AND subscription_id IS NOT NULL)
    ),
  -- subscription grant precisa cobrir todos OU 1 livro · vitalício de book exige flipbook_id
  CONSTRAINT flipbook_access_grants_book_has_flipbook
    CHECK (
      purchase_id IS NULL OR flipbook_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS flipbook_access_grants_token_idx
  ON public.flipbook_access_grants (access_token);
CREATE INDEX IF NOT EXISTS flipbook_access_grants_phone_idx
  ON public.flipbook_access_grants (buyer_phone);
CREATE INDEX IF NOT EXISTS flipbook_access_grants_subscription_idx
  ON public.flipbook_access_grants (subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS flipbook_access_grants_purchase_idx
  ON public.flipbook_access_grants (purchase_id) WHERE purchase_id IS NOT NULL;

ALTER TABLE public.flipbook_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_access_grants_authed_read ON public.flipbook_access_grants;
CREATE POLICY flipbook_access_grants_authed_read
  ON public.flipbook_access_grants
  FOR SELECT TO authenticated USING (true);

-- Sem policies pra anon. Resolução só via RPC SECURITY DEFINER abaixo.

-- RPC `flipbook_resolve_access_token` · valida token + flipbook_id atomicamente.
--
-- Retorna: grant_id se válido, NULL se inválido. Lógica:
--   1. Token existe?
--   2. Não foi revogado?
--   3. Não expirou (expires_at null = vitalício)?
--   4. Para purchase: grant.flipbook_id == p_flipbook_id?
--   5. Para subscription: grant cobre todos (flipbook_id null) OU specific match
--   E o subscription tem que estar 'active' E within current_period_end.
CREATE OR REPLACE FUNCTION public.flipbook_resolve_access_token(
  p_access_token text,
  p_flipbook_id uuid
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_grant flipbook_access_grants%ROWTYPE;
  v_sub_status text;
  v_sub_end timestamptz;
BEGIN
  -- Lookup pelo token
  SELECT * INTO v_grant
  FROM public.flipbook_access_grants
  WHERE access_token = p_access_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Match de flipbook_id: grant amplo (NULL) cobre tudo; específico exige match
  IF v_grant.flipbook_id IS NOT NULL AND v_grant.flipbook_id != p_flipbook_id THEN
    RETURN NULL;
  END IF;

  -- Subscription: validar status + período corrente
  IF v_grant.subscription_id IS NOT NULL THEN
    SELECT status, current_period_end INTO v_sub_status, v_sub_end
    FROM public.flipbook_subscriptions
    WHERE id = v_grant.subscription_id;

    IF v_sub_status != 'active' OR v_sub_end <= now() THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN v_grant.id;
END;
$$;

REVOKE ALL ON FUNCTION public.flipbook_resolve_access_token(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.flipbook_resolve_access_token(text, uuid) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
