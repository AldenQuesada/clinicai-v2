-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-139 · clinicai-v2 · b2b_voucher_dispatch_events ledger    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Cria ledger dedicado pra correlacionar voucher × mensagem WhatsApp ×    ║
-- ║ conversa. Cobre os 5+ writers heterogêneos do domínio voucher/B2B que   ║
-- ║ hoje deixam rastro fragmentado em tabelas distintas:                    ║
-- ║   - b2b-voucher-audio      → wa_messages + b2b_comm_dispatch_log        ║
-- ║   - b2b-comm-dispatch      → b2b_comm_dispatch_log direto (sem voucher)║
-- ║   - lara-voucher-followup  → b2b_comm_dispatch_log + meta jsonb         ║
-- ║   - b2b-mira-router        → wa_pro_messages (paralelo)                 ║
-- ║   - b2b-mira-welcome       → wa_pro_messages (paralelo)                 ║
-- ║                                                                          ║
-- ║ Escopo desta migration: SOMENTE schema + RLS + grants. Backfill,        ║
-- ║ trigger backfill por token, e refactor dos writers ficam pra blocos     ║
-- ║ separados (140+).                                                        ║
-- ║                                                                          ║
-- ║ Aplicada manualmente em prod 2026-05-07. Validação observada:           ║
-- ║   table_exists = true                                                    ║
-- ║   rls_enabled = true                                                     ║
-- ║   rls_forced = false                                                     ║
-- ║   tenant_all_policy_count = 1                                            ║
-- ║   index_count = 11                                                       ║
-- ║   fk_count = 6                                                           ║
-- ║   final_decision =                                                       ║
-- ║     PASS_LEDGER_TABLE_CREATED_READY_TO_VERSION_MIGRATION_139            ║
-- ║                                                                          ║
-- ║ Idempotência:                                                            ║
-- ║   - CREATE TABLE IF NOT EXISTS                                           ║
-- ║   - CREATE INDEX IF NOT EXISTS                                           ║
-- ║   - DO block guarded pra policy (CREATE POLICY não aceita IF NOT EXISTS)║
-- ║   - GRANT/REVOKE são idempotentes nativamente                            ║
-- ║   - sanity final usa RAISE NOTICE/WARNING · sem exception em replay     ║
-- ║                                                                          ║
-- ║ ADR-028 multi-tenant: clinic_id NOT NULL · RLS via app_clinic_id() JWT  ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CREATE TABLE · ledger b2b_voucher_dispatch_events
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.b2b_voucher_dispatch_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant ADR-028
  clinic_id         uuid NOT NULL
                    REFERENCES public.clinics(id) ON DELETE CASCADE,

  -- Domínio voucher
  voucher_id        uuid NOT NULL
                    REFERENCES public.b2b_vouchers(id) ON DELETE CASCADE,
  partnership_id    uuid
                    REFERENCES public.b2b_partnerships(id) ON DELETE SET NULL,

  -- Recipient
  recipient_role    text NOT NULL
                    CHECK (recipient_role IN
                      ('beneficiary','partner','admin','team','unknown')),
  recipient_phone   text,
  recipient_name    text,

  -- Tipo do evento (granular · permite contar áudio/texto/confirmação por voucher)
  event_type        text NOT NULL
                    CHECK (event_type IN
                      ('voucher_text','voucher_audio','partner_confirmation',
                       'partner_followup','beneficiary_followup',
                       'manual_followup','system_note','unknown')),
  direction         text NOT NULL DEFAULT 'outbound'
                    CHECK (direction IN ('outbound','inbound','internal')),

  -- Canal técnico
  channel           text
                    CHECK (channel IS NULL OR channel IN ('cloud','evolution')),
  sender_instance   text,
  wa_number_id      uuid
                    REFERENCES public.wa_numbers(id) ON DELETE SET NULL,

  -- Vínculos com mensagem física
  conversation_id   uuid
                    REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  wa_message_pk     uuid
                    REFERENCES public.wa_messages(id) ON DELETE SET NULL,
  provider_msg_id   text,
  wa_message_id     text,
  token             text,

  -- Estado runtime
  status            text,
  error_message     text,
  sent_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Soft-link / forensics
  raw               jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.b2b_voucher_dispatch_events IS
'Ledger de eventos WhatsApp vinculados a vouchers B2B. Cada row é uma mensagem (texto/áudio/confirmação/follow-up) emitida ou relacionada a um voucher · cobre disparos heterogêneos (b2b-voucher-audio, b2b-comm-dispatch, lara-voucher-followup, b2b-mira-router, b2b-mira-welcome). Mig 139.';

COMMENT ON COLUMN public.b2b_voucher_dispatch_events.voucher_id IS
'FK obrigatória pro voucher · ledger é específico de voucher; eventos B2B genéricos vão em b2b_comm_dispatch_log.';

COMMENT ON COLUMN public.b2b_voucher_dispatch_events.event_type IS
'Tipo do evento · granular pra distinguir áudio inicial / texto+link / confirmação parceiro / follow-ups / manual. ''unknown'' tolera backfill por token quando heurística não classifica.';

COMMENT ON COLUMN public.b2b_voucher_dispatch_events.wa_message_pk IS
'FK opcional pra wa_messages.id (uuid interno). NULL quando voucher foi disparado por path legado que não chamou b2b_log_outbound_message · neste caso provider_msg_id ainda permite cross-link forense.';

COMMENT ON COLUMN public.b2b_voucher_dispatch_events.provider_msg_id IS
'ID cru retornado pelo provider (Cloud Meta wamid OU Evolution Baileys key.id). Coexiste com wa_message_pk · usado pra correlacionar mesmo quando wa_messages.id é desconhecido.';

COMMENT ON COLUMN public.b2b_voucher_dispatch_events.raw IS
'Contexto livre · script áudio, vars do template, panel_url, channel_source, source da edge, etc. · sem inflar colunas dedicadas.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Índices
-- ═══════════════════════════════════════════════════════════════════════════

-- 2.1 · UNIQUE parcial · idempotência por (voucher × event_type × provider_msg_id)
--      Evita dupla escrita quando writer canônico + trigger backfill convergem
--      pra mesma mensagem. NULL provider_msg_id (paths legados sem id) ficam
--      fora do UNIQUE · backfill manual desses casos não duplica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_b2b_voucher_dispatch_events_provider
  ON public.b2b_voucher_dispatch_events (voucher_id, event_type, provider_msg_id)
  WHERE provider_msg_id IS NOT NULL;

-- 2.2 · Listagens por voucher · timeline ordenada
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_voucher
  ON public.b2b_voucher_dispatch_events
    (voucher_id, sent_at DESC NULLS LAST, created_at DESC);

-- 2.3 · Listagens por clínica + recência (dashboards globais)
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_clinic_created
  ON public.b2b_voucher_dispatch_events (clinic_id, created_at DESC);

-- 2.4 · Listagens por partnership (painel B2B do parceiro)
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_partnership
  ON public.b2b_voucher_dispatch_events (partnership_id, created_at DESC)
  WHERE partnership_id IS NOT NULL;

-- 2.5 · Cross-link conv → ledger (timeline em /secretaria com badge voucher)
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_conversation
  ON public.b2b_voucher_dispatch_events (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

-- 2.6 · Cross-link wa_messages → ledger
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_wa_message_pk
  ON public.b2b_voucher_dispatch_events (wa_message_pk)
  WHERE wa_message_pk IS NOT NULL;

-- 2.7 · Lookup forense por provider id (logs Evolution / Meta)
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_provider_msg_id
  ON public.b2b_voucher_dispatch_events (provider_msg_id)
  WHERE provider_msg_id IS NOT NULL;

-- 2.8 · Lookup forense por wa_message_id (formato externo · pode coincidir
--      ou divergir de provider_msg_id dependendo do path)
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_wa_message_id
  ON public.b2b_voucher_dispatch_events (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- 2.9 · Lookup por token (backfill futuro · webhook detection)
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_token
  ON public.b2b_voucher_dispatch_events (clinic_id, token)
  WHERE token IS NOT NULL;

-- 2.10 · Lookup por phone normalizado (right 11 dígitos · cobre variantes BR
--       com/sem 9 do celular). Útil pra cross-channel detection sem JOIN.
CREATE INDEX IF NOT EXISTS idx_b2b_voucher_dispatch_events_phone_suffix
  ON public.b2b_voucher_dispatch_events (
    clinic_id,
    right(regexp_replace(COALESCE(recipient_phone, ''), '\D', '', 'g'), 11)
  )
  WHERE recipient_phone IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS · multi-tenant via app_clinic_id() JWT
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_voucher_dispatch_events ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY não aceita IF NOT EXISTS · DO block guarda idempotência.
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'b2b_voucher_dispatch_events'
       AND policyname = 'rls_tenant_all_safe'
  ) THEN
    CREATE POLICY rls_tenant_all_safe
      ON public.b2b_voucher_dispatch_events
      FOR ALL
      TO authenticated
      USING      (clinic_id = app_clinic_id())
      WITH CHECK (clinic_id = app_clinic_id());
  END IF;
END
$policy$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Grants · authenticated lê/escreve via RLS · service_role full
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON TABLE public.b2b_voucher_dispatch_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.b2b_voucher_dispatch_events TO authenticated;
GRANT ALL ON TABLE public.b2b_voucher_dispatch_events TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Sanity check final (regra GOLD #7) · RAISE WARNING/NOTICE · sem exception
--    Sobrevive a replay em ambiente já provisionado.
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_table_exists           int;
  v_rls_enabled            boolean;
  v_tenant_policy_count    int;
  v_index_count            int;
  v_fk_count               int;
BEGIN
  -- 6.1 · table_exists
  SELECT count(*) INTO v_table_exists
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name   = 'b2b_voucher_dispatch_events';
  IF v_table_exists < 1 THEN
    RAISE WARNING '[mig 139 sanity] tabela b2b_voucher_dispatch_events ausente';
    RETURN;
  END IF;

  -- 6.2 · rls_enabled
  SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'b2b_voucher_dispatch_events';
  IF v_rls_enabled IS NOT TRUE THEN
    RAISE WARNING '[mig 139 sanity] RLS NÃO habilitado em b2b_voucher_dispatch_events';
  END IF;

  -- 6.3 · tenant_all_policy_count
  SELECT count(*) INTO v_tenant_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename  = 'b2b_voucher_dispatch_events'
     AND policyname = 'rls_tenant_all_safe';
  IF v_tenant_policy_count < 1 THEN
    RAISE WARNING '[mig 139 sanity] policy rls_tenant_all_safe ausente';
  END IF;

  -- 6.4 · index_count (esperado: 1 PK + 10 índices)
  SELECT count(*) INTO v_index_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename  = 'b2b_voucher_dispatch_events';
  IF v_index_count < 11 THEN
    RAISE WARNING '[mig 139 sanity] esperava ≥11 índices, encontrou %', v_index_count;
  END IF;

  -- 6.5 · fk_count (esperado: 6 FKs · clinic_id, voucher_id, partnership_id,
  --       wa_number_id, conversation_id, wa_message_pk)
  SELECT count(*) INTO v_fk_count
    FROM pg_constraint c
    JOIN pg_class      r ON r.oid = c.conrelid
    JOIN pg_namespace  n ON n.oid = r.relnamespace
   WHERE n.nspname = 'public'
     AND r.relname = 'b2b_voucher_dispatch_events'
     AND c.contype = 'f';
  IF v_fk_count < 6 THEN
    RAISE WARNING '[mig 139 sanity] esperava 6 FKs, encontrou %', v_fk_count;
  END IF;

  RAISE NOTICE
    '[mig 139] sanity ok · table=% · rls=% · policy=% · indexes=% · fks=%',
    v_table_exists, v_rls_enabled, v_tenant_policy_count, v_index_count, v_fk_count;
END
$sanity$;

COMMIT;
