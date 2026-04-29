-- ============================================================================
-- Mig 71 · Eliminar _mag_current_clinic_id duplicada · Camada 2.5 D4 fix
-- ============================================================================
--
-- Auditoria pos-Camada 2 D4 descobriu UNICA funcao em public que le auth.jwt()
-- direto (alem das canonicas): `_mag_current_clinic_id` do modulo Magazine.
--
-- Source da funcao:
--   COALESCE(auth.jwt() ->> 'clinic_id', app_clinic_id())
--
-- Funcionalmente segura (cai em app_clinic_id no fallback) MAS:
--   - Duplica logica de tenant resolution
--   - Le path LEGADO `clinic_id` em vez do canonical `app_metadata.clinic_id`
--   - 11 policies Magazine dependem dela
--
-- Estrategia:
--   1. Refatorar 11 policies pra usar `app_clinic_id()` direto
--   2. DROP `_mag_current_clinic_id`
--
-- Resultado: 1 unica funcao canonica de tenant resolution em todo o banco.

BEGIN;

DO $$
DECLARE
  pol RECORD;
  v_qual text;
  v_check text;
  v_create text;
  v_count int := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, permissive,
           qual::text AS qual_text, with_check::text AS check_text
    FROM pg_policies
    WHERE schemaname='public'
    AND (qual::text ILIKE '%_mag_current_clinic_id%' OR with_check::text ILIKE '%_mag_current_clinic_id%')
  LOOP
    v_qual := REPLACE(pol.qual_text, '_mag_current_clinic_id()', 'app_clinic_id()');
    v_check := REPLACE(COALESCE(pol.check_text, ''), '_mag_current_clinic_id()', 'app_clinic_id()');

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);

    v_create := format('CREATE POLICY %I ON public.%I AS %s FOR %s',
                        pol.policyname, pol.tablename,
                        CASE WHEN pol.permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                        pol.cmd);

    IF pol.cmd <> 'INSERT' AND v_qual <> '' THEN
      v_create := v_create || ' USING (' || v_qual || ')';
    END IF;
    IF v_check <> '' THEN
      v_create := v_create || ' WITH CHECK (' || v_check || ')';
    END IF;

    EXECUTE v_create;
    v_count := v_count + 1;
    RAISE NOTICE 'magazine policy refatorada: %.% (%)', pol.tablename, pol.policyname, pol.cmd;
  END LOOP;

  RAISE NOTICE 'mig 71: % policies Magazine refatoradas', v_count;
END $$;

-- DROP a funcao duplicada
DROP FUNCTION IF EXISTS public._mag_current_clinic_id();

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE v_func int; v_pol int;
BEGIN
  SELECT COUNT(*) INTO v_func FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_mag_current_clinic_id';
  IF v_func > 0 THEN RAISE EXCEPTION 'sanity: _mag_current_clinic_id ainda existe'; END IF;

  SELECT COUNT(*) INTO v_pol FROM pg_policies WHERE schemaname='public'
    AND (qual::text ILIKE '%_mag_current_clinic_id%' OR with_check::text ILIKE '%_mag_current_clinic_id%');
  IF v_pol > 0 THEN RAISE EXCEPTION 'sanity: % policies ainda referenciam _mag_current_clinic_id', v_pol; END IF;

  RAISE NOTICE 'mig 71 OK: app_clinic_id() agora e a UNICA funcao canonica de tenant resolution';
END $$;

COMMIT;
