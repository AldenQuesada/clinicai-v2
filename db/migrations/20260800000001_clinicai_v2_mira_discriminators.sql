-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-01 · clinicai-v2 · Mira/Lara discriminators               ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: tabelas leads/wa_conversations/wa_messages sao compartilhadas ║
-- ║   entre Lara (Cloud · paciente direto) e Mira (Evolution · B2B/admin).  ║
-- ║   Sem discriminadores, queries cross-app capturam linhas que nao deviam.║
-- ║                                                                          ║
-- ║ Adiciona:                                                                ║
-- ║   leads.source              CHECK (lara_recipient/lara_vpi_partner/      ║
-- ║                                    b2b_partnership_referral/             ║
-- ║                                    b2b_admin_registered)                 ║
-- ║   wa_conversations.context_type CHECK (mira_b2b/mira_admin/              ║
-- ║                                        lara_beneficiary)                 ║
-- ║   wa_messages.channel       CHECK (evolution/cloud)                      ║
-- ║                                                                          ║
-- ║ DEFAULTs sensatos preservam backward compat · leads.source default       ║
-- ║   'lara_recipient' (todos leads atuais sao da Lara).                     ║
-- ║                                                                          ║
-- ║ Idempotencia: ADD COLUMN IF NOT EXISTS, indexes IF NOT EXISTS.           ║
-- ║ Rollback: 20260800000001_clinicai_v2_mira_discriminators.down.sql        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── leads.source ────────────────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'lara_recipient';

-- CHECK constraint separada · ADD COLUMN IF NOT EXISTS nao suporta CHECK
-- inline em todas as versoes do PG.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'leads_source_check'
       AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_source_check CHECK (
        source IN (
          'lara_recipient',
          'lara_vpi_partner',
          'b2b_partnership_referral',
          'b2b_admin_registered'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.leads.source IS
  'Discriminador de origem · lara_recipient (default · paciente direto), '
  'lara_vpi_partner (embaixadora VPI), b2b_partnership_referral (indicacao via '
  'parceria B2B), b2b_admin_registered (cadastrada manualmente pela Mira admin).';

CREATE INDEX IF NOT EXISTS idx_leads_source_clinic
  ON public.leads (source, clinic_id)
  WHERE source != 'lara_recipient';

-- ── wa_conversations.context_type ───────────────────────────────────────
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS context_type text NOT NULL DEFAULT 'lara_beneficiary';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'wa_conversations_context_type_check'
       AND conrelid = 'public.wa_conversations'::regclass
  ) THEN
    ALTER TABLE public.wa_conversations
      ADD CONSTRAINT wa_conversations_context_type_check CHECK (
        context_type IN ('mira_b2b', 'mira_admin', 'lara_beneficiary')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.wa_conversations.context_type IS
  'Discriminador de contexto · mira_b2b (Mira falando com parceira), '
  'mira_admin (Mira falando com admin · agenda/financeiro), '
  'lara_beneficiary (Lara falando com paciente · default).';

CREATE INDEX IF NOT EXISTS idx_wa_conversations_context_clinic
  ON public.wa_conversations (context_type, clinic_id)
  WHERE context_type != 'lara_beneficiary';

-- ── wa_messages.channel ─────────────────────────────────────────────────
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'cloud';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'wa_messages_channel_check'
       AND conrelid = 'public.wa_messages'::regclass
  ) THEN
    ALTER TABLE public.wa_messages
      ADD CONSTRAINT wa_messages_channel_check CHECK (
        channel IN ('cloud', 'evolution')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.wa_messages.channel IS
  'Provider WhatsApp · cloud (Meta Graph · Lara default) ou evolution '
  '(self-hosted Baileys · Mira).';

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_leads_src boolean;
  v_conv_ctx  boolean;
  v_msg_ch    boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='leads' AND column_name='source')
    INTO v_leads_src;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='wa_conversations' AND column_name='context_type')
    INTO v_conv_ctx;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='wa_messages' AND column_name='channel')
    INTO v_msg_ch;

  IF NOT (v_leads_src AND v_conv_ctx AND v_msg_ch) THEN
    RAISE EXCEPTION 'Sanity 800-01: discriminators nao adicionadas · leads.source=% wa_conversations.context_type=% wa_messages.channel=%',
      v_leads_src, v_conv_ctx, v_msg_ch;
  END IF;

  RAISE NOTICE 'Migration 800-01 OK · Mira/Lara discriminators (3 colunas + CHECK + indexes)';
END $$;

NOTIFY pgrst, 'reload schema';
