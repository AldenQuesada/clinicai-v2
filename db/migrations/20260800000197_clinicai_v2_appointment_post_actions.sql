-- =============================================================================
-- CRM_PARITY_R3 · Migration 197 · appointment_post_actions
-- =============================================================================
--
-- Propósito: fila/registro interno de pós-ações disparadas no finalize de um
-- agendamento. Paridade com legacy `clinic_op_queue` + `clinic_op_tasks`
-- (localStorage no clinic-dashboard) sem efeito externo.
--
-- Action types (whitelist):
--   - google_review     · agendamento de pedido de avaliação Google D+3
--   - vpi_indication    · sinaliza paciente p/ revisão programa embaixadora
--   - retouch_reminder  · follow-up de retoque baseado em
--                         appointment_procedure_items.return_interval_days
--   - complaint_logged  · staff registrou queixa · precisa follow-up
--   - payment_followup  · saldo pendente · secretaria liga depois
--
-- Status (enum):
--   - pending    · default · aguardando execução manual pela staff
--   - done       · executada (registrada como concluída pela staff)
--   - dismissed  · staff optou explicitamente por pular
--   - cancelled  · paciente recusou · não foi enviada
--
-- Princípios:
--   - ZERO worker automático nessa migration · staff dispatcha manualmente
--   - ZERO provider externo · ZERO WhatsApp send · ZERO cron novo
--   - Internal queue only · semantically isolado do `wa_outbox`
--   - schedule_at é informativo (quando o staff deve agir) · NÃO dispara nada
--
-- Backward compatibility:
--   - Não toca appointment_finalize (mig 167) · hard gate clínico intocado
--   - Não toca leads.phase / lifecycle / appointment.status canon
--   - appointment_finalize continua valid · esta migration adiciona
--     captura pós-execução opcional via action wiring no Prompt 2 (R3
--     Prompt 1 só monta a tabela · wiring fica no patch local)
--
-- RLS multi-tenant (padrão mig 63 orcamentos):
--   - SELECT/INSERT/UPDATE para clinic_id = app_clinic_id()
--   - DELETE só admin via is_admin()
--   - Zero anon (canon v2 · ver lição mig 196)
--
-- Apply: somente após GO explícito (R3 Prompt 2).
-- Rollback: down migration drop table CASCADE.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.appointment_post_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id)
                       ON UPDATE CASCADE ON DELETE CASCADE,
  -- ── action_type · whitelist 5 valores canon ─────────────────────────────
  action_type     text NOT NULL,
  -- ── status · ciclo de vida da ação ─────────────────────────────────────
  status          text NOT NULL DEFAULT 'pending',
  -- ── quando o staff deveria executar (informativo) ───────────────────────
  schedule_at     timestamptz NULL,
  -- ── execução / dismissal manual ─────────────────────────────────────────
  executed_at     timestamptz NULL,
  dismissed_at    timestamptz NULL,
  dismissed_reason text NULL,
  -- ── payload livre · vincula a procedure_item, payment_id, etc. ──────────
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- ── notes livres (staff) ────────────────────────────────────────────────
  notes           text NULL,
  -- ── audit ───────────────────────────────────────────────────────────────
  created_by      uuid NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL
);

-- ── CHECK constraints ────────────────────────────────────────────────────────

ALTER TABLE public.appointment_post_actions
  DROP CONSTRAINT IF EXISTS chk_appt_post_action_type_whitelist;
ALTER TABLE public.appointment_post_actions
  ADD CONSTRAINT chk_appt_post_action_type_whitelist
  CHECK (action_type IN (
    'google_review',
    'vpi_indication',
    'retouch_reminder',
    'complaint_logged',
    'payment_followup'
  ));

ALTER TABLE public.appointment_post_actions
  DROP CONSTRAINT IF EXISTS chk_appt_post_action_status_enum;
ALTER TABLE public.appointment_post_actions
  ADD CONSTRAINT chk_appt_post_action_status_enum
  CHECK (status IN ('pending', 'done', 'dismissed', 'cancelled'));

-- consistency: executed_at requer status='done', dismissed_at requer status='dismissed'
ALTER TABLE public.appointment_post_actions
  DROP CONSTRAINT IF EXISTS chk_appt_post_action_executed_consistency;
ALTER TABLE public.appointment_post_actions
  ADD CONSTRAINT chk_appt_post_action_executed_consistency
  CHECK (
    (executed_at IS NULL OR status = 'done')
    AND (dismissed_at IS NULL OR status = 'dismissed')
  );

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_appt_post_actions_clinic
  ON public.appointment_post_actions (clinic_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_post_actions_appointment
  ON public.appointment_post_actions (appointment_id)
  WHERE deleted_at IS NULL;

-- Working queue: pending actions sorted by schedule_at (staff dashboard)
CREATE INDEX IF NOT EXISTS idx_appt_post_actions_pending_schedule
  ON public.appointment_post_actions (clinic_id, schedule_at)
  WHERE status = 'pending' AND deleted_at IS NULL;

-- Per-action-type browse
CREATE INDEX IF NOT EXISTS idx_appt_post_actions_type_status
  ON public.appointment_post_actions (clinic_id, action_type, status)
  WHERE deleted_at IS NULL;

-- ── RLS · padrão mig 63 orcamentos ───────────────────────────────────────────

ALTER TABLE public.appointment_post_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appt_post_actions_select ON public.appointment_post_actions;
CREATE POLICY appt_post_actions_select ON public.appointment_post_actions
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_post_actions_insert ON public.appointment_post_actions;
CREATE POLICY appt_post_actions_insert ON public.appointment_post_actions
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_post_actions_update ON public.appointment_post_actions;
CREATE POLICY appt_post_actions_update ON public.appointment_post_actions
  FOR UPDATE TO authenticated
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_post_actions_delete ON public.appointment_post_actions;
CREATE POLICY appt_post_actions_delete ON public.appointment_post_actions
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── GRANTs · canon v2 ────────────────────────────────────────────────────────
--
-- REVOKE anon antes do GRANT para defesa em profundidade · Supabase default
-- ACL no schema public adiciona anon automaticamente em objetos novos
-- (mesmo lição da mig 196 financial_summary).

REVOKE ALL ON public.appointment_post_actions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_post_actions TO authenticated;
GRANT ALL ON public.appointment_post_actions TO service_role;

-- ── updated_at trigger ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS appointment_post_actions_updated_at
  ON public.appointment_post_actions;
CREATE TRIGGER appointment_post_actions_updated_at
  BEFORE UPDATE ON public.appointment_post_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.appointment_post_actions IS
  'CRM_PARITY_R3 · fila interna de pós-ações no finalize. Action types: google_review/vpi_indication/retouch_reminder/complaint_logged/payment_followup. ZERO worker automático · staff dispatcha manualmente · ZERO provider externo.';

COMMENT ON COLUMN public.appointment_post_actions.schedule_at IS
  'Quando o staff deveria agir (D+3 para review, D+interval para retouch). Informativo · NÃO dispara nada automaticamente.';

COMMENT ON COLUMN public.appointment_post_actions.payload IS
  'jsonb livre · vincula a procedure_item_id, payment_id, message_template, etc. dependendo do action_type.';

COMMIT;

-- =============================================================================
-- END OF MIGRATION 197
-- =============================================================================
