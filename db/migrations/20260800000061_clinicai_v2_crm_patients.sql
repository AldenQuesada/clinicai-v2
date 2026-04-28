-- ============================================================================
-- Onda 4 · CRM Core · Tabela PATIENTS (canonical schema v2)
-- ============================================================================
--
-- ⚠️ CLEAN-SLATE SCHEMA · ver header de mig 60 pro procedimento de migracao
--    de prod (renomear legacy, aplicar, copiar). Hoje patients tem 21 colunas
--    + apenas 3 rows · janela de migracao tranquila.
--
-- Auditoria 2026-04-27 flagou:
--  - Dual identity: `tenantId text` (legacy Prisma) + `clinic_id uuid` (novo)
--    convivendo · NUNCA reconciliados · alguns RLS usam tenantId, outros
--    clinic_id. Vetor de cross-tenant.
--  - Naming camelCase (`tenantId`, `totalProcedures`, `firstProcedureAt`)
--    tornou queries Postgrest dolorosas (precisa de `"tenantId"` quoted).
--  - Coluna `lead_id` (mig original) usada como UUID compartilhado com leads
--    (modelo excludente ADR-001) · mas sem CHECK garantindo `id = lead_id`.
--
-- Decisoes desta migration:
--  1. UUID compartilhado: `id = lead_id` (mesmo UUID que veio de leads).
--     Renomeado: `lead_id` -> `id` mesmo (lead_id deixa de ser coluna
--     separada; usamos a chave primaria).
--  2. snake_case 100% (drop "tenantId", "totalProcedures", etc).
--  3. `clinic_id` UUID FK pra clinics (sem `tenantId text`).
--  4. RLS canonical · 4 policies tenant-scoped (corrige bug INSERT=NULL
--     do legado).
--  5. Sem `tenants` table reference (legacy Prisma · v2 nao precisa).
--  6. Modelo excludente FORTE: appointments.patient_id FK -> patients.id
--     (mig 62), NAO mais leads.id como no legado. Quando lead vira paciente,
--     INSERT em patients usando o MESMO uuid · soft-delete em leads · FKs
--     novas em appointments apontam pra patients direto.
--
-- ADR-029 RLS strategy aplicado · GOLD-STANDARD §SQL.

BEGIN;

-- ── 1. Tabela patients ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patients (
  id                  uuid        PRIMARY KEY,
  -- ^ Sem DEFAULT gen_random_uuid · DEVE vir de leads.id (modelo excludente).
  --   RPC lead_to_paciente preserva o UUID original. Hard-insert manual exige
  --   informar id explicitamente (pra forcar disciplina · FK em appointments).

  clinic_id           uuid        NOT NULL DEFAULT public._default_clinic_id(),

  -- ── Identidade ────────────────────────────────────────────────────────
  name                text        NOT NULL,
  phone               text        NOT NULL,
  email               text        NULL,
  cpf                 text        NULL,
  rg                  text        NULL,
  birth_date          date        NULL,
  sex                 text        NULL,

  -- ── Endereco ──────────────────────────────────────────────────────────
  address_json        jsonb       NULL,

  -- ── Status / atribuicao ───────────────────────────────────────────────
  status              text        NOT NULL DEFAULT 'active',
  assigned_to         uuid        NULL,
  notes               text        NULL,

  -- ── Agregados de procedimentos (mantidos pra LTV/relatorios rapidos) ──
  total_procedures    integer     NOT NULL DEFAULT 0,
  total_revenue       numeric(12,2) NOT NULL DEFAULT 0,
  first_procedure_at  timestamptz NULL,
  last_procedure_at   timestamptz NULL,

  -- ── Origem (rastreabilidade pos-conversao) ────────────────────────────
  source_lead_phase_at timestamptz NULL, -- quando saiu de leads.phase=compareceu
  source_lead_meta    jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- ── Timestamps + soft-delete ──────────────────────────────────────────
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz NULL,

  -- ── FK ────────────────────────────────────────────────────────────────
  CONSTRAINT patients_clinic_id_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE
);

-- ── 2. CHECK constraints ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_patients_status') THEN
    ALTER TABLE public.patients ADD CONSTRAINT chk_patients_status
      CHECK (status = ANY (ARRAY['active','inactive','blocked','deceased']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_patients_sex') THEN
    ALTER TABLE public.patients ADD CONSTRAINT chk_patients_sex
      CHECK (sex IS NULL OR sex = ANY (ARRAY['F','M','O','N']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_patients_revenue_positive') THEN
    ALTER TABLE public.patients ADD CONSTRAINT chk_patients_revenue_positive
      CHECK (total_revenue >= 0 AND total_procedures >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_patients_cpf_format') THEN
    ALTER TABLE public.patients ADD CONSTRAINT chk_patients_cpf_format
      CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');
  END IF;
END $$;

-- ── 3. Indexes estrategicos ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_patients_clinic_status
  ON public.patients (clinic_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_clinic_updated
  ON public.patients (clinic_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_assigned_to
  ON public.patients (assigned_to)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_phone_clinic
  ON public.patients (clinic_id, phone)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_cpf_clinic_unique
  ON public.patients (clinic_id, cpf)
  WHERE deleted_at IS NULL AND cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_last_procedure
  ON public.patients (clinic_id, last_procedure_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- ── 4. RLS ENABLED + policies tenant-scoped ─────────────────────────────────
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_select ON public.patients;
CREATE POLICY patients_select ON public.patients
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND (
      public.app_role() = ANY (ARRAY['owner','admin','receptionist','viewer'])
      OR assigned_to = auth.uid()
      OR assigned_to IS NULL
    )
  );

DROP POLICY IF EXISTS patients_insert ON public.patients;
CREATE POLICY patients_insert ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist'])
  );

DROP POLICY IF EXISTS patients_update ON public.patients;
CREATE POLICY patients_update ON public.patients
  FOR UPDATE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() = ANY (ARRAY['owner','admin','receptionist'])
      OR (public.app_role() = 'therapist' AND assigned_to = auth.uid())
    )
  )
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS patients_delete ON public.patients;
CREATE POLICY patients_delete ON public.patients
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── 5. Trigger updated_at ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS patients_updated_at ON public.patients;
CREATE TRIGGER patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 6. Trigger normalizacao de phone (compartilha trg_normalize_phone) ──────
DROP TRIGGER IF EXISTS patients_normalize_phone ON public.patients;
CREATE TRIGGER patients_normalize_phone
  BEFORE INSERT OR UPDATE OF phone ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_phone();

-- ── 7. Grants minimos ───────────────────────────────────────────────────────
REVOKE ALL ON public.patients FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;

-- ── 8. Comments ─────────────────────────────────────────────────────────────
COMMENT ON TABLE public.patients IS
  'CRM core · pacientes ativos. UUID = leads.id original (modelo excludente ADR-001). Linha aqui implica leads.deleted_at IS NOT NULL (sem overlap). FK appointments.patient_id aponta aqui (NAO em leads).';
COMMENT ON COLUMN public.patients.id IS
  'UUID compartilhado com leads.id (modelo excludente). Setado por public.lead_to_paciente() · NUNCA gen_random_uuid().';
COMMENT ON COLUMN public.patients.source_lead_phase_at IS
  'Timestamp de quando o lead transicionou pra phase=compareceu (pos-consulta). Util pra time-to-conversion analytics.';
COMMENT ON COLUMN public.patients.source_lead_meta IS
  'Snapshot do lead.metadata + lead.source/funnel no momento da conversao. Nao alterar depois (audit imutavel).';
COMMENT ON COLUMN public.patients.total_revenue IS
  'Agregado denormalizado de appointments finalizados. Atualizado por public.appointment_finalize() ou manualmente. Verdade canonica continua em appointments.';

NOTIFY pgrst, 'reload schema';

-- ── 9. SANITY CHECK ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rls boolean;
  v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'patients' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'sanity: public.patients nao existe';
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname = 'patients' AND relnamespace = 'public'::regnamespace;
  IF NOT v_rls THEN RAISE EXCEPTION 'sanity: RLS nao habilitada em public.patients'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname = 'public' AND tablename = 'patients';
  IF v_count < 4 THEN RAISE EXCEPTION 'sanity: public.patients tem % policies, esperado >= 4', v_count; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='patients' AND cmd='INSERT' AND with_check IS NULL
  ) THEN
    RAISE EXCEPTION 'sanity: INSERT policy em patients sem WITH CHECK';
  END IF;

  -- DEFAULT em id deve ser NULL (nao pode auto-gerar · UUID vem de leads)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='patients' AND column_name='id'
       AND column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'sanity: patients.id tem DEFAULT (deveria vir de leads.id, sem auto-gen)';
  END IF;

  RAISE NOTICE 'mig 20260800000061 · patients OK · % policies', v_count;
END $$;

COMMIT;
