-- Reverte mig 70: DISABLE RLS nas 19 tabelas + remove policies de lockdown

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'ai_interactions', 'ai_personas', 'automation_flows', 'automation_logs',
    'broadcast_recipients', 'broadcasts', 'conversations', 'lead_tags',
    'legal_doc_token_failures', 'message_templates', 'messages', 'procedures',
    'tenants', 'users', 'wa_consent', 'whatsapp_instances',
    '_b2bv_id_remap_audit', 'appointments_backup_pre_wipe_2026_04_24',
    'leads_backup_pre_refactor'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_lockdown_authenticated ON public.%I', t, t);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS clinic_secrets_owner_select ON public.clinic_secrets;
DROP POLICY IF EXISTS magazine_audit_log_admin_select ON public.magazine_audit_log;

COMMIT;
