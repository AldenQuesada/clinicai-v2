-- ============================================================================
-- Mig 68 · Unificar clinic_id resolver · Camada 2 da migracao CRM
-- ============================================================================
--
-- 38 RLS policies em 30+ tabelas auxiliares ainda usavam `_sdr_clinic_id()`
-- (funcao duplicada que le `profiles.clinic_id`). Camada 2 unifica TODOS
-- os callers em `app_clinic_id()` (canonica · le JWT app_metadata).
--
-- Esta mig faz DROP+CREATE de cada policy substituindo a funcao na expressao
-- (qual + with_check). Loop DO $$ extrai expressao atual via pg_policies,
-- aplica replace literal, recria policy.
--
-- Ate antes desta mig, as 38 policies funcionavam com mesmo behavior porque
-- `_sdr_clinic_id` cai em `app_clinic_id` no fallback. Diferenca: agora
-- todas usam o mesmo path canonico (JWT app_metadata · com fallback Mirian
-- enquanto `app.tenant_failfast` nao for 'true').
--
-- Total esperado: 38 policies refatoradas em 30+ tabelas.

BEGIN;

DO $$
DECLARE
  pol RECORD;
  v_qual text;
  v_check text;
  v_drop text;
  v_create text;
  v_count int := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, permissive,
           roles, qual::text AS qual_text, with_check::text AS check_text
    FROM pg_policies
    WHERE schemaname = 'public'
    AND (qual::text ILIKE '%_sdr_clinic_id%' OR with_check::text ILIKE '%_sdr_clinic_id%')
  LOOP
    -- Substitui referencia legada por canonica
    v_qual := REPLACE(pol.qual_text, '_sdr_clinic_id()', 'app_clinic_id()');
    v_check := REPLACE(COALESCE(pol.check_text, ''), '_sdr_clinic_id()', 'app_clinic_id()');

    -- DROP policy existente
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);

    -- CREATE com expressao corrigida
    v_create := format('CREATE POLICY %I ON public.%I AS %s FOR %s',
                        pol.policyname, pol.tablename,
                        CASE WHEN pol.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                        pol.cmd);

    -- USING (qual)
    IF v_qual IS NOT NULL AND v_qual <> '' THEN
      v_create := v_create || ' USING (' || v_qual || ')';
    END IF;

    -- WITH CHECK
    IF v_check IS NOT NULL AND v_check <> '' THEN
      v_create := v_create || ' WITH CHECK (' || v_check || ')';
    END IF;

    EXECUTE v_create;
    v_count := v_count + 1;
    RAISE NOTICE 'refatorada: %.% (%)', pol.tablename, pol.policyname, pol.cmd;
  END LOOP;

  RAISE NOTICE 'mig 68: % policies refatoradas', v_count;
END $$;

NOTIFY pgrst, 'reload schema';

-- Sanity: zero policies usando _sdr_clinic_id
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
  AND (qual::text ILIKE '%_sdr_clinic_id%' OR with_check::text ILIKE '%_sdr_clinic_id%');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'sanity: ainda ha % policies usando _sdr_clinic_id', v_count;
  END IF;

  RAISE NOTICE 'mig 68 OK: 0 policies referenciam _sdr_clinic_id';
END $$;

COMMIT;
