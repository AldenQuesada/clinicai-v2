-- ============================================================================
-- Onda 4 · CRM Core · Tabela LEADS (canonical schema v2)
-- ============================================================================
--
-- ⚠️ CLEAN-SLATE SCHEMA · NAO APLICAR DIRETO EM PROD COM DADOS DO LEGADO.
--    O Supabase project compartilhado JA TEM uma `public.leads` com 51 colunas
--    e 474 rows. Este arquivo descreve o schema CANONICO v2 (24 colunas).
--    Ordem operacional pra migrar prod:
--      1. (manual) Backup leads → backup_leads_20260427
--      2. (manual) Renomear public.leads → public.leads_legacy
--      3. Aplicar esta migration (cria public.leads canonica)
--      4. (manual) INSERT INTO public.leads (...) SELECT ... FROM
--         public.leads_legacy WHERE deleted_at IS NULL  -- map colunas
--      5. (manual) Verificar counts + sanity. So entao DROP leads_legacy.
--    Ambientes novos (dev/preview branches): aplicar direto.
--
-- Auditoria 2026-04-27 (lara-audit-site/crm-audit.html) flagou:
--  - 51 colunas no legado (clinic-dashboard) · ~30% morta/duplicada
--  - RLS INSERT com USING=NULL (qualquer authenticated insere em qualquer clinic)
--  - 2 helpers de tenant (`app_clinic_id` + `_sdr_clinic_id`) · inconsistencia
--  - 8 triggers em leads · 4 sao acoplamento B2B/VPI/Magazine (a remover)
--  - `data jsonb` com shadow de orcamentos (legado) · usado pra fazer cache
--    cliente-side de campos que JA existem nas colunas tipadas → eliminar
--
-- Decisoes desta migration (ADR-001 reforcado · §1-7 da auditoria):
--  1. Modelo excludente forte · soft-delete (`deleted_at`) quando vira
--     paciente OU orcamento. Sem cascata. Sem overlap UUID com patients.
--  2. RLS INSERT com WITH CHECK explicito (corrige bug do legado).
--  3. Helper unico `app_clinic_id()` (sem `_sdr_clinic_id` legacy).
--  4. CHECK constraints somente pra invariantes basicos (phase, source,
--     funnel, temperature, priority). State machine VIVE NAS RPCs (mig 65).
--  5. Triggers minimas · `set_updated_at`, normalizacao de phone, audit de
--     soft-delete. SEM trigger reverso B2B/VPI/Magazine.
--  6. Colunas eliminadas vs legado:
--     - `data jsonb` (shadow de outros modulos, valor zero)
--     - `customFields jsonb` (shadow de orcamentos)
--     - `tipo`, `cnpj`, `convenio`, `cor`, `sexo`, `estado_civil`, `profissao`,
--       `endereco`, `origem` (campos PT-BR duplicados de `email`/`source`/etc)
--     - `tags_clinica`, `tags`, `queixas_corporais` (TODOs nunca usados)
--     - `is_active` (substituido por `deleted_at IS NULL`)
--     - `conversation_status` (vive em wa_conversations agora)
--   Mantidas que valem ouro:
--     - `temperature` (cold/warm/hot · usado por Lara pra priorizar)
--     - `funnel` (procedimentos/fullface/olheiras · roteamento por playbook)
--     - `ai_persona` (persona Lara: onboarder/closer/recovery)
--     - `phase_origin` (audit · auto_transition vs manual_override vs rule)
--     - `day_bucket` (segmentacao temporal usada por SDR)
--     - `cpf`, `rg` (compliance, indices unique parciais)
--     - `queixas_faciais jsonb` (ultil pra Lara fullface flow)
--
-- ADR-029 RLS strategy aplicado · GOLD-STANDARD §SQL.

BEGIN;

-- ── 1. Tabela leads ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid        NOT NULL DEFAULT public._default_clinic_id(),

  -- ── Identidade ────────────────────────────────────────────────────────
  name                text        NOT NULL DEFAULT '',
  phone               text        NOT NULL DEFAULT '',
  email               text        NULL,
  cpf                 text        NULL,
  rg                  text        NULL,
  birth_date          date        NULL,
  idade               integer     NULL,

  -- ── State machine (entry/exit gate) ───────────────────────────────────
  phase               text        NOT NULL DEFAULT 'lead',
  phase_updated_at    timestamptz NULL,
  phase_updated_by    uuid        NULL,
  phase_origin        text        NULL,

  -- ── Funil/Lead-scoring/Roteamento ─────────────────────────────────────
  source              text        NOT NULL DEFAULT 'manual',
  source_type         text        NOT NULL DEFAULT 'manual',
  source_quiz_id      uuid        NULL,
  funnel              text        NOT NULL DEFAULT 'procedimentos',
  ai_persona          text        NOT NULL DEFAULT 'onboarder',
  temperature         text        NOT NULL DEFAULT 'warm',
  priority            text        NOT NULL DEFAULT 'normal',
  lead_score          integer     NOT NULL DEFAULT 0,
  day_bucket          integer     NULL,
  channel_mode        text        NOT NULL DEFAULT 'whatsapp',

  -- ── Atribuicao/operadores ─────────────────────────────────────────────
  assigned_to         uuid        NULL,

  -- ── Recovery / perdido ────────────────────────────────────────────────
  is_in_recovery      boolean     NOT NULL DEFAULT false,
  lost_reason         text        NULL,
  lost_at             timestamptz NULL,
  lost_by             uuid        NULL,

  -- ── Observacao livre + payload Lara ───────────────────────────────────
  queixas_faciais     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- `metadata` substitui o `data jsonb` legado · so guarda payloads de
  -- origem (UTM, quiz raw, voucher_id, vpi referral_session) · NUNCA shadow
  -- de outras tabelas (orcamentos vivem em public.orcamentos).

  -- ── WhatsApp / contato ────────────────────────────────────────────────
  wa_opt_in           boolean     NOT NULL DEFAULT true,
  last_contacted_at   timestamptz NULL,
  last_response_at    timestamptz NULL,

  -- ── Timestamps + soft-delete ──────────────────────────────────────────
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz NULL,

  -- ── FK ────────────────────────────────────────────────────────────────
  CONSTRAINT leads_clinic_id_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE
);

-- ── 2. CHECK constraints (invariantes basicos · state machine VIVE EM RPC) ──
-- IF NOT EXISTS via DO/EXCEPTION pra idempotencia.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_phase') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_phase
      CHECK (phase = ANY (ARRAY['lead','agendado','reagendado','compareceu','paciente','orcamento','perdido']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_source') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_source
      CHECK (source = ANY (ARRAY['manual','lara_recipient','lara_vpi_partner','b2b_partnership_referral','b2b_admin_registered','quiz','landing_page','import','webhook']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_source_type') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_source_type
      CHECK (source_type = ANY (ARRAY['manual','quiz','import','referral','social','whatsapp','whatsapp_fullface','landing_page','b2b_voucher','vpi_referral']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_funnel') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_funnel
      CHECK (funnel = ANY (ARRAY['procedimentos','fullface','olheiras']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_temperature') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_temperature
      CHECK (temperature = ANY (ARRAY['cold','warm','hot']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_priority') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_priority
      CHECK (priority = ANY (ARRAY['normal','high','urgent']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_phase_origin') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_phase_origin
      CHECK (phase_origin IS NULL OR phase_origin = ANY (ARRAY['auto_transition','manual_override','rule','bulk_move','import','webhook']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_channel_mode') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_channel_mode
      CHECK (channel_mode = ANY (ARRAY['whatsapp','phone','email','in_person']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_cpf_format') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_cpf_format
      CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_day_bucket') THEN
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_day_bucket
      CHECK (day_bucket IS NULL OR (day_bucket >= 0 AND day_bucket <= 7));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_leads_lost_consistency') THEN
    -- Invariante: se phase=perdido entao lost_reason precisa estar setado
    ALTER TABLE public.leads ADD CONSTRAINT chk_leads_lost_consistency
      CHECK (
        (phase <> 'perdido') OR
        (phase = 'perdido' AND lost_reason IS NOT NULL AND length(trim(lost_reason)) > 0)
      );
  END IF;
END $$;

-- ── 3. Indexes estrategicos ─────────────────────────────────────────────────
-- Phone unico por clinica (entrada principal de dedup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone_clinic
  ON public.leads (clinic_id, phone)
  WHERE deleted_at IS NULL;

-- Sufixo de phone (busca user-typed: "55119876", "9876")
CREATE INDEX IF NOT EXISTS idx_leads_phone_right8
  ON public.leads (clinic_id, "right"(phone, 8))
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- CPF / RG · UNIQUE parcial (vazios nao colidem)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cpf_clinic
  ON public.leads (clinic_id, cpf)
  WHERE deleted_at IS NULL AND cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_rg_clinic
  ON public.leads (clinic_id, rg)
  WHERE deleted_at IS NULL AND rg IS NOT NULL;

-- Filtros de operacao (Kanban, Lista, Reports)
CREATE INDEX IF NOT EXISTS idx_leads_clinic_phase
  ON public.leads (clinic_id, phase)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_clinic_updated
  ON public.leads (clinic_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to
  ON public.leads (assigned_to)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_funnel
  ON public.leads (clinic_id, funnel)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_temperature
  ON public.leads (clinic_id, temperature)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_priority
  ON public.leads (clinic_id, priority)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source_type
  ON public.leads (clinic_id, source_type)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lost
  ON public.leads (clinic_id, lost_at DESC)
  WHERE phase = 'perdido' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_recovery
  ON public.leads (clinic_id)
  WHERE is_in_recovery = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_email
  ON public.leads (clinic_id, email)
  WHERE email IS NOT NULL AND email <> '' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_day_bucket
  ON public.leads (clinic_id, day_bucket)
  WHERE deleted_at IS NULL AND day_bucket IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_metadata_gin
  ON public.leads USING gin (metadata);

-- ── 4. RLS ENABLED + policies tenant-scoped ─────────────────────────────────
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- SELECT: clinic + nao deletado + role visivel
DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND (
      public.app_role() = ANY (ARRAY['owner','admin','receptionist'])
      OR assigned_to = auth.uid()
      OR assigned_to IS NULL
    )
  );

-- INSERT: clinic + role autorizado · CORRIGE BUG DO LEGADO (USING=NULL)
DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist'])
  );

-- UPDATE: clinic + role autorizado (therapist so o seu)
DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
  FOR UPDATE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() = ANY (ARRAY['owner','admin','receptionist'])
      OR (public.app_role() = 'therapist' AND assigned_to = auth.uid())
    )
  )
  WITH CHECK (clinic_id = public.app_clinic_id());

-- DELETE: clinic + admin/owner only (HARD delete; soft-delete usa UPDATE)
DROP POLICY IF EXISTS leads_delete ON public.leads;
CREATE POLICY leads_delete ON public.leads
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── 5. Trigger BEFORE UPDATE pra updated_at ─────────────────────────────────
DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. Trigger normalizacao de phone (E.164-ish) ────────────────────────────
DROP TRIGGER IF EXISTS leads_normalize_phone ON public.leads;
CREATE TRIGGER leads_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_phone();

-- ── 7. Grants minimos ───────────────────────────────────────────────────────
REVOKE ALL ON public.leads FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- ── 8. Comments ─────────────────────────────────────────────────────────────
COMMENT ON TABLE public.leads IS
  'CRM core · pipeline de captacao + qualificacao. Modelo excludente: quando vira paciente/orcamento, deleted_at=now() e linha migra pra tabela espelho. Sem cascata reversa (B2B/VPI/Magazine usam RPC lead_create).';
COMMENT ON COLUMN public.leads.phase IS
  'Estado canonico no funil: lead → agendado → reagendado → compareceu → paciente|orcamento|perdido. Matriz de transicao em public._lead_phase_transition_allowed (ver mig 65).';
COMMENT ON COLUMN public.leads.phase_origin IS
  'Origem da ultima transicao: auto_transition (trigger appt), manual_override (UI), rule (sdr_evaluate_rules), bulk_move, import, webhook. Audit trail completo em phase_history.';
COMMENT ON COLUMN public.leads.deleted_at IS
  'Soft-delete. Quando NOT NULL: lead foi promovido a paciente/orcamento. Linha permanece pra audit/timeline mas nao aparece em leads_select. Hard-delete so via admin.';
COMMENT ON COLUMN public.leads.metadata IS
  'Payload de origem (UTM, voucher_id, partner_session_id, quiz_raw). NUNCA shadow de outras tabelas — orcamentos vivem em public.orcamentos.';
COMMENT ON COLUMN public.leads.is_in_recovery IS
  'true quando lead foi perdido e voltou (perdido → lead/agendado/reagendado). Usado pra priorizar UI e Lara nao perguntar de novo "como conheceu".';

-- ── 9. NOTIFY pgrst pra reload schema ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ── 10. SANITY CHECK ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rls boolean;
  v_count int;
BEGIN
  -- 10.1 Tabela existe
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'leads' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'sanity: public.leads nao existe';
  END IF;

  -- 10.2 RLS habilitada
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname = 'leads' AND relnamespace = 'public'::regnamespace;
  IF NOT v_rls THEN RAISE EXCEPTION 'sanity: RLS nao habilitada em public.leads'; END IF;

  -- 10.3 4 policies criadas
  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads';
  IF v_count < 4 THEN RAISE EXCEPTION 'sanity: public.leads tem % policies, esperado >= 4', v_count; END IF;

  -- 10.4 INSERT policy tem WITH CHECK nao-nulo (corrige bug legado)
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'leads'
       AND cmd = 'INSERT' AND with_check IS NULL
  ) THEN
    RAISE EXCEPTION 'sanity: INSERT policy em leads sem WITH CHECK (vetor cross-tenant!)';
  END IF;

  -- 10.5 anon nao tem grant
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE grantee = 'anon' AND table_schema = 'public' AND table_name = 'leads'
  ) THEN
    RAISE EXCEPTION 'sanity: anon ainda tem grant em leads';
  END IF;

  RAISE NOTICE 'mig 20260800000060 · leads OK · % policies', v_count;
END $$;

COMMIT;
