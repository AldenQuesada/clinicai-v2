-- =============================================================================
-- CRM_PARITY_R2 · Migration 193 · appointment_procedure_items
-- =============================================================================
--
-- Propósito: criar tabela `appointment_procedure_items` para suportar múltiplos
-- procedimentos por agendamento (paridade com legacy `_apptProcs[]` array).
-- Cada item carrega: nome/quantity/preço/desconto/cortesia/retorno (paridade
-- 1:1 com legacy).
--
-- Contexto:
--   - Legacy `clinic-dashboard/js/agenda-modal.js` mantém `_apptProcs[]` array
--     em memória + serializa em `appt.procedimentos`. v2 atualmente só tem
--     `appointments.procedure_id` + `procedure_name` (single).
--   - Para R2, criamos tabela relacional dedicada. `appointments.procedure_id`
--     + `procedure_name` PRESERVADOS como snapshot do primeiro item (compat
--     dual-write durante deprecation).
--
-- Backward compatibility:
--   - Appointments existentes (single procedure) continuam funcionando. NewAppointmentForm
--     em "modo simples" (1 procedimento) preenche tanto os campos legacy
--     quanto a tabela items (1 row).
--   - Backfill `appointments.procedure_name → appointment_procedure_items` fica
--     para Round 5 (parity-r5-backfills).
--
-- Constraints (matching legacy validation rules):
--   - quantity > 0
--   - unit_price/gross/discount/net >= 0
--   - net = gross - discount (tolerance 0.01 rounding)
--   - discount <= gross
--   - if is_courtesy → net_amount = 0
--   - if is_courtesy → courtesy_reason length >= 3 chars
--   - if is_return → return_interval_days > 0
--   - procedure_name length >= 2
--
-- RLS multi-tenant (padrão mig 63 orcamentos):
--   - SELECT/INSERT/UPDATE para clinic_id = app_clinic_id()
--   - DELETE só para owner/admin (via is_admin())
--
-- O que esta migration NÃO toca:
--   - `appointments.procedure_id` / `procedure_name` (preservados como snapshot)
--   - `appointments.value` agregado (será mantido + derivado da soma de items)
--   - `appointment_finalize` (mig 151)
--   - hard gate clínico (mig 167)
--   - `appointment_payments` (mig 194 separada)
--   - cron / worker 71 / wa_outbox / edge functions / env
--
-- Apply: somente após GO explícito (CRM_PARITY_R2_PHASE_D_APPLY_*).
-- Rollback: down migration drop table.
--
-- Validation SQL (rodar após apply):
--   1. SELECT to_regclass('public.appointment_procedure_items');
--      → deve retornar não-NULL
--   2. SELECT count(*) FROM information_schema.table_constraints
--      WHERE table_schema='public'
--        AND table_name='appointment_procedure_items'
--        AND constraint_type='CHECK';
--      → deve ser 7 (todos os CHECKs criados)
--   3. SELECT polname FROM pg_policies
--      WHERE schemaname='public' AND tablename='appointment_procedure_items';
--      → deve listar 4 policies (select/insert/update/delete)
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.appointment_procedure_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            uuid NOT NULL,
  appointment_id       uuid NOT NULL REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE CASCADE,
  procedure_id         uuid NULL REFERENCES public.clinic_procedimentos(id) ON UPDATE CASCADE ON DELETE SET NULL,
  procedure_name       text NOT NULL,
  quantity             numeric(10,2) NOT NULL DEFAULT 1,
  unit_price           numeric(12,2) NOT NULL DEFAULT 0,
  gross_amount         numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount      numeric(12,2) NOT NULL DEFAULT 0,
  net_amount           numeric(12,2) NOT NULL DEFAULT 0,
  is_courtesy          boolean NOT NULL DEFAULT false,
  courtesy_reason      text NULL,
  is_return            boolean NOT NULL DEFAULT false,
  return_interval_days integer NULL,
  sort_order           integer NOT NULL DEFAULT 0,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL
);

-- ── CHECK constraints (paridade 1:1 com validação legacy) ────────────────────

ALTER TABLE public.appointment_procedure_items
  DROP CONSTRAINT IF EXISTS chk_appt_proc_item_quantity_positive;
ALTER TABLE public.appointment_procedure_items
  ADD CONSTRAINT chk_appt_proc_item_quantity_positive
  CHECK (quantity > 0);

ALTER TABLE public.appointment_procedure_items
  DROP CONSTRAINT IF EXISTS chk_appt_proc_item_amounts_non_negative;
ALTER TABLE public.appointment_procedure_items
  ADD CONSTRAINT chk_appt_proc_item_amounts_non_negative
  CHECK (unit_price >= 0 AND gross_amount >= 0 AND discount_amount >= 0 AND net_amount >= 0);

ALTER TABLE public.appointment_procedure_items
  DROP CONSTRAINT IF EXISTS chk_appt_proc_item_net_consistency;
ALTER TABLE public.appointment_procedure_items
  ADD CONSTRAINT chk_appt_proc_item_net_consistency
  CHECK (abs(net_amount - (gross_amount - discount_amount)) < 0.01);

ALTER TABLE public.appointment_procedure_items
  DROP CONSTRAINT IF EXISTS chk_appt_proc_item_discount_le_gross;
ALTER TABLE public.appointment_procedure_items
  ADD CONSTRAINT chk_appt_proc_item_discount_le_gross
  CHECK (discount_amount <= gross_amount + 0.01);

ALTER TABLE public.appointment_procedure_items
  DROP CONSTRAINT IF EXISTS chk_appt_proc_item_courtesy_zero;
ALTER TABLE public.appointment_procedure_items
  ADD CONSTRAINT chk_appt_proc_item_courtesy_zero
  CHECK ((NOT is_courtesy) OR (net_amount = 0));

ALTER TABLE public.appointment_procedure_items
  DROP CONSTRAINT IF EXISTS chk_appt_proc_item_courtesy_reason;
ALTER TABLE public.appointment_procedure_items
  ADD CONSTRAINT chk_appt_proc_item_courtesy_reason
  CHECK ((NOT is_courtesy) OR (courtesy_reason IS NOT NULL AND length(trim(courtesy_reason)) >= 3));

ALTER TABLE public.appointment_procedure_items
  DROP CONSTRAINT IF EXISTS chk_appt_proc_item_return_interval;
ALTER TABLE public.appointment_procedure_items
  ADD CONSTRAINT chk_appt_proc_item_return_interval
  CHECK ((NOT is_return) OR (return_interval_days IS NOT NULL AND return_interval_days > 0));

ALTER TABLE public.appointment_procedure_items
  DROP CONSTRAINT IF EXISTS chk_appt_proc_item_procedure_name_length;
ALTER TABLE public.appointment_procedure_items
  ADD CONSTRAINT chk_appt_proc_item_procedure_name_length
  CHECK (length(trim(procedure_name)) >= 2);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_appt_proc_items_clinic
  ON public.appointment_procedure_items (clinic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_proc_items_appointment
  ON public.appointment_procedure_items (appointment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_proc_items_appointment_sort
  ON public.appointment_procedure_items (appointment_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_proc_items_procedure
  ON public.appointment_procedure_items (procedure_id)
  WHERE procedure_id IS NOT NULL AND deleted_at IS NULL;

-- ── RLS · padrão mig 63 orcamentos ───────────────────────────────────────────

ALTER TABLE public.appointment_procedure_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appt_proc_items_select ON public.appointment_procedure_items;
CREATE POLICY appt_proc_items_select ON public.appointment_procedure_items
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_proc_items_insert ON public.appointment_procedure_items;
CREATE POLICY appt_proc_items_insert ON public.appointment_procedure_items
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_proc_items_update ON public.appointment_procedure_items;
CREATE POLICY appt_proc_items_update ON public.appointment_procedure_items
  FOR UPDATE TO authenticated
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_proc_items_delete ON public.appointment_procedure_items;
CREATE POLICY appt_proc_items_delete ON public.appointment_procedure_items
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── GRANTs · padrão mig 63 ───────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_procedure_items TO authenticated;
GRANT ALL ON public.appointment_procedure_items TO service_role;

-- ── updated_at trigger (reusa função padrão se existir) ──────────────────────

DROP TRIGGER IF EXISTS appointment_procedure_items_updated_at ON public.appointment_procedure_items;
CREATE TRIGGER appointment_procedure_items_updated_at
  BEFORE UPDATE ON public.appointment_procedure_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.appointment_procedure_items IS
  'CRM_PARITY_R2 · linhas de procedimentos por agendamento (paridade com legacy _apptProcs[]). Single procedure preserva appointments.procedure_id/name como snapshot. Multi-procedure usa esta tabela exclusivamente.';

COMMENT ON COLUMN public.appointment_procedure_items.is_courtesy IS
  'Quando true: net_amount=0 e courtesy_reason obrigatório (>= 3 chars). Não confundir com payment_status=cortesia (que é appointment-level).';

COMMENT ON COLUMN public.appointment_procedure_items.is_return IS
  'Quando true: return_interval_days obrigatório (>0). Sinaliza que este item é um retorno (revisão pós-procedimento), não primeira sessão.';

COMMENT ON COLUMN public.appointment_procedure_items.metadata IS
  'jsonb livre · usado para campos opcionais (fases jsonb · partner pricing snapshot · combo bonus · etc).';

COMMIT;

-- =============================================================================
-- END OF MIGRATION 193
-- =============================================================================
