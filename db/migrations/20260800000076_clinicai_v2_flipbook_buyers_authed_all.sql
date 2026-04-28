-- Mig 0076 · flipbook_buyers · policy ALL pra authenticated
--
-- Bug encontrado no smoke test (2026-04-28): admin logado tentando criar buyer
-- caiu em RLS porque tabela só tinha INSERT pra anon e UPDATE pra authenticated.
-- Server actions rodam com role do cliente atual (anon OU authenticated) e nunca
-- como service_role.
--
-- Fix: substituir SELECT+UPDATE separados por ALL pra authenticated.
-- anon INSERT permanece (formulário público continua funcionando).
BEGIN;

DROP POLICY IF EXISTS flipbook_buyers_authed_read  ON public.flipbook_buyers;
DROP POLICY IF EXISTS flipbook_buyers_authed_write ON public.flipbook_buyers;

DROP POLICY IF EXISTS flipbook_buyers_authed_all ON public.flipbook_buyers;
CREATE POLICY flipbook_buyers_authed_all
  ON public.flipbook_buyers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
