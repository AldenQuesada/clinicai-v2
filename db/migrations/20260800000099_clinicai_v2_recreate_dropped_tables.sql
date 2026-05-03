-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 99 · clinicai-v2 · re-create dropped tables (anula mig 95)     ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Mig 95 (drop unused zero-byte tables) foi precipitada · vali apenas    ║
-- ║ uso em codigo TS, mas 41+ RPCs SQL legacy + 3 triggers em wa_messages  ║
-- ║ ainda referenciavam essas tabelas. Resultado: triggers zumbis          ║
-- ║ bloqueavam INSERT em wa_messages silenciosamente (incidente 2026-05-03 ║
-- ║ com webhook /secretaria nao salvando mensagens).                        ║
-- ║                                                                          ║
-- ║ Esta mig RE-CRIA as 21 tabelas dropadas como vazias (schema minimo)    ║
-- ║ pra blindar todas as RPCs/dashboards que dependem delas. Schema fica   ║
-- ║ identico ao pre-mig-95 em termos de existencia (mas com 0 rows).       ║
-- ║                                                                          ║
-- ║ Lesson learned: antes de DROP TABLE, varrer:                            ║
-- ║   - pg_proc (functions/RPCs SQL)                                         ║
-- ║   - pg_trigger (triggers em qualquer tabela)                             ║
-- ║   - codigo TS (apps/+ packages/)                                         ║
-- ║   - dashboards externos (Grafana, etc)                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.facial_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  lead_id uuid, token text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.facial_share_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid, accessed_at timestamptz DEFAULT now(), ip text
);
CREATE TABLE IF NOT EXISTS public.facial_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  lead_id uuid, payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fin_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  key text, value jsonb DEFAULT '{}'::jsonb, updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fin_annual_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  year int, payload jsonb DEFAULT '{}'::jsonb, updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.clinic_alexa_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  intent text, payload jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.retoque_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text, status text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid, module text, allowed boolean DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.pluggy_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  item_id text, status text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lead_tags (
  lead_id uuid, tag text,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(), PRIMARY KEY (lead_id, tag)
);
CREATE TABLE IF NOT EXISTS public.fm_storage_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text, scheduled_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.fm_share_rate_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid, hit_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.agenda_alerts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  message text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lp_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid, payload jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tag_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text, conflict_with text, resolved_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  model text, tokens int, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.automation_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text, definition jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid, payload jsonb, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid, phone text, status text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.medical_record_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid, file_path text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.lp_book_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  lead_id uuid, status text, created_at timestamptz DEFAULT now()
);

-- RLS + grants minimos pra todas
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'facial_shares','facial_share_access_log','facial_analyses','fin_config',
    'fin_annual_plan','clinic_alexa_log','retoque_campaigns','user_module_permissions',
    'pluggy_connections','lead_tags','fm_storage_cleanup_queue','fm_share_rate_log',
    'agenda_alerts_log','lp_consents','tag_conflicts','ai_interactions',
    'automation_flows','automation_logs','broadcast_recipients',
    'medical_record_attachments','lp_book_orders'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;
