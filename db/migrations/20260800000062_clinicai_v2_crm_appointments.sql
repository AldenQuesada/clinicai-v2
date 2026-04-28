-- ============================================================================
-- Onda 4 · CRM Core · Tabela APPOINTMENTS (canonical schema v2)
-- ============================================================================
--
-- ⚠️ CLEAN-SLATE SCHEMA · ver header de mig 60. Janela ouro: 0 rows hoje
--    em appointments (clinica usa sistema 3rd-party externo). Migracao em
--    prod = drop + create direto, sem backfill.
--
-- Auditoria 2026-04-27 flagou:
--  - 46 colunas no legado (~30% morta/duplicada/PT-BR shadow)
--  - FK appointments.patient_id -> leads(id) (com lead_id como UUID
--    canonical) · viola modelo excludente quando lead vira paciente
--  - 13 triggers · 6 sao acoplamento B2B/Magazine/VPI (a remover)
--  - RLS INSERT com USING=NULL (mesmo bug de leads · vetor cross-tenant)
--  - 0 rows hoje (clinica usa sistema 3rd-party) · janela perfeita pra
--    rebuild canonical sem migracao de dados
--
-- Decisoes desta migration:
--  1. **Subject dual** · `lead_id uuid NULL` + `patient_id uuid NULL`, com
--     CHECK garantindo "exatamente um setado". Quando lead vira paciente,
--     RPC migra a referencia (UPDATE appointments SET lead_id=NULL,
--     patient_id=lead_id WHERE lead_id=...). Modelo excludente preservado
--     COM referential integrity (FKs reais).
--  2. snake_case 100%, sem PT-BR shadow. Eliminadas:
--     `procedimentos jsonb` (campo `procedure_name` cobre · arrays moveram
--      pra `appointment_items` futura), `pagamentos jsonb` (idem,
--      `appointment_payments` futura), `historico_*` jsonb (substituido
--      por audit log central · pode reintroduzir se a UI exigir),
--     `confirmacao_enviada` (deriva de `wa_outbox`),
--     `valor_cortesia/motivo_cortesia/qtd_procs_cortesia` (futuro modulo
--      financeiro), `d1_response*` (deriva de wa_messages).
--     Mantidas que valem ouro:
--     `recurrence_*` (5 colunas · permite series),
--     `consentimento_img` (LGPD compliance gate),
--     `chegada_em`/`cancelado_em`/`no_show_em` (audit timestamps).
--  3. Triggers reduzidas pra 4 essenciais:
--     - `appointments_updated_at` (set_updated_at)
--     - `appointments_normalize_phone` (trg_normalize_patient_phone)
--     - `appointments_phase_sync` (atualiza leads.phase quando appt muda)
--     - `appointments_revert_phase_on_remove` (volta lead.phase=lead se
--        appt foi softdeleted/canceled e nao tem outro ativo)
--     SEM trigger b2b_voucher · SEM magazine_validate · SEM vpi_*.
--     Esses fluxos cross-module DEVEM chamar RPC do CRM (lead_create,
--     lead_to_appointment), nao reagir a triggers.
--  4. RLS canonical · 4 policies tenant-scoped (corrige bug INSERT=NULL).
--  5. value: numeric(10,2) (era numeric sem precisao · audit-N7).
--
-- Dependencias: leads (mig 60), patients (mig 61).

BEGIN;

-- ── 1. Tabela appointments ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            uuid        NOT NULL DEFAULT public._default_clinic_id(),

  -- ── Subject (lead OU patient · modelo excludente forte) ───────────────
  lead_id              uuid        NULL,
  patient_id           uuid        NULL,

  -- Snapshot do nome/phone no momento da criacao (idempotente · nao muda
  -- quando o lead/patient renomeia). Util pra agenda print/relatorio.
  subject_name         text        NOT NULL DEFAULT '',
  subject_phone        text        NULL,

  -- ── Profissional ──────────────────────────────────────────────────────
  professional_id      uuid        NULL,
  professional_name    text        NOT NULL DEFAULT '',
  room_idx             integer     NULL,

  -- ── Tempo ─────────────────────────────────────────────────────────────
  scheduled_date       date        NOT NULL,
  start_time           time        NOT NULL,
  end_time             time        NOT NULL,

  -- ── Procedimento ──────────────────────────────────────────────────────
  procedure_name       text        NOT NULL DEFAULT '',
  consult_type         text        NULL, -- consulta/avaliacao/retorno/procedimento
  eval_type            text        NULL, -- fullface/olheiras/etc

  -- ── Financeiro (canonico simples · arrays vivem em tabelas futuras) ───
  value                numeric(10,2) NOT NULL DEFAULT 0,
  payment_method       text        NULL,
  payment_status       text        NOT NULL DEFAULT 'pendente',

  -- ── Status (state machine canonical · 13 valores ADR-022) ─────────────
  status               text        NOT NULL DEFAULT 'agendado',
  origem               text        NULL, -- whatsapp/manual/lara/api/import

  -- ── Audit timestamps de presenca ──────────────────────────────────────
  chegada_em           timestamptz NULL,
  cancelado_em         timestamptz NULL,
  motivo_cancelamento  text        NULL,
  no_show_em           timestamptz NULL,
  motivo_no_show       text        NULL,

  -- ── LGPD / consentimento ──────────────────────────────────────────────
  consentimento_img    text        NOT NULL DEFAULT 'pendente',

  -- ── Notas livres ──────────────────────────────────────────────────────
  obs                  text        NULL,

  -- ── Recurrence (series) ───────────────────────────────────────────────
  recurrence_group_id  uuid        NULL,
  recurrence_index     integer     NULL,
  recurrence_total     integer     NULL,
  recurrence_procedure text        NULL,
  recurrence_interval_days integer NULL,

  -- ── Timestamps + soft-delete ──────────────────────────────────────────
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,

  -- ── FKs ───────────────────────────────────────────────────────────────
  CONSTRAINT appointments_clinic_id_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE,
  CONSTRAINT appointments_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL,
  CONSTRAINT appointments_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL
);

-- ── 2. CHECK constraints ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_status') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_status
      CHECK (status = ANY (ARRAY[
        'agendado','aguardando_confirmacao','confirmado','pre_consulta',
        'aguardando','na_clinica','em_consulta','em_atendimento',
        'finalizado','remarcado','cancelado','no_show','bloqueado'
      ]));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_payment_status') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_payment_status
      CHECK (payment_status = ANY (ARRAY['pendente','parcial','pago','isento']));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_consentimento_img') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_consentimento_img
      CHECK (consentimento_img = ANY (ARRAY['pendente','assinado','recusado','nao_aplica']));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_subject_xor') THEN
    -- Exatamente UM dos dois precisa estar setado (modelo excludente forte).
    -- bloqueado pode nao ter subject (slot reservado).
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_subject_xor
      CHECK (
        (status = 'bloqueado' AND lead_id IS NULL AND patient_id IS NULL)
        OR
        ((lead_id IS NOT NULL)::int + (patient_id IS NOT NULL)::int = 1)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_time_order') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_time_order
      CHECK (end_time > start_time);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_value_positive') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_value_positive
      CHECK (value >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_recurrence_consistency') THEN
    -- Se tem grupo, precisa ter index e total
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_recurrence_consistency
      CHECK (
        (recurrence_group_id IS NULL AND recurrence_index IS NULL AND recurrence_total IS NULL)
        OR
        (recurrence_group_id IS NOT NULL AND recurrence_index IS NOT NULL AND recurrence_total IS NOT NULL
         AND recurrence_index >= 1 AND recurrence_index <= recurrence_total)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_cancelled_consistency') THEN
    -- Se status=cancelado, motivo_cancelamento precisa estar setado
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_cancelled_consistency
      CHECK (
        status <> 'cancelado'
        OR (motivo_cancelamento IS NOT NULL AND length(trim(motivo_cancelamento)) > 0)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_appt_noshow_consistency') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_noshow_consistency
      CHECK (
        status <> 'no_show'
        OR (motivo_no_show IS NOT NULL AND length(trim(motivo_no_show)) > 0)
      );
  END IF;
END $$;

-- ── 3. Indexes estrategicos ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appt_clinic_date
  ON public.appointments (clinic_id, scheduled_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appt_professional_date
  ON public.appointments (clinic_id, professional_id, scheduled_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appt_status
  ON public.appointments (clinic_id, status, scheduled_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appt_lead_id
  ON public.appointments (lead_id)
  WHERE lead_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appt_patient_id
  ON public.appointments (patient_id)
  WHERE patient_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_appt_recurrence_group
  ON public.appointments (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appt_pending_confirmation
  ON public.appointments (clinic_id, scheduled_date)
  WHERE status = ANY (ARRAY['agendado','aguardando_confirmacao']) AND deleted_at IS NULL;

-- ── 4. RLS ENABLED + policies tenant-scoped ─────────────────────────────────
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- SELECT respeita agenda_visibility se a tabela existir; fallback role-based
DROP POLICY IF EXISTS appointments_select ON public.appointments;
CREATE POLICY appointments_select ON public.appointments
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist','viewer'])
    AND (
      public.app_role() = ANY (ARRAY['owner','admin','receptionist'])
      OR professional_id = auth.uid()
      OR professional_id IS NULL
    )
  );

DROP POLICY IF EXISTS appointments_insert ON public.appointments;
CREATE POLICY appointments_insert ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist'])
  );

DROP POLICY IF EXISTS appointments_update ON public.appointments;
CREATE POLICY appointments_update ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() = ANY (ARRAY['owner','admin','receptionist'])
      OR professional_id = auth.uid()
    )
  )
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appointments_delete ON public.appointments;
CREATE POLICY appointments_delete ON public.appointments
  FOR DELETE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() = ANY (ARRAY['owner','admin','receptionist'])
      OR professional_id = auth.uid()
    )
  );

-- ── 5. Triggers ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS appointments_normalize_phone ON public.appointments;
CREATE TRIGGER appointments_normalize_phone
  BEFORE INSERT OR UPDATE OF subject_phone ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_patient_phone();

-- (triggers de phase sync vivem na mig 65, depois das RPCs)

-- ── 6. Grants minimos ───────────────────────────────────────────────────────
REVOKE ALL ON public.appointments FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;

-- ── 7. Comments ─────────────────────────────────────────────────────────────
COMMENT ON TABLE public.appointments IS
  'CRM core · agendamentos. Subject dual: lead_id OU patient_id (CHECK chk_appt_subject_xor garante exatamente um · exceto status=bloqueado). Sem triggers cross-module · B2B/VPI/Magazine integram via RPC.';
COMMENT ON COLUMN public.appointments.lead_id IS
  'FK pra leads.id quando o subject ainda esta no funil de captacao. Migrado pra patient_id quando lead_to_paciente() roda.';
COMMENT ON COLUMN public.appointments.patient_id IS
  'FK pra patients.id quando subject ja eh paciente recorrente. Sempre que possivel preferir esta coluna em queries pos-conversao.';
COMMENT ON COLUMN public.appointments.subject_name IS
  'Snapshot do nome no momento da criacao. Imutavel mesmo se lead/patient renomear (audit/print).';
COMMENT ON COLUMN public.appointments.status IS
  'State machine: agendado → aguardando_confirmacao → confirmado → pre_consulta → aguardando → na_clinica → em_consulta → em_atendimento → finalizado. Paralelos: remarcado, cancelado, no_show, bloqueado.';

NOTIFY pgrst, 'reload schema';

-- ── 8. SANITY CHECK ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rls boolean;
  v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='appointments' AND relnamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'sanity: public.appointments nao existe';
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname='appointments' AND relnamespace='public'::regnamespace;
  IF NOT v_rls THEN RAISE EXCEPTION 'sanity: RLS nao habilitada em appointments'; END IF;

  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname='public' AND tablename='appointments';
  IF v_count < 4 THEN RAISE EXCEPTION 'sanity: appointments com % policies, esperado >= 4', v_count; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='appointments' AND cmd='INSERT' AND with_check IS NULL
  ) THEN
    RAISE EXCEPTION 'sanity: INSERT policy em appointments sem WITH CHECK';
  END IF;

  -- Subject XOR check existe
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_appt_subject_xor') THEN
    RAISE EXCEPTION 'sanity: chk_appt_subject_xor nao existe (modelo excludente quebrado)';
  END IF;

  RAISE NOTICE 'mig 20260800000062 · appointments OK · % policies', v_count;
END $$;

COMMIT;
