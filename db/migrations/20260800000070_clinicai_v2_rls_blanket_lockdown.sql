-- ============================================================================
-- Mig 70 · RLS lockdown geral · Camada 2.5 da migracao CRM
-- ============================================================================
--
-- Auditoria pos-Camada 2 descobriu:
--   D2 · 19 tabelas sem RLS habilitada (16 sensiveis + 3 backups)
--   D3 · 6 tabelas com RLS ON mas sem policy (acesso 0 = service_role only)
--
-- Estrategia:
--   * Pra TODAS 19 tabelas: ENABLE RLS (defesa em profundidade)
--   * Pra todas elas: policy "service_role only" (USING false pra authenticated)
--     - Service_role no Supabase BYPASSA RLS por design, nao precisa policy
--     - Authenticated/anon: USING (false) bloqueia tudo
--     - Caller que precisar acesso UI futuramente adiciona policy especifica
--   * Pras 6 RLS-empty existentes (D3): manter intencional + COMMENT explicativo
--   * Pras 2 com clinic_id (clinic_secrets, magazine_audit_log): ADD policy
--     SELECT pra owners (UI possivel mostrar)
--
-- Decisao: caller que precisa mostrar dados dessas tabelas em UI tem 3 caminhos:
--   1. Acessar via service_role (Server Action/API route)
--   2. Pedir ADD POLICY especifica numa proxima mig
--   3. Refatorar pra adicionar clinic_id na tabela + policy clinic-scoped

BEGIN;

-- ============================================================
-- D2: 19 tabelas sem RLS habilitada -> ENABLE RLS + policy lockdown
-- ============================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- 16 sensiveis
    'ai_interactions', 'ai_personas', 'automation_flows', 'automation_logs',
    'broadcast_recipients', 'broadcasts', 'conversations', 'lead_tags',
    'legal_doc_token_failures', 'message_templates', 'messages', 'procedures',
    'tenants', 'users', 'wa_consent', 'whatsapp_instances',
    -- 3 backups (lockdown total)
    '_b2bv_id_remap_audit', 'appointments_backup_pre_wipe_2026_04_24',
    'leads_backup_pre_refactor'
  ];
  v_count int := 0;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Verifica se tabela existe (defensivo)
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname=t AND c.relkind='r') THEN
      RAISE NOTICE 'pulando %: tabela nao existe', t;
      CONTINUE;
    END IF;

    -- ENABLE RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Policy lockdown: nega tudo pra authenticated/anon · service_role bypassa
    EXECUTE format('DROP POLICY IF EXISTS %I_lockdown_authenticated ON public.%I', t, t);
    EXECUTE format($f$CREATE POLICY %I_lockdown_authenticated ON public.%I
                       AS RESTRICTIVE FOR ALL TO authenticated
                       USING (false) WITH CHECK (false)$f$, t, t);

    -- COMMENT documentando intencao
    EXECUTE format($f$COMMENT ON TABLE public.%I IS
      'RLS lockdown 2026-04-28 (mig 70): service_role only. Pra UI acessar, adicionar policy especifica.'$f$, t);

    v_count := v_count + 1;
    RAISE NOTICE 'lockdown: %', t;
  END LOOP;

  RAISE NOTICE 'mig 70 D2: % tabelas com RLS lockdown', v_count;
END $$;

-- ============================================================
-- D3: 6 tabelas com RLS ON sem policy -> COMMENT + 2 policies SELECT owner
-- ============================================================

DO $$
BEGIN
  -- COMMENT documentando que RLS ON sem policy e intencional
  COMMENT ON TABLE public.b2b_panel_rate_limits IS
    'RLS ON sem policy (intencional): service_role only · rate limiter interno.';
  COMMENT ON TABLE public.clinic_secrets IS
    'RLS ON sem policy default (intencional): service_role only · secrets sensiveis. Policy SELECT owner adicionada pra UI admin.';
  COMMENT ON TABLE public.magazine_audit_log IS
    'RLS ON sem policy default (intencional): service_role only · audit imutavel. Policy SELECT owner adicionada.';
  COMMENT ON TABLE public.magazine_config IS
    'RLS ON sem policy (intencional): service_role only · config global.';
  COMMENT ON TABLE public.mira_conversation_state IS
    'RLS ON sem policy (intencional): service_role only · state machine Mira.';
  COMMENT ON TABLE public.wa_pro_config IS
    'RLS ON sem policy (intencional): service_role only · WhatsApp Pro config.';

  RAISE NOTICE 'mig 70 D3: 6 tabelas RLS-empty documentadas';
END $$;

-- Pra clinic_secrets e magazine_audit_log (que tem clinic_id) · policy SELECT owner
DROP POLICY IF EXISTS clinic_secrets_owner_select ON public.clinic_secrets;
CREATE POLICY clinic_secrets_owner_select ON public.clinic_secrets
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id() AND app_role() = 'owner');

DROP POLICY IF EXISTS magazine_audit_log_admin_select ON public.magazine_audit_log;
CREATE POLICY magazine_audit_log_admin_select ON public.magazine_audit_log
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id() AND app_role() IN ('owner','admin'));

NOTIFY pgrst, 'reload schema';

-- Sanity: zero tabelas em public sem RLS (excluindo views)
DO $$
DECLARE v_count int; v_listing text;
BEGIN
  SELECT COUNT(*), string_agg(c.relname, ', ' ORDER BY c.relname)
    INTO v_count, v_listing
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'sanity: % tabelas ainda sem RLS: %', v_count, v_listing;
  END IF;

  RAISE NOTICE 'mig 70 OK: 100%% das tabelas em public tem RLS habilitada';
END $$;

COMMIT;
