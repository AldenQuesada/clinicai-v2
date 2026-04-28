-- Reverte mig 69: remove WITH CHECK adicionado em 43 policies
-- Loop reverso · seta with_check = NULL onde foi sincronizado com qual.

BEGIN;

DO $$
DECLARE
  pol RECORD;
  v_create text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, permissive,
           qual::text AS qual_text, with_check::text AS check_text
    FROM pg_policies
    WHERE schemaname='public'
    AND cmd IN ('INSERT','UPDATE','ALL')
    AND with_check IS NOT NULL
    AND qual::text = with_check::text  -- so reverte se with_check espelha qual (mig 69 fez isso)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    v_create := format('CREATE POLICY %I ON public.%I AS %s FOR %s',
                       pol.policyname, pol.tablename,
                       pol.permissive, pol.cmd);
    IF pol.cmd <> 'INSERT' AND pol.qual_text <> '' THEN
      v_create := v_create || ' USING (' || pol.qual_text || ')';
    END IF;
    EXECUTE v_create;
  END LOOP;
END $$;

COMMIT;
