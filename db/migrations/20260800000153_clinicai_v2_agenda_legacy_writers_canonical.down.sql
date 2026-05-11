-- ============================================================================
-- Migration 153 · DOWN · NO-OP defensivo
-- ============================================================================
--
-- Forward-only. Rollback DEVE ser feito via FORWARD migration nova.
--
-- Por que NO-OP:
--   - Restaurar versão anterior de appt_upsert/appt_sync_batch reintroduziria
--     o bug de schema (referencias a patient_name/patient_phone/professional_idx/
--     room_idx que não existem) · operadoras voltariam a salvar em localStorage
--     mas não no banco.
--   - As versões antigas não estão versionadas localmente (drift histórico).
--   - Dropar as funções deixaria o legacy schedule-modal.js sem RPC alvo ·
--     UI antiga quebraria visível.
--
-- Rollback correto:
--   1. Criar mig 154 forward com CREATE OR REPLACE FUNCTION restaurando a
--      versão desejada.
--   2. Aplicar mig 154 + repair tracker.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  RAISE NOTICE
    'mig 153 DOWN é NO-OP defensivo · rollback exige forward migration nova (não revert)';
END $$;

COMMIT;
