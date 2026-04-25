-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-05 · clinicai-v2 · custom_access_token_hook                ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: Supabase Auth gera JWT por user. Por default, app_metadata     ║
-- ║   so contem provider/providers. Pra apps multi-tenant funcionarem ja     ║
-- ║   no momento do auth.getUser(), precisamos injetar clinic_id (e role)    ║
-- ║   no token via custom_access_token_hook.                                 ║
-- ║                                                                          ║
-- ║ Funcao public.custom_access_token_hook(jsonb):                           ║
-- ║   Lê event.user_id · resolve clinic_id via clinic_members (canonico)     ║
-- ║   ou _default_clinic_id() (single-tenant fallback) · injeta no event.    ║
-- ║                                                                          ║
-- ║ ATENCAO: ativar no Supabase Dashboard apos esta migration:               ║
-- ║   Authentication → Hooks (Beta) → Custom Access Token → Add hook         ║
-- ║   → Function: public.custom_access_token_hook                            ║
-- ║   → Save                                                                 ║
-- ║                                                                          ║
-- ║ Tabela clinic_members opcional · se nao existe, cai pro fallback. Quando ║
-- ║ multi-tenant for ativado de fato, criar clinic_members com (user_id,     ║
-- ║ clinic_id, role) e popular pra cada user.                                ║
-- ║                                                                          ║
-- ║ Idempotencia: CREATE OR REPLACE FUNCTION + GRANT EXECUTE.                ║
-- ║ Rollback: 800-05.down.sql                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
STABLE
AS $$
DECLARE
  v_user_id    uuid;
  v_clinic_id  uuid;
  v_role       text;
  v_claims     jsonb;
  v_app_meta   jsonb;
BEGIN
  -- event.user_id e o id do user que esta autenticando
  v_user_id := NULLIF(event->>'user_id', '')::uuid;

  IF v_user_id IS NULL THEN
    RETURN event;
  END IF;

  -- Tenta resolver via clinic_members (multi-tenant canonical)
  -- Se a tabela nao existe ou user nao esta listado, segue pra fallback
  BEGIN
    EXECUTE 'SELECT clinic_id, role FROM public.clinic_members WHERE user_id = $1 AND active = true ORDER BY is_primary DESC NULLS LAST, created_at ASC LIMIT 1'
       INTO v_clinic_id, v_role
      USING v_user_id;
  EXCEPTION
    WHEN undefined_table THEN
      -- clinic_members ainda nao foi criada · ok, cai no fallback
      v_clinic_id := NULL;
    WHEN undefined_column THEN
      -- schema variante · ok, cai no fallback
      v_clinic_id := NULL;
  END;

  -- Fallback: single-tenant Mirian via _default_clinic_id()
  IF v_clinic_id IS NULL THEN
    BEGIN
      v_clinic_id := public._default_clinic_id();
    EXCEPTION WHEN OTHERS THEN
      -- Sem _default_clinic_id() · retorna event original sem injecao
      RETURN event;
    END;
  END IF;

  IF v_clinic_id IS NULL THEN
    RETURN event;
  END IF;

  -- Injeta clinic_id e role em claims.app_metadata (canonical Supabase)
  v_claims := COALESCE(event->'claims', '{}'::jsonb);
  v_app_meta := COALESCE(v_claims->'app_metadata', '{}'::jsonb);
  v_app_meta := v_app_meta
    || jsonb_build_object('clinic_id', v_clinic_id::text);

  IF v_role IS NOT NULL THEN
    v_app_meta := v_app_meta || jsonb_build_object('app_role', v_role);
  END IF;

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app_meta);

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- GRANT pra Supabase Auth chamar (regra GOLD #3 + permissions)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  TO supabase_auth_admin;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Sanity check (regra GOLD #7)
DO $$
DECLARE
  v_fn_exists boolean;
  v_grant_ok  boolean;
  v_test_out  jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc
     WHERE proname = 'custom_access_token_hook'
       AND pronamespace = 'public'::regnamespace
  ) INTO v_fn_exists;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_schema = 'public'
       AND routine_name = 'custom_access_token_hook'
       AND grantee = 'supabase_auth_admin'
  ) INTO v_grant_ok;

  -- Smoke test · simula evento com user_id fake (uuid valido aleatorio)
  -- Funcao deve retornar event com app_metadata.clinic_id injetado.
  v_test_out := public.custom_access_token_hook(jsonb_build_object(
    'user_id', '00000000-0000-0000-0000-000000000000',
    'claims', jsonb_build_object('app_metadata', '{}'::jsonb)
  ));

  IF NOT (v_fn_exists AND v_grant_ok) THEN
    RAISE EXCEPTION '800-05 sanity FAIL · fn_exists=% grant_ok=%', v_fn_exists, v_grant_ok;
  END IF;

  RAISE NOTICE '800-05 OK · custom_access_token_hook criada + grant supabase_auth_admin · smoke test out=%',
    v_test_out::text;
  RAISE NOTICE '800-05 ATIVAR no Supabase Dashboard: Authentication → Hooks → Custom Access Token → Add hook → public.custom_access_token_hook';
END $$;
