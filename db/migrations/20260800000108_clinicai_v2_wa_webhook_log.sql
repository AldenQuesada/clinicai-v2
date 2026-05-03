-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 108 · clinicai-v2 · wa_webhook_log (diag tracing)              ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug 2026-05-03: msgs do user pra Lara nova nao chegam no DB. Webhook    ║
-- ║ /api/webhook/whatsapp rejeita 401 sem signature valida · sem acesso a   ║
-- ║ logs Easypanel nao da pra saber se Meta esta chamando OU qual           ║
-- ║ phone_number_id vem no payload.                                          ║
-- ║                                                                          ║
-- ║ Esta tabela captura RAW BODY + HEADERS de cada hit no /api/webhook      ║
-- ║ ANTES de qualquer validacao · permite debug ponta-a-ponta sem logs.     ║
-- ║                                                                          ║
-- ║ ACESSO:                                                                  ║
-- ║ - service_role: full (webhook escreve)                                   ║
-- ║ - authenticated: SELECT only · admin/owner via RLS                      ║
-- ║                                                                          ║
-- ║ TTL · cron retention de 24h (criar depois se virar permanente).         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.wa_webhook_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hit_at          timestamptz NOT NULL DEFAULT now(),
  endpoint        text NOT NULL,
  method          text NOT NULL,
  signature_ok    boolean,
  signature_reason text,
  phone_number_id text,
  from_phone      text,
  message_text    text,
  message_type    text,
  raw_body        text,
  headers_subset  jsonb,
  result_status   integer,
  result_summary  text
);

CREATE INDEX IF NOT EXISTS idx_wa_webhook_log_hit_at
  ON public.wa_webhook_log (hit_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_log_phone_at
  ON public.wa_webhook_log (from_phone, hit_at DESC);

ALTER TABLE public.wa_webhook_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wa_webhook_log FROM anon;
REVOKE ALL ON TABLE public.wa_webhook_log FROM authenticated;
GRANT SELECT ON TABLE public.wa_webhook_log TO authenticated;
GRANT SELECT, INSERT ON TABLE public.wa_webhook_log TO service_role;

DROP POLICY IF EXISTS wa_webhook_log_select_admin ON public.wa_webhook_log;
CREATE POLICY wa_webhook_log_select_admin
  ON public.wa_webhook_log
  FOR SELECT
  TO authenticated
  USING (public.app_role() IN ('owner','admin'));

NOTIFY pgrst, 'reload schema';
