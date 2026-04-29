-- Reverte mig 71: recria _mag_current_clinic_id e re-aponta as 11 policies Magazine

BEGIN;

CREATE OR REPLACE FUNCTION public._mag_current_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'clinic_id', '')::uuid, public.app_clinic_id());
$$;

DO $$
DECLARE pol RECORD; v_qual text; v_check text; v_create text;
BEGIN
  FOR pol IN
    SELECT tablename, policyname, cmd, permissive,
           qual::text AS qual_text, with_check::text AS check_text
    FROM pg_policies WHERE schemaname='public'
    AND tablename LIKE 'magazine_%'
    AND (qual::text ILIKE '%app_clinic_id%' OR with_check::text ILIKE '%app_clinic_id%')
  LOOP
    v_qual := REPLACE(pol.qual_text, 'app_clinic_id()', '_mag_current_clinic_id()');
    v_check := REPLACE(COALESCE(pol.check_text, ''), 'app_clinic_id()', '_mag_current_clinic_id()');
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    v_create := format('CREATE POLICY %I ON public.%I AS %s FOR %s',
                       pol.policyname, pol.tablename, pol.permissive, pol.cmd);
    IF pol.cmd <> 'INSERT' AND v_qual <> '' THEN v_create := v_create || ' USING (' || v_qual || ')'; END IF;
    IF v_check <> '' THEN v_create := v_create || ' WITH CHECK (' || v_check || ')'; END IF;
    EXECUTE v_create;
  END LOOP;
END $$;

COMMIT;
