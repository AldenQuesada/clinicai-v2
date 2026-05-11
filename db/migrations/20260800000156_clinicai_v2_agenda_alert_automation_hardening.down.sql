-- ============================================================================
-- Migration 156 · DOWN · NO-OP defensivo
-- ============================================================================
--
-- Forward-only. Rollback DEVE ser feito via FORWARD migration nova.
--
-- Por que NO-OP:
--   - Restaurar bug `l.appt_id = a.id` (sem cast) reintroduziria a
--     comparação uuid/text inconsistente.
--   - Restaurar `p_appt.patient_id` em `wa_outbox.lead_id` quebraria
--     NOT NULL quando appt for lead-only.
--   - Dropar a unique `agenda_alerts_log_appt_id_alert_kind_key` retira
--     a base do ON CONFLICT no `_enqueue_agenda_alert` (idempotência).
--
-- Rollback correto:
--   1. Criar mig 157 forward com CREATE OR REPLACE FUNCTION + ajustes
--      de constraint que desejar.
--   2. Aplicar mig 157 + repair tracker.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  RAISE NOTICE
    'mig 156 DOWN é NO-OP defensivo · rollback exige forward migration nova';
END $$;

COMMIT;
