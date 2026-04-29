-- ============================================================================
-- Mig 69 · Adicionar WITH CHECK em 43 RLS policies INSERT/UPDATE/ALL · Camada 2.5
-- ============================================================================
--
-- Auditoria pos-Camada 2 descobriu 43 policies INSERT/UPDATE/ALL com
-- with_check = NULL · vetor cross-tenant identico ao bug do legado que
-- corrigimos pro CRM core.
--
-- Estrategia: WITH CHECK = qual (replica condicao USING pra writes).
-- Pra cada policy, copia `qual` em `with_check` (preserva semantica multi-tenant).
--
-- Tabelas afetadas (43 policies em 30+ tabelas): agenda_visibility, app_users,
-- automation_rules, budget_items, clinic_alexa_devices, clinic_alexa_log,
-- clinics, fin_annual_plan, fin_config, fin_goals, interactions,
-- internal_alerts, lead_pipeline_positions, leads_audit, legal_doc_requests,
-- lp_rate_limits, medical_record_attachments, medical_records, notifications,
-- patient_complaints, pipeline_stages, pipelines, professional_profiles,
-- rule_executions (2), tag_alert_templates, tag_assignments, tag_conflicts,
-- tag_groups, tag_msg_templates, tag_task_templates, tags, tasks,
-- wa_birthday_campaigns, wa_birthday_messages, wa_birthday_templates,
-- wa_message_templates, wa_phone_blacklist.

BEGIN;

DO $$
DECLARE
  pol RECORD;
  v_qual text;
  v_create text;
  v_count int := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles,
           qual::text AS qual_text
    FROM pg_policies
    WHERE schemaname='public'
    AND cmd IN ('INSERT','UPDATE','ALL')
    AND with_check IS NULL
  LOOP
    -- USING (qual) sera copiado em WITH CHECK pra simetria
    v_qual := pol.qual_text;
    -- Pula se qual ja é NULL (sem condicao alguma · seria pior copiar nada)
    IF v_qual IS NULL OR v_qual = '' THEN
      RAISE NOTICE 'pulando %.%: qual vazio (policy aceita tudo)', pol.tablename, pol.policyname;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);

    v_create := format('CREATE POLICY %I ON public.%I AS %s FOR %s',
                        pol.policyname, pol.tablename,
                        CASE WHEN pol.permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                        pol.cmd);

    -- USING aplica em SELECT/UPDATE/DELETE
    IF pol.cmd <> 'INSERT' THEN
      v_create := v_create || ' USING (' || v_qual || ')';
    END IF;

    -- WITH CHECK aplica em INSERT/UPDATE/ALL · espelha qual
    v_create := v_create || ' WITH CHECK (' || v_qual || ')';

    EXECUTE v_create;
    v_count := v_count + 1;
    RAISE NOTICE 'patched %.% (%)', pol.tablename, pol.policyname, pol.cmd;
  END LOOP;

  RAISE NOTICE 'mig 69: % policies receberam WITH CHECK = qual', v_count;
END $$;

NOTIFY pgrst, 'reload schema';

-- Sanity: zero policies INSERT/UPDATE/ALL em public sem WITH CHECK (excluindo as
-- que tem qual=NULL e foram skipadas por design).
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public'
  AND cmd IN ('INSERT','UPDATE','ALL')
  AND with_check IS NULL
  AND qual IS NOT NULL
  AND qual::text <> '';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'sanity: % policies ainda sem WITH CHECK e com qual definido', v_count;
  END IF;

  RAISE NOTICE 'mig 69 OK: WITH CHECK adicionado em todas policies relevantes';
END $$;

COMMIT;
