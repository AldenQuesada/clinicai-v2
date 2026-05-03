-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 105 · clinicai-v2 · restore colunas faltantes (mig 99 mínimo)  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Mig 99 recriou 21 das 23 tabelas dropadas em mig 95, mas com schema     ║
-- ║ MÍNIMO (id + clinic_id + payload jsonb). 60 RPCs órfãs detectadas em    ║
-- ║ varredura pos-fix-Fátima esperam colunas tipadas que nao existem.      ║
-- ║                                                                          ║
-- ║ Estrategia: ALTER TABLE ADD COLUMN IF NOT EXISTS pra cada coluna do     ║
-- ║ schema ORIGINAL (varrido em clinic-dashboard/supabase/migrations).     ║
-- ║ Mantem colunas extras que mig 99 introduziu por compat (sem CASCADE).   ║
-- ║                                                                          ║
-- ║ Cobertura prioritaria (RPCs em uso ativo):                              ║
-- ║   - vpi_celebrations    (5 RPCs · growth_content + vpi_list_*)          ║
-- ║   - nps_responses       (13 RPCs · b2b_nps + growth_risks)              ║
-- ║   - user_module_perms   (5 RPCs · auth/permissions)                     ║
-- ║   - fin_config          (5 RPCs · cashflow + fin_)                      ║
-- ║   - facial_shares       (5 RPCs · fm_share_*)                           ║
-- ║   - pluggy_connections  (4 RPCs · banking sync)                         ║
-- ║   - clinic_alexa_log    (4 RPCs · alexa flow)                           ║
-- ║                                                                          ║
-- ║ Tabelas demais (agenda_alerts_log, retoque_campaigns, etc) podem ficar  ║
-- ║ pra Sprint próxima · não bloqueiam UI hoje (RPCs não chamadas no Lara). ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. vpi_celebrations ──────────────────────────────────────────────────
ALTER TABLE public.vpi_celebrations
  ADD COLUMN IF NOT EXISTS partner_id          uuid,
  ADD COLUMN IF NOT EXISTS outbox_id           uuid,
  ADD COLUMN IF NOT EXISTS message_id          uuid,
  ADD COLUMN IF NOT EXISTS reaction            text,
  ADD COLUMN IF NOT EXISTS context_text        text,
  ADD COLUMN IF NOT EXISTS reacted_at          timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS consent_story       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_asked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS consent_granted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS posted_at           timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by           uuid;

-- ── 2. nps_responses ─────────────────────────────────────────────────────
ALTER TABLE public.nps_responses
  ADD COLUMN IF NOT EXISTS appt_id                 text,
  ADD COLUMN IF NOT EXISTS lead_id                 text,
  ADD COLUMN IF NOT EXISTS phone_suffix            text,
  ADD COLUMN IF NOT EXISTS raw_message             text,
  ADD COLUMN IF NOT EXISTS category                text,
  ADD COLUMN IF NOT EXISTS testimonial_consent     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS testimonial_consent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS testimonial_text        text,
  ADD COLUMN IF NOT EXISTS testimonial_photo_url   text,
  ADD COLUMN IF NOT EXISTS follow_up_task_id       text;

-- ── 3. user_module_permissions ───────────────────────────────────────────
ALTER TABLE public.user_module_permissions
  ADD COLUMN IF NOT EXISTS module_id   text,
  ADD COLUMN IF NOT EXISTS page_id     text,
  ADD COLUMN IF NOT EXISTS updated_by  uuid;

-- ── 4. fin_config (schema completamente diferente · adiciona originais) ──
ALTER TABLE public.fin_config
  ADD COLUMN IF NOT EXISTS gastos     jsonb DEFAULT '{"fixos":[],"variaveis":[]}',
  ADD COLUMN IF NOT EXISTS procs      jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS demo       jsonb DEFAULT '{}';

-- ── 5. facial_shares ─────────────────────────────────────────────────────
ALTER TABLE public.facial_shares
  ADD COLUMN IF NOT EXISTS source_appointment_id      uuid,
  ADD COLUMN IF NOT EXISTS lead_name_snapshot         text,
  ADD COLUMN IF NOT EXISTS clinic_name_snapshot       text,
  ADD COLUMN IF NOT EXISTS professional_name_snapshot text,
  ADD COLUMN IF NOT EXISTS procedure_label_snapshot   text,
  ADD COLUMN IF NOT EXISTS before_photo_path          text,
  ADD COLUMN IF NOT EXISTS after_photo_path           text,
  ADD COLUMN IF NOT EXISTS metrics                    jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS analysis_text              text,
  ADD COLUMN IF NOT EXISTS cta_phone                  text,
  ADD COLUMN IF NOT EXISTS status                     text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS expires_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS consent_acknowledged_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS consent_text_snapshot      text,
  ADD COLUMN IF NOT EXISTS revoked_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by                 text;

-- ── 6. pluggy_connections ────────────────────────────────────────────────
ALTER TABLE public.pluggy_connections
  ADD COLUMN IF NOT EXISTS institution_id    text,
  ADD COLUMN IF NOT EXISTS institution_name  text,
  ADD COLUMN IF NOT EXISTS account_id        text,
  ADD COLUMN IF NOT EXISTS account_name      text,
  ADD COLUMN IF NOT EXISTS last_sync_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error   text,
  ADD COLUMN IF NOT EXISTS total_synced      int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata          jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by        uuid,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

-- ── 7. clinic_alexa_log ──────────────────────────────────────────────────
ALTER TABLE public.clinic_alexa_log
  ADD COLUMN IF NOT EXISTS device      text,
  ADD COLUMN IF NOT EXISTS message     text,
  ADD COLUMN IF NOT EXISTS rule_name   text,
  ADD COLUMN IF NOT EXISTS patient     text,
  ADD COLUMN IF NOT EXISTS status      text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error       text,
  ADD COLUMN IF NOT EXISTS attempts    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at     timestamptz;

-- ── 8. Refresh PostgREST schema cache ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
