-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-14 · clinicai-v2 · RLS audit + corrective hardening       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: ADR-029 (estratégia RLS) cravado em 2026-04-25 · auditoria    ║
-- ║   docs/audits/2026-04-25-rls-audit.md detectou 3 policies abertas       ║
-- ║   (USING (true) WITH CHECK (true)) em tabelas com clinic_id e 2 tabelas ║
-- ║   sem REVOKE explicito de anon. Esta migration corrige tudo.            ║
-- ║                                                                          ║
-- ║ Tabelas tocadas:                                                         ║
-- ║   1. mira_conversation_state · DROP policy aberta · service_role only   ║
-- ║   2. b2b_voucher_dispatch_queue · 4 policies tenant-scoped + REVOKE anon║
-- ║   3. webhook_processing_queue · 4 policies tenant-scoped + REVOKE anon  ║
-- ║   4. inbox_notifications · REVOKE anon (defense-in-depth)               ║
-- ║   5. _ai_budget · REVOKE anon (defense-in-depth)                        ║
-- ║                                                                          ║
-- ║ Estratégia tenant-scoped (ADR-029 §3):                                  ║
-- ║   USING (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid)║
-- ║                                                                          ║
-- ║ Service_role bypassa RLS via privilege (Supabase default) · workers     ║
-- ║   continuam funcionando normalmente.                                     ║
-- ║                                                                          ║
-- ║ Idempotência: DROP IF EXISTS + CREATE POLICY · safe pra re-run.         ║
-- ║ Rollback: 20260800000014_clinicai_v2_rls_audit.down.sql                 ║
-- ║ GOLD #5 (.down), #7 (sanity), #10 (NOTIFY).                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · mira_conversation_state · service_role-only (sem clinic_id por design)
-- ═══════════════════════════════════════════════════════════════════════════
-- Schema deste table eh PK (phone, state_key) · nao tem clinic_id (state machine
-- por phone, nao por tenant). authenticated NAO precisa enxergar · all access via
-- RPC mira_state_set/get/clear (todos SECURITY DEFINER + service_role grant).

DROP POLICY IF EXISTS "mira_state_service_only" ON public.mira_conversation_state;

-- Sem CREATE POLICY · RLS habilitada sem policies = bloqueio total pra
-- authenticated/anon · service_role bypassa por privilege.

REVOKE ALL ON public.mira_conversation_state FROM anon, authenticated, public;
GRANT  ALL ON public.mira_conversation_state TO   service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · b2b_voucher_dispatch_queue · tenant-scoped policies + REVOKE anon
-- ═══════════════════════════════════════════════════════════════════════════
-- Hoje fluxo eh: parceira manda whatsapp -> Mira RPC enqueue (service_role) ->
-- worker dispatch (service_role). Nao tem UI authenticated lendo essa fila ainda.
-- Mas ja deixamos policies tenant-scoped prontas pra quando admin Mira acessar
-- via UI futuramente · nao bloqueia, nao gold-plate.

DROP POLICY IF EXISTS "b2b_dispatch_queue_service_only"      ON public.b2b_voucher_dispatch_queue;
DROP POLICY IF EXISTS tenant_isolation_select_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue;
DROP POLICY IF EXISTS tenant_isolation_insert_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue;
DROP POLICY IF EXISTS tenant_isolation_update_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue;
DROP POLICY IF EXISTS tenant_isolation_delete_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue;

CREATE POLICY tenant_isolation_select_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue
  FOR SELECT TO authenticated
  USING (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);

CREATE POLICY tenant_isolation_insert_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);

CREATE POLICY tenant_isolation_update_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue
  FOR UPDATE TO authenticated
  USING      (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid)
  WITH CHECK (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);

CREATE POLICY tenant_isolation_delete_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue
  FOR DELETE TO authenticated
  USING (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);

REVOKE ALL ON public.b2b_voucher_dispatch_queue FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_voucher_dispatch_queue TO authenticated;
GRANT ALL ON public.b2b_voucher_dispatch_queue TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · webhook_processing_queue · tenant-scoped policies + REVOKE anon
-- ═══════════════════════════════════════════════════════════════════════════
-- Worker /api/cron/webhook-processing-worker chama RPC pick/complete/fail via
-- service_role. authenticated nao tem motivo pra acessar essa fila hoje, mas
-- deixamos policies prontas (defense-in-depth + futura UI debug admin).

DROP POLICY IF EXISTS "webhook_queue_service_only"           ON public.webhook_processing_queue;
DROP POLICY IF EXISTS tenant_isolation_select_webhook_queue  ON public.webhook_processing_queue;
DROP POLICY IF EXISTS tenant_isolation_insert_webhook_queue  ON public.webhook_processing_queue;
DROP POLICY IF EXISTS tenant_isolation_update_webhook_queue  ON public.webhook_processing_queue;
DROP POLICY IF EXISTS tenant_isolation_delete_webhook_queue  ON public.webhook_processing_queue;

CREATE POLICY tenant_isolation_select_webhook_queue ON public.webhook_processing_queue
  FOR SELECT TO authenticated
  USING (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);

CREATE POLICY tenant_isolation_insert_webhook_queue ON public.webhook_processing_queue
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);

CREATE POLICY tenant_isolation_update_webhook_queue ON public.webhook_processing_queue
  FOR UPDATE TO authenticated
  USING      (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid)
  WITH CHECK (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);

CREATE POLICY tenant_isolation_delete_webhook_queue ON public.webhook_processing_queue
  FOR DELETE TO authenticated
  USING (clinic_id = (auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid);

REVOKE ALL ON public.webhook_processing_queue FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_processing_queue TO authenticated;
GRANT ALL ON public.webhook_processing_queue TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · inbox_notifications · REVOKE anon (mig 847 ja tem RLS + 2 policies ok)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mig 847 criou SELECT/UPDATE policies com app_clinic_id() · INSERT eh
-- service_role-only por design (Lara/Mira chamam RPC). Falta apenas o REVOKE
-- explicito pra anon (defense-in-depth · ADR-029 §6.3).

REVOKE ALL ON public.inbox_notifications FROM anon, public;
-- mantem grants existentes da mig 847:
GRANT SELECT, UPDATE        ON public.inbox_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inbox_notifications TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · _ai_budget · REVOKE anon (mig 848 ja tem RLS + SELECT policy ok)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mig 848 criou SELECT policy com app_clinic_id() · INSERT/UPDATE eh
-- service_role-only por design (workers/RPCs chamam). Mesmo defense-in-depth.

REVOKE ALL ON public._ai_budget FROM anon, public;
GRANT SELECT                ON public._ai_budget TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public._ai_budget TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Sanity check (regra GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_open_policies      int;
  v_anon_grants        int;
  v_rls_off_with_clinic int;
BEGIN
  -- 1. Nenhuma policy aberta (USING true / WITH CHECK true) em tabela com clinic_id
  SELECT COUNT(*) INTO v_open_policies
    FROM pg_policies p
    JOIN pg_tables t
      ON t.schemaname = p.schemaname AND t.tablename = p.tablename
   WHERE p.schemaname = 'public'
     AND EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name   = t.tablename
          AND c.column_name  = 'clinic_id'
     )
     AND (COALESCE(p.qual, 'true') = 'true' OR COALESCE(p.with_check, 'true') = 'true');

  IF v_open_policies > 0 THEN
    RAISE EXCEPTION 'Sanity 800-14 FAIL · % policies abertas em tabelas com clinic_id (ver ADR-029 §6.1)', v_open_policies;
  END IF;

  -- 2. Nenhuma tabela com clinic_id concede SELECT/INSERT/UPDATE/DELETE pra anon
  SELECT COUNT(*) INTO v_anon_grants
    FROM information_schema.role_table_grants
   WHERE grantee = 'anon'
     AND table_schema = 'public'
     AND table_name IN (
       SELECT table_name FROM information_schema.columns
        WHERE column_name = 'clinic_id' AND table_schema = 'public'
     )
     AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');

  IF v_anon_grants > 0 THEN
    RAISE EXCEPTION 'Sanity 800-14 FAIL · % grants pra anon em tabelas com clinic_id', v_anon_grants;
  END IF;

  -- 3. Toda tabela com clinic_id deve ter RLS habilitada
  SELECT COUNT(*) INTO v_rls_off_with_clinic
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
   WHERE t.schemaname = 'public'
     AND EXISTS (
       SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name   = t.tablename
          AND col.column_name  = 'clinic_id'
     )
     AND c.relrowsecurity = false;

  IF v_rls_off_with_clinic > 0 THEN
    RAISE EXCEPTION 'Sanity 800-14 FAIL · % tabelas com clinic_id sem RLS', v_rls_off_with_clinic;
  END IF;

  RAISE NOTICE 'Migration 800-14 OK · audit RLS · 0 policies abertas · 0 grants anon · 0 tabelas sem RLS';
END $$;

NOTIFY pgrst, 'reload schema';
