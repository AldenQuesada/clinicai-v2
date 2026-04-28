-- ============================================================================
-- Onda 4 · CRM Core · Tabela ORCAMENTOS (canonical schema v2)
-- ============================================================================
--
-- ⚠️ CLEAN-SLATE SCHEMA · ver header de mig 60. Hoje orcamentos tem 22
--    colunas + 1 row · migracao trivial em prod (1 INSERT manual).
--
-- Auditoria 2026-04-27 flagou:
--  - Legado tem 22 colunas + nome interno "budgets" (renomeado p orcamentos
--    via VIEW backward-compat) · UI continua escrevendo em
--    `leads.customFields.orcamentos[]` JSONB (shadow grosseiro).
--  - FK orcamentos.lead_id NOT NULL · viola modelo excludente quando lead
--    vira paciente (lead row sob soft-delete · FK ainda aponta).
--  - Sem RLS DELETE (legado tem `budgets_clinic_all FOR ALL USING(clinic_id)`)
--  - Sem CHECK pra coerencia subtotal/discount/total.
--
-- Decisoes desta migration:
--  1. **Subject dual** (igual appointments): `lead_id NULL` + `patient_id NULL`,
--     CHECK garante exatamente um. Quando lead_to_orcamento() roda:
--     orcamento criado com lead_id=lead.id; em seguida lead.deleted_at=now();
--     no futuro, se vira paciente: UPDATE orcamentos SET lead_id=NULL,
--     patient_id=ID. Sem orfaos.
--  2. snake_case 100%, sem `customFields` shadow.
--  3. Items vivem em coluna jsonb `items` (1 array, validado por shape).
--     Pagamentos jsonb mantem-se (legado tem · usado por relatorio).
--  4. RLS canonical · 4 policies tenant-scoped.
--  5. CHECK invariantes: total = subtotal - discount, status valido.
--  6. share_token UNIQUE per clinic (publico via token, sem JWT).
--
-- Dependencias: leads (mig 60), patients (mig 61).

BEGIN;

-- ── 1. Tabela orcamentos ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid        NOT NULL DEFAULT public._default_clinic_id(),

  -- ── Subject (mesmo padrao de appointments · modelo excludente forte) ──
  lead_id             uuid        NULL,
  patient_id          uuid        NULL,

  -- ── Identificacao ─────────────────────────────────────────────────────
  number              text        NULL, -- numero interno gerado (opcional)
  title               text        NULL,
  notes               text        NULL,

  -- ── Items + valores ───────────────────────────────────────────────────
  items               jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- shape esperado: [{ name, qty, unit_price, subtotal, procedure_code? }]
  subtotal            numeric(12,2) NOT NULL DEFAULT 0,
  discount            numeric(12,2) NOT NULL DEFAULT 0,
  total               numeric(12,2) NOT NULL DEFAULT 0,

  -- ── Status (state machine) ────────────────────────────────────────────
  status              text        NOT NULL DEFAULT 'draft',
  sent_at             timestamptz NULL,
  viewed_at           timestamptz NULL,
  approved_at         timestamptz NULL,
  lost_at             timestamptz NULL,
  lost_reason         text        NULL,
  valid_until         date        NULL,

  -- ── Pagamentos (parcelas registradas) ─────────────────────────────────
  payments            jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- ── Compartilhamento publico ──────────────────────────────────────────
  share_token         text        NULL,

  -- ── Audit ─────────────────────────────────────────────────────────────
  created_by          uuid        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz NULL,

  -- ── FKs ───────────────────────────────────────────────────────────────
  CONSTRAINT orcamentos_clinic_id_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE,
  CONSTRAINT orcamentos_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL,
  CONSTRAINT orcamentos_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL
);

-- ── 2. CHECK constraints ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orc_status') THEN
    ALTER TABLE public.orcamentos ADD CONSTRAINT chk_orc_status
      CHECK (status = ANY (ARRAY['draft','sent','viewed','followup','negotiation','approved','lost']));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orc_money_positive') THEN
    ALTER TABLE public.orcamentos ADD CONSTRAINT chk_orc_money_positive
      CHECK (subtotal >= 0 AND discount >= 0 AND total >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orc_total_consistency') THEN
    -- total == subtotal - discount (com tolerancia de 0.01 pra rounding)
    ALTER TABLE public.orcamentos ADD CONSTRAINT chk_orc_total_consistency
      CHECK (abs(total - (subtotal - discount)) < 0.01);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orc_subject_xor') THEN
    ALTER TABLE public.orcamentos ADD CONSTRAINT chk_orc_subject_xor
      CHECK ((lead_id IS NOT NULL)::int + (patient_id IS NOT NULL)::int = 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orc_lost_consistency') THEN
    ALTER TABLE public.orcamentos ADD CONSTRAINT chk_orc_lost_consistency
      CHECK (
        status <> 'lost'
        OR (lost_reason IS NOT NULL AND length(trim(lost_reason)) > 0)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orc_items_array') THEN
    ALTER TABLE public.orcamentos ADD CONSTRAINT chk_orc_items_array
      CHECK (jsonb_typeof(items) = 'array');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orc_payments_array') THEN
    ALTER TABLE public.orcamentos ADD CONSTRAINT chk_orc_payments_array
      CHECK (jsonb_typeof(payments) = 'array');
  END IF;
END $$;

-- ── 3. Indexes estrategicos ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orc_clinic_status
  ON public.orcamentos (clinic_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orc_lead
  ON public.orcamentos (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orc_patient
  ON public.orcamentos (patient_id, created_at DESC)
  WHERE patient_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orc_share_token
  ON public.orcamentos (clinic_id, share_token)
  WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orc_open_only
  ON public.orcamentos (clinic_id, status)
  WHERE status NOT IN ('approved','lost') AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orc_followup_due
  ON public.orcamentos (clinic_id, valid_until)
  WHERE status IN ('sent','viewed','followup','negotiation') AND deleted_at IS NULL;

-- ── 4. RLS ENABLED + policies tenant-scoped ─────────────────────────────────
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orcamentos_select ON public.orcamentos;
CREATE POLICY orcamentos_select ON public.orcamentos
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist','viewer'])
  );

DROP POLICY IF EXISTS orcamentos_insert ON public.orcamentos;
CREATE POLICY orcamentos_insert ON public.orcamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist'])
  );

DROP POLICY IF EXISTS orcamentos_update ON public.orcamentos;
CREATE POLICY orcamentos_update ON public.orcamentos
  FOR UPDATE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist'])
  )
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS orcamentos_delete ON public.orcamentos;
CREATE POLICY orcamentos_delete ON public.orcamentos
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── 5. Trigger updated_at ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS orcamentos_updated_at ON public.orcamentos;
CREATE TRIGGER orcamentos_updated_at
  BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. Grants minimos ───────────────────────────────────────────────────────
REVOKE ALL ON public.orcamentos FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos TO authenticated;
GRANT ALL ON public.orcamentos TO service_role;

-- ── 7. Comments ─────────────────────────────────────────────────────────────
COMMENT ON TABLE public.orcamentos IS
  'CRM core · orcamentos clinicos. Subject dual: lead_id OU patient_id. Sem shadow em leads.metadata. Items + payments como jsonb arrays validados.';
COMMENT ON COLUMN public.orcamentos.share_token IS
  'Token publico (32 chars) pra acessar orcamento via /orcamento/<token>. Geracao e leitura via budget_get_by_token() · sem JWT necessario.';
COMMENT ON COLUMN public.orcamentos.items IS
  'Array de items: [{ name, qty, unit_price, subtotal, procedure_code? }]. CHECK garante array; shape eh validado em RPC.';
COMMENT ON COLUMN public.orcamentos.total IS
  'Soma final = subtotal - discount (CHECK chk_orc_total_consistency garante coerencia ate 0.01 de tolerancia).';

NOTIFY pgrst, 'reload schema';

-- ── 8. SANITY CHECK ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rls boolean;
  v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='orcamentos' AND relnamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'sanity: public.orcamentos nao existe';
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname='orcamentos' AND relnamespace='public'::regnamespace;
  IF NOT v_rls THEN RAISE EXCEPTION 'sanity: RLS nao habilitada em orcamentos'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname='public' AND tablename='orcamentos';
  IF v_count < 4 THEN RAISE EXCEPTION 'sanity: orcamentos com % policies, esperado >= 4', v_count; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orcamentos' AND cmd='INSERT' AND with_check IS NULL
  ) THEN
    RAISE EXCEPTION 'sanity: INSERT policy em orcamentos sem WITH CHECK';
  END IF;

  RAISE NOTICE 'mig 20260800000063 · orcamentos OK · % policies', v_count;
END $$;

COMMIT;
