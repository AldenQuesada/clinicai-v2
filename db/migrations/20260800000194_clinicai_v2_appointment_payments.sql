-- =============================================================================
-- CRM_PARITY_R2 · Migration 194 · appointment_payments
-- =============================================================================
--
-- Propósito: criar tabela `appointment_payments` para suportar múltiplos
-- pagamentos por agendamento (paridade com legacy `_apptPagamentos[]` array
-- + 10 formas canônicas).
--
-- Contexto:
--   - Legacy permite agendamento com múltiplas linhas de pagamento (ex:
--     entrada PIX + saldo boleto · ou crédito parcelado + dinheiro).
--   - v2 atualmente só tem `appointments.payment_method` text + `payment_status`
--     enum agregado (single).
--   - Mig 194 criar tabela relacional · `appointments.payment_method/status`
--     PRESERVADOS como snapshot/agregado.
--
-- Backward compatibility:
--   - Single payment continua funcionando (1 row em appointment_payments).
--   - `appointments.payment_method` recebe valor do primeiro pagamento (ou
--     "multi" como label quando mais de 1 row).
--   - `appointments.payment_status` agregado pode ser derivado via view
--     `appointment_financial_summary` (mig 195).
--
-- Payment methods whitelist (paridade com PAYMENT_METHOD_OPTIONS UI):
--   pix, dinheiro, debito, credito, parcelado, entrada_saldo, boleto, link,
--   cortesia, convenio
--
-- Constraints:
--   - amount > 0
--   - installments null OR installments > 0
--   - status in (pendente, pago, cancelado)
--   - payment_method whitelist 10 valores
--   - status='pago' → paid_at NÃO obrigatório (legacy aceita pago sem timestamp
--     em alguns flows · pode ser preenchido depois) · UI pode exigir
--
-- RLS multi-tenant (padrão mig 63):
--   - SELECT/INSERT/UPDATE para clinic_id = app_clinic_id()
--   - DELETE só para owner/admin (via is_admin())
--
-- O que esta migration NÃO toca:
--   - `appointments.payment_method` / `payment_status` (preservados como agregado)
--   - mig 152 chk_appt_payment_status (cortesia/isento appointment-level
--     preservado · ortogonal ao multi-pay)
--   - `appointment_finalize` (mig 151)
--   - hard gate clínico (mig 167)
--   - `appointment_procedure_items` (mig 193 separada)
--   - cron / worker 71 / wa_outbox / edge / env
--
-- Apply: somente após GO explícito.
-- Rollback: down migration drop table.
--
-- Validation SQL (rodar após apply):
--   1. SELECT to_regclass('public.appointment_payments');
--   2. SELECT count(*) FROM information_schema.table_constraints
--      WHERE table_schema='public'
--        AND table_name='appointment_payments'
--        AND constraint_type='CHECK';
--      → deve ser 4
--   3. SELECT polname FROM pg_policies
--      WHERE schemaname='public' AND tablename='appointment_payments';
--      → deve listar 4 policies
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.appointment_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL,
  appointment_id      uuid NOT NULL REFERENCES public.appointments(id) ON UPDATE CASCADE ON DELETE CASCADE,
  payment_method      text NOT NULL,
  amount              numeric(12,2) NOT NULL,
  installments        integer NULL,
  due_date            date NULL,
  paid_at             timestamptz NULL,
  status              text NOT NULL DEFAULT 'pendente',
  notes               text NULL,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz NULL
);

-- ── CHECK constraints ────────────────────────────────────────────────────────

ALTER TABLE public.appointment_payments
  DROP CONSTRAINT IF EXISTS chk_appt_payment_amount_positive;
ALTER TABLE public.appointment_payments
  ADD CONSTRAINT chk_appt_payment_amount_positive
  CHECK (amount > 0);

ALTER TABLE public.appointment_payments
  DROP CONSTRAINT IF EXISTS chk_appt_payment_installments_positive;
ALTER TABLE public.appointment_payments
  ADD CONSTRAINT chk_appt_payment_installments_positive
  CHECK (installments IS NULL OR installments > 0);

ALTER TABLE public.appointment_payments
  DROP CONSTRAINT IF EXISTS chk_appt_payment_status_enum;
ALTER TABLE public.appointment_payments
  ADD CONSTRAINT chk_appt_payment_status_enum
  CHECK (status IN ('pendente', 'pago', 'cancelado'));

ALTER TABLE public.appointment_payments
  DROP CONSTRAINT IF EXISTS chk_appt_payment_method_whitelist;
ALTER TABLE public.appointment_payments
  ADD CONSTRAINT chk_appt_payment_method_whitelist
  CHECK (payment_method IN (
    'pix', 'dinheiro', 'debito', 'credito', 'parcelado',
    'entrada_saldo', 'boleto', 'link', 'cortesia', 'convenio'
  ));

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_appt_payments_clinic
  ON public.appointment_payments (clinic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_payments_appointment
  ON public.appointment_payments (appointment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_payments_status_pending
  ON public.appointment_payments (clinic_id, status)
  WHERE status = 'pendente' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_payments_due_date
  ON public.appointment_payments (clinic_id, due_date)
  WHERE due_date IS NOT NULL AND deleted_at IS NULL;

-- ── RLS · padrão mig 63 ──────────────────────────────────────────────────────

ALTER TABLE public.appointment_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appt_payments_select ON public.appointment_payments;
CREATE POLICY appt_payments_select ON public.appointment_payments
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_payments_insert ON public.appointment_payments;
CREATE POLICY appt_payments_insert ON public.appointment_payments
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_payments_update ON public.appointment_payments;
CREATE POLICY appt_payments_update ON public.appointment_payments
  FOR UPDATE TO authenticated
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_payments_delete ON public.appointment_payments;
CREATE POLICY appt_payments_delete ON public.appointment_payments
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── GRANTs ──────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_payments TO authenticated;
GRANT ALL ON public.appointment_payments TO service_role;

-- ── updated_at trigger ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS appointment_payments_updated_at ON public.appointment_payments;
CREATE TRIGGER appointment_payments_updated_at
  BEFORE UPDATE ON public.appointment_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.appointment_payments IS
  'CRM_PARITY_R2 · linhas de pagamento por agendamento (paridade com legacy _apptPagamentos[] + 10 formas canônicas). Single payment preserva appointments.payment_method/status como snapshot. Multi-payment usa esta tabela.';

COMMENT ON COLUMN public.appointment_payments.payment_method IS
  'Whitelist 10 formas: pix/dinheiro/debito/credito/parcelado/entrada_saldo/boleto/link/cortesia/convenio (paridade UI PAYMENT_METHOD_OPTIONS).';

COMMENT ON COLUMN public.appointment_payments.installments IS
  'Número de parcelas (NULL ou >0). Aplicável a crédito/parcelado/boleto/entrada_saldo.';

COMMENT ON COLUMN public.appointment_payments.metadata IS
  'jsonb livre · campos opcionais por método (convenio_nome, convenio_auth, link_url, troco_recebido, etc).';

COMMIT;

-- =============================================================================
-- END OF MIGRATION 194
-- =============================================================================
