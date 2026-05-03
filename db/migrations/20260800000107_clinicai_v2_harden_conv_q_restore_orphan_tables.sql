-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 107 · clinicai-v2 · hardening conversation_questions +         ║
-- ║                                  restore colunas tabelas com RPCs orfas+ ║
-- ║                                  revoke grants perigosos                  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ AUDIT 2026-05-03 detectou 3 classes de problema:                         ║
-- ║                                                                          ║
-- ║ 1. conversation_questions ainda nao hardenizada · grants amplos:         ║
-- ║    - anon: SELECT/INSERT/UPDATE/DELETE concedidos (criticos!)            ║
-- ║    - auth: TRUNCATE/TRIGGER/REFERENCES concedidos (overkill)             ║
-- ║    - 5 endpoints ja usam createServerClient (service_role) pra escrita,  ║
-- ║      so falta REVOKE pra alinhar com padrao wa_*.                        ║
-- ║                                                                          ║
-- ║ 2. clinics/profiles/wa_numbers tem TRUNCATE/TRIGGER/REFERENCES pra auth  ║
-- ║    · perigoso (TRUNCATE bypassa RLS por design no Postgres). Mantem      ║
-- ║    SELECT/INSERT/UPDATE/DELETE (UI usa) · revoga apenas TTR.             ║
-- ║                                                                          ║
-- ║ 3. 10 tabelas recriadas em mig 99 com schema MINIMO ainda quebram RPCs   ║
-- ║    legacy. Mig 105 cobriu 7 · faltam 6 com RPCs ativas:                  ║
-- ║      - retoque_campaigns (4 RPCs)                                         ║
-- ║      - agenda_alerts_log (2 RPCs)                                         ║
-- ║      - fm_storage_cleanup_queue (2 RPCs)                                  ║
-- ║      - fm_share_rate_log (1 RPC)                                          ║
-- ║      - facial_share_access_log (1 RPC)                                    ║
-- ║      - tag_conflicts (1 RPC)                                              ║
-- ║                                                                          ║
-- ║ ESTRATEGIA · ALTER TABLE ADD COLUMN IF NOT EXISTS · nullable · sem       ║
-- ║ NOT NULL retroativo (preserva rows minimas existentes vazias).           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

SET LOCAL app.audit_reason = 'mig_107_harden_conv_q_restore_orphans';

-- ═══════════════════════════════════════════════════════════════════════
-- 1. HARDENING conversation_questions · alinha com padrao wa_*
-- ═══════════════════════════════════════════════════════════════════════
-- Garante RLS enabled (idempotente)
ALTER TABLE public.conversation_questions ENABLE ROW LEVEL SECURITY;

-- Revoga TUDO de anon · perguntas internas nao devem ser acessiveis
-- por anon em hipotese alguma.
REVOKE ALL ON TABLE public.conversation_questions FROM anon;

-- Revoga escrita + privilegios perigosos de authenticated · mantem SELECT
-- pra UI listar perguntas (gated por RLS clinic_id).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON TABLE public.conversation_questions FROM authenticated;

-- Mantem SELECT pra authenticated (UI lista pendentes/answered)
GRANT SELECT ON TABLE public.conversation_questions TO authenticated;

-- service_role bypassa RLS por padrao no Supabase · garante grants explicitos
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conversation_questions TO service_role;

-- Drop policies de INSERT e UPDATE · escrita agora SOMENTE via service_role
-- (endpoints internos /api/secretaria/ask-doctor + /api/dra/questions/*).
DROP POLICY IF EXISTS conv_q_insert_own_clinic ON public.conversation_questions;
DROP POLICY IF EXISTS conv_q_update_own_clinic ON public.conversation_questions;

-- Mantem policy SELECT escopada por clinic_id (multi-tenant ADR-028).
-- Recria de forma idempotente se nao existir.
DROP POLICY IF EXISTS conv_q_select_own_clinic ON public.conversation_questions;
CREATE POLICY conv_q_select_own_clinic
  ON public.conversation_questions
  FOR SELECT
  TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- ═══════════════════════════════════════════════════════════════════════
-- 2. REVOGAR TRUNCATE/TRIGGER/REFERENCES de authenticated em tabelas
--    sensiveis · seguro pq UI nao usa esses 3 privilegios em nenhum
--    fluxo legitimo. Mantem SELECT/INSERT/UPDATE/DELETE intactos.
-- ═══════════════════════════════════════════════════════════════════════
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.clinics       FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.profiles      FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.wa_numbers    FROM authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. RESTORE COLUNAS · 6 tabelas com RPCs orfas · ADD COLUMN IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════════════════

-- 3.1 retoque_campaigns · 4 RPCs ativas (retoque_create, retoque_link_appointment,
--     retoque_list, retoque_update_status)
ALTER TABLE public.retoque_campaigns
  ADD COLUMN IF NOT EXISTS lead_id                  text,
  ADD COLUMN IF NOT EXISTS lead_phone               text,
  ADD COLUMN IF NOT EXISTS source_appointment_id    uuid,
  ADD COLUMN IF NOT EXISTS scheduled_appointment_id uuid,
  ADD COLUMN IF NOT EXISTS procedure_label          text,
  ADD COLUMN IF NOT EXISTS professional_id          uuid,
  ADD COLUMN IF NOT EXISTS professional_name        text,
  ADD COLUMN IF NOT EXISTS suggested_at             timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS suggested_by_user_id     uuid,
  ADD COLUMN IF NOT EXISTS suggested_offset_days    int,
  ADD COLUMN IF NOT EXISTS suggested_target_date    date,
  ADD COLUMN IF NOT EXISTS suggestion_notes         text,
  ADD COLUMN IF NOT EXISTS status_changed_at        timestamptz DEFAULT now();

-- 3.2 agenda_alerts_log · 2 RPCs (_agenda_alert_min_before_tick, _enqueue_agenda_alert)
ALTER TABLE public.agenda_alerts_log
  ADD COLUMN IF NOT EXISTS appt_id     text,
  ADD COLUMN IF NOT EXISTS lead_id     text,
  ADD COLUMN IF NOT EXISTS alert_kind  text,
  ADD COLUMN IF NOT EXISTS rule_id     uuid,
  ADD COLUMN IF NOT EXISTS recipient   text,
  ADD COLUMN IF NOT EXISTS outbox_id   bigint,
  ADD COLUMN IF NOT EXISTS fired_at    timestamptz DEFAULT now();

-- 3.3 fm_storage_cleanup_queue · 2 RPCs (fm_storage_cleanup_enqueue,
--     fm_storage_cleanup_mark_processed)
ALTER TABLE public.fm_storage_cleanup_queue
  ADD COLUMN IF NOT EXISTS bucket          text,
  ADD COLUMN IF NOT EXISTS storage_path    text,
  ADD COLUMN IF NOT EXISTS reason          text DEFAULT 'revoke_client_failed',
  ADD COLUMN IF NOT EXISTS source_share_id uuid,
  ADD COLUMN IF NOT EXISTS enqueued_at     timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempts        int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error      text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at    timestamptz;

-- 3.4 fm_share_rate_log · 1 RPC (_fm_share_rate_ok)
ALTER TABLE public.fm_share_rate_log
  ADD COLUMN IF NOT EXISTS token_hash    text,
  ADD COLUMN IF NOT EXISTS ip_hash       text DEFAULT '',
  ADD COLUMN IF NOT EXISTS window_start  timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempts      int DEFAULT 0;

-- 3.5 facial_share_access_log · 1 RPC (fm_share_resolve)
ALTER TABLE public.facial_share_access_log
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS ip_hash    text;

-- 3.6 tag_conflicts · 1 RPC (sdr_assign_tag)
ALTER TABLE public.tag_conflicts
  ADD COLUMN IF NOT EXISTS tag_a_id      uuid,
  ADD COLUMN IF NOT EXISTS tag_b_id      uuid,
  ADD COLUMN IF NOT EXISTS bidirectional boolean DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. NOTIFY PostgREST · reload schema cache
-- ═══════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

COMMIT;
