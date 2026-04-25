-- Rollback 800-05 · remove custom_access_token_hook
-- ATENCAO: desativar hook no Supabase Dashboard antes de rodar este down
-- (Authentication → Hooks → Custom Access Token → Remove)

REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM supabase_auth_admin;

DROP FUNCTION IF EXISTS public.custom_access_token_hook(jsonb);

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN RAISE NOTICE '800-05 ROLLBACK · custom_access_token_hook removida'; END $$;
