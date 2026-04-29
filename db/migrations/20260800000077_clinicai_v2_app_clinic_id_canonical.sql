-- ============================================================================
-- Mig 67 · Endurecer app_clinic_id() · Camada 2 da migracao CRM
-- ============================================================================
--
-- BUG GRAVE descoberto na Camada 2 da auditoria 2026-04-28:
-- A funcao `app_clinic_id()` lia `auth.jwt() ->> 'clinic_id'` (path errado).
-- O custom_access_token_hook injeta em `app_metadata.clinic_id` (canonical Supabase).
-- Resultado: TODA RLS CRM core caia no fallback "primeira clinica" (sempre Mirian).
-- Multi-tenant nunca funcionou de verdade neste banco.
--
-- Esta mig:
--  1. Corrige o path: agora le `claims.app_metadata.clinic_id`
--  2. Adiciona path alternativo `claims.app_metadata.clinic_id` (canonical)
--     E o legacy `clinic_id` na raiz (compat)
--  3. Condiciona o fallback "primeira clinica" em GUC `app.tenant_failfast`
--     - default 'false' = fallback ativo (compat single-tenant Mirian atual)
--     - quando ligar 'true' = NULL retornado (forca JWT valido)
--
-- Ordem do COALESCE (mais seguro -> menos seguro):
--  1. app.clinic_id GUC (set manual em sessao admin)
--  2. JWT app_metadata.clinic_id (canonical Supabase)
--  3. JWT raiz clinic_id (legacy/compat)
--  4. (se !failfast) primeira clinica criada (single-tenant safety net)

BEGIN;

CREATE OR REPLACE FUNCTION public.app_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT COALESCE(
    -- 1. GUC explicito (admin sessions, scripts)
    NULLIF(current_setting('app.clinic_id', true), '')::uuid,
    -- 2. JWT app_metadata.clinic_id (canonical · onde o hook injeta)
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'clinic_id', '')::uuid,
    -- 3. JWT raiz clinic_id (legacy compat · alguns clientes injetam aqui)
    NULLIF(auth.jwt() ->> 'clinic_id', '')::uuid,
    -- 4. Fallback single-tenant Mirian · DESATIVE em multi-tenant prod
    --    Setar `app.tenant_failfast = 'true'` desativa este fallback
    CASE
      WHEN current_setting('app.tenant_failfast', true) = 'true' THEN NULL
      ELSE (SELECT id FROM public.clinics ORDER BY created_at ASC LIMIT 1)
    END
  );
$function$;

COMMENT ON FUNCTION public.app_clinic_id() IS
  'Resolve clinic_id do contexto atual. Ordem: GUC -> JWT app_metadata -> JWT raiz -> fallback (single-tenant Mirian). Em multi-tenant prod, setar `app.tenant_failfast=true` no postgresql.conf.';

-- Sanity DO $$ — confirma que funcao foi atualizada
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='app_clinic_id';

  IF v_src NOT LIKE '%app_metadata%' THEN
    RAISE EXCEPTION 'sanity: app_clinic_id nao foi atualizada com path app_metadata';
  END IF;

  IF v_src NOT LIKE '%tenant_failfast%' THEN
    RAISE EXCEPTION 'sanity: app_clinic_id nao tem GUC tenant_failfast';
  END IF;

  RAISE NOTICE 'mig 67 OK: app_clinic_id endurecida com app_metadata + failfast condicional';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
