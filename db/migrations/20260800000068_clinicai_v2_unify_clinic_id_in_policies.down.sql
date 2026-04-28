-- Reverte mig 68: troca app_clinic_id() por _sdr_clinic_id() nas policies que
-- foram refatoradas. Aplica DROP+CREATE com swap reverso.
-- Requer _sdr_clinic_id() ainda existir (nao dropar antes desta down).

BEGIN;

DO $$
DECLARE
  pol RECORD;
  v_qual text; v_check text; v_create text; v_count int := 0;
BEGIN
  -- Lista de tabelas afetadas (de pre-flight). Se outras forem incluidas no futuro,
  -- listar aqui.
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, permissive,
           qual::text AS qual_text, with_check::text AS check_text
    FROM pg_policies
    WHERE schemaname='public'
    AND tablename IN (
      'automation_rules','budget_items','cashflow_config','cashflow_entries',
      'interactions','internal_alerts','lead_pipeline_positions','leads_audit',
      'pipelines','pipeline_stages','pluggy_connections','rule_executions',
      'tag_alert_templates','tag_assignments','tag_conflicts','tag_groups',
      'tag_msg_templates','tag_task_templates','tags','tasks',
      'wa_birthday_campaigns','wa_birthday_messages','wa_birthday_templates',
      'wa_message_templates','wa_phone_blacklist'
    )
    AND (qual::text ILIKE '%app_clinic_id%' OR with_check::text ILIKE '%app_clinic_id%')
  LOOP
    v_qual := REPLACE(pol.qual_text, 'app_clinic_id()', '_sdr_clinic_id()');
    v_check := REPLACE(COALESCE(pol.check_text, ''), 'app_clinic_id()', '_sdr_clinic_id()');

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);

    v_create := format('CREATE POLICY %I ON public.%I AS %s FOR %s',
                       pol.policyname, pol.tablename,
                       pol.permissive, pol.cmd);
    IF v_qual <> '' THEN v_create := v_create || ' USING (' || v_qual || ')'; END IF;
    IF v_check <> '' THEN v_create := v_create || ' WITH CHECK (' || v_check || ')'; END IF;
    EXECUTE v_create;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'down 68: % policies revertidas', v_count;
END $$;

COMMIT;
